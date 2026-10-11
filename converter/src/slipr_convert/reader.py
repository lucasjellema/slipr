"""Opening a deck, plus the few things python-pptx has no public API for.

This is the ONLY module that touches raw XML (`_element`, XPath). Keeping it
here limits the damage when python-pptx internals change.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from pptx import Presentation
from pptx.enum.shapes import PP_PLACEHOLDER
from pptx.presentation import Presentation as PresentationType

_TITLE_TYPES = {PP_PLACEHOLDER.TITLE, PP_PLACEHOLDER.CENTER_TITLE, PP_PLACEHOLDER.VERTICAL_TITLE}

P14 = "http://schemas.microsoft.com/office/powerpoint/2010/main"
NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p14": P14,
}

Source = str | Path | bytes | BinaryIO


class ReadError(Exception):
    """The file could not be opened as a PowerPoint deck."""


def open_presentation(source: Source) -> PresentationType:
    try:
        if isinstance(source, (bytes, bytearray)):
            return Presentation(io.BytesIO(source))
        return Presentation(source)
    except Exception as err:  # python-pptx raises several kinds; all mean "not a deck"
        raise ReadError(f"Not a readable .pptx file: {err}") from err


def sections(prs: PresentationType) -> list[tuple[str, list[int]]]:
    """PowerPoint sections (p14:sectionLst) as (name, [slide ids])."""
    root = prs.part._element  # noqa: SLF001 - documented exception, see module docstring
    result = []
    for section in root.findall(f".//{{{P14}}}section"):
        ids = [int(s.get("id")) for s in section.findall(f".//{{{P14}}}sldId")]
        result.append((section.get("name") or "Section", ids))
    return result


def is_hidden(slide) -> bool:
    return slide._element.get("show") == "0"  # noqa: SLF001


_FILE_NAME = re.compile(r"[\w\-. ()]+\.(png|jpe?g|gif|bmp|svg|emf|wmf|tiff?|webp)", re.I)
# Office's automatic descriptions carry a disclaimer like these (NL / EN / DE).
_AUTO_ALT = re.compile(
    r"(door ai gegenereerde inhoud|ai-generated content may be incorrect|automatisch gegenereerde beschrijving"
    r"|description automatically generated|ki-generierte inhalte)", re.I)


def alt_text(shape) -> str:
    """The picture's description (alt text), or '' when there is none.

    Counted as missing, because they are not real descriptions:
    - a bare file name ("image.png", "IMG_0042.JPG"), which tools fill in;
    - Office's automatic description ("Afbeelding met … Door AI gegenereerde
      inhoud is mogelijk onjuist.").
    """
    for el in shape._element.iter(f"{{{NS['p']}}}cNvPr"):  # noqa: SLF001
        descr = (el.get("descr") or "").strip()
        if _FILE_NAME.fullmatch(descr) or _AUTO_ALT.search(descr):
            return ""
        return descr
    return ""


# Picture effects the converter can map to template picture styles (I-084),
# in order of precedence when a picture has several.
PICTURE_EFFECTS = ("shadow", "softEdges", "roundedCorners", "border")


def picture_effects(shape) -> tuple[list[str], float | None]:
    """A picture's effects (a subset of PICTURE_EFFECTS, in that order) and its
    opacity from the picture's transparency (None when opaque).

    Read from the picture's own shape properties: an outer shadow and soft
    edges in `a:effectLst`, a rounded-rectangle geometry, a visible outline
    (`a:ln` with a fill), and `a:alphaModFix` on the image. Effects that come
    only from a theme style reference are not seen.
    """
    el = shape._element  # noqa: SLF001
    sp_pr = el.find("p:spPr", NS)
    found: set[str] = set()
    if sp_pr is not None:
        if sp_pr.find("a:effectLst/a:outerShdw", NS) is not None:
            found.add("shadow")
        soft = sp_pr.find("a:effectLst/a:softEdge", NS)
        if soft is not None and int(soft.get("rad") or 0) > 0:
            found.add("softEdges")
        geom = sp_pr.find("a:prstGeom", NS)
        if geom is not None and geom.get("prst") in {"roundRect", "round2SameRect", "round1Rect", "snipRoundRect"}:
            found.add("roundedCorners")
        line = sp_pr.find("a:ln", NS)
        if line is not None and line.find("a:noFill", NS) is None and (
            line.find("a:solidFill", NS) is not None or line.find("a:gradFill", NS) is not None
        ):
            found.add("border")
    opacity = None
    alpha = el.find(".//a:blip/a:alphaModFix", NS)
    if alpha is not None:
        amt = int(alpha.get("amt") or 100000)
        if amt < 100000:
            opacity = round(max(0, amt) / 100000, 2)
    return [e for e in PICTURE_EFFECTS if e in found], opacity


def has_build_animations(slide) -> bool:
    """True when the slide has build steps (e.g. bullets appearing one by one)."""
    timing = slide._element.find(f"{{{NS['p']}}}timing")  # noqa: SLF001
    return timing is not None and timing.find(f".//{{{NS['p']}}}bldP") is not None


def graphic_kind(shape) -> str | None:
    """'table' / 'chart' / 'smartArt' / 'media' / 'ole' for graphic frames, else None."""
    el = shape._element  # noqa: SLF001
    data = el.find(f".//{{{NS['a']}}}graphicData")
    if data is None:
        return None
    uri = data.get("uri") or ""
    if uri.endswith("/table"):
        return "table"
    if uri.endswith("/chart"):
        return "chart"
    if "diagram" in uri:
        return "smartArt"
    if "ole" in uri:
        return "embedded object"
    return "graphic"


def paragraph_parts(paragraph):
    """Yield ('run', run) and ('break', None) in document order.

    python-pptx's `paragraph.runs` drops line breaks (<a:br>); we need them.
    """
    from pptx.text.text import _Run  # local: private class, used for wrapping only

    for child in paragraph._p:  # noqa: SLF001
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "r":
            yield "run", _Run(child, paragraph)
        elif tag == "br":
            yield "break", None
        elif tag == "fld":  # fields such as slide numbers / dates: keep their text
            yield "run", _Run(child, paragraph)


@dataclass
class ParaStyle:
    """The effective style of a paragraph, as far as Slipr cares.

    bullet: 'none' | 'char' | 'upper' (A.) | 'lower' (a.) | 'number' (1.) | None (unknown)
    """

    bullet: str | None = None
    bold: bool = False
    caps: bool = False
    serif: bool = False


def paragraph_style(shape, paragraph) -> ParaStyle:
    """Resolve a paragraph's bullet / bold / caps / serif settings along the
    PowerPoint inheritance chain: the paragraph itself, then the layout
    placeholder, the master placeholder and the master's body text style.

    Corporate templates use outline levels as text styles (e.g. level 5 =
    intro line, 6 = bold capitals subheading, 8 = A. list), so this matters.
    """
    level = paragraph.level
    chain = [paragraph._p.pPr]  # noqa: SLF001
    if shape.is_placeholder:
        current = shape
        for _ in range(2):  # slide → layout → master placeholder
            base = getattr(current, "_base_placeholder", None)
            if base is None:
                break
            chain.append(base._element.find(f".//{{{NS['a']}}}lstStyle/{{{NS['a']}}}lvl{level + 1}pPr"))  # noqa: SLF001
            current = base
        if shape.placeholder_format.type not in _TITLE_TYPES:
            master = _master_of(shape)
            if master is not None:
                chain.append(master._element.find(  # noqa: SLF001
                    f"{{{NS['p']}}}txStyles/{{{NS['p']}}}bodyStyle/{{{NS['a']}}}lvl{level + 1}pPr"))

    style = ParaStyle()
    found = {"bullet": False, "bold": False, "caps": False, "serif": False}
    a = NS["a"]
    for ppr in chain:
        if ppr is None:
            continue
        if not found["bullet"]:
            if ppr.find(f"{{{a}}}buNone") is not None:
                style.bullet, found["bullet"] = "none", True
            elif (auto := ppr.find(f"{{{a}}}buAutoNum")) is not None:
                kind = auto.get("type") or ""
                style.bullet = "upper" if kind.startswith("alphaUc") else "lower" if kind.startswith("alphaLc") else "number"
                found["bullet"] = True
            elif ppr.find(f"{{{a}}}buChar") is not None:
                style.bullet, found["bullet"] = "char", True
        rpr = ppr.find(f"{{{a}}}defRPr")
        if rpr is not None:
            if not found["bold"] and rpr.get("b") is not None:
                style.bold, found["bold"] = rpr.get("b") == "1", True
            if not found["caps"] and rpr.get("cap") is not None:
                style.caps, found["caps"] = rpr.get("cap") == "all", True
            latin = rpr.find(f"{{{a}}}latin")
            if not found["serif"] and latin is not None and latin.get("typeface"):
                face = latin.get("typeface")
                style.serif, found["serif"] = ("serif" in face.lower() and "sans" not in face.lower()), True
    return style


def _master_of(shape):
    try:
        return shape.part.slide.slide_layout.slide_master
    except AttributeError:
        return None
