"""Opening a deck, plus the few things python-pptx has no public API for.

This is the ONLY module that touches raw XML (`_element`, XPath). Keeping it
here limits the damage when python-pptx internals change.
"""
from __future__ import annotations

import io
import re
from pathlib import Path
from typing import BinaryIO

from pptx import Presentation
from pptx.presentation import Presentation as PresentationType

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


def inherited_bullet(shape, level: int) -> str | None:
    """Bullet setting a placeholder inherits for a paragraph level:
    'none' / 'on' from the layout placeholder, then the master placeholder,
    else None. (Placeholders often get "no bullets" from their layout.)"""
    current = shape
    for _ in range(2):  # slide → layout → master
        base = getattr(current, "_base_placeholder", None)
        if base is None:
            return None
        lvl = base._element.find(f".//{{{NS['a']}}}lstStyle/{{{NS['a']}}}lvl{level + 1}pPr")  # noqa: SLF001
        if lvl is not None:
            if lvl.find(f"{{{NS['a']}}}buNone") is not None:
                return "none"
            if lvl.find(f"{{{NS['a']}}}buChar") is not None or lvl.find(f"{{{NS['a']}}}buAutoNum") is not None:
                return "on"
        current = base
    return None


def bullet_setting(paragraph) -> str | None:
    """'none' when bullets are explicitly off, 'on' when explicitly on, else None (inherited)."""
    ppr = paragraph._p.pPr  # noqa: SLF001
    if ppr is None:
        return None
    if ppr.find(f"{{{NS['a']}}}buNone") is not None:
        return "none"
    if ppr.find(f"{{{NS['a']}}}buChar") is not None or ppr.find(f"{{{NS['a']}}}buAutoNum") is not None:
        return "on"
    return None
