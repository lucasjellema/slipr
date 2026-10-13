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

from .model import TextLook

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


# ---------------------------------------------------------------------------
# The look of a text box or shape with text (I-089, D-016)

_ALIGN = {"ctr": "center", "r": "right"}
_ANCHOR = {"ctr": "middle", "b": "bottom"}
_DASH_DOTTED = {"dot", "sysDot"}
_PRESET_COLORS = {"white": "#FFFFFF", "black": "#000000", "red": "#FF0000", "blue": "#0000FF", "green": "#008000",
                  "yellow": "#FFFF00", "gray": "#808080", "grey": "#808080"}
# The usual color map of a master (p:clrMap): bg1 → lt1, tx1 → dk1, …
_CLR_MAP = {"bg1": "lt1", "tx1": "dk1", "bg2": "lt2", "tx2": "dk2"}


def text_look(shape) -> TextLook:
    """The look of a text box or shape with text, read from its own XML and
    the theme (scheme colors, the line widths of style references). Effects
    (shadows, glow, 3-D) and gradients beyond their first color are not seen."""
    el = shape._element  # noqa: SLF001
    a = NS["a"]
    theme = _theme(shape)
    look = TextLook()
    sp_pr = el.find("p:spPr", NS)
    style = el.find("p:style", NS)

    # Fill: the shape's own, else the style reference's color (fillRef idx 0 = none).
    own_fill = _fill_of(sp_pr) if sp_pr is not None else None
    if own_fill == "none":
        pass
    elif own_fill is not None:
        look.fill, look.fill_alpha = _color(own_fill, theme)
    elif style is not None and (ref := style.find("a:fillRef", NS)) is not None and int(ref.get("idx") or 0) > 0:
        look.fill, look.fill_alpha = _color(ref, theme)

    # Line: the shape's own, else the style reference (lnRef idx → the theme's line style width).
    line = sp_pr.find("a:ln", NS) if sp_pr is not None else None
    line_fill = _fill_of(line) if line is not None else None
    if line_fill not in (None, "none"):
        look.line_color, _ = _color(line_fill, theme)
        look.line_width = int(line.get("w") or 12700)
    elif line_fill is None and style is not None and (ref := style.find("a:lnRef", NS)) is not None and int(ref.get("idx") or 0) > 0:
        look.line_color, _ = _color(ref, theme)
        look.line_width = int(line.get("w")) if line is not None and line.get("w") else theme.line_widths.get(int(ref.get("idx")), 9525)
    if line is not None and look.line_width and (dash := line.find("a:prstDash", NS)) is not None and dash.get("val") not in (None, "solid"):
        look.line_dash = "dotted" if dash.get("val") in _DASH_DOTTED else "dashed"

    # Rounded corners: roundRect's adjust value is a fraction (×100000) of the shorter side.
    geom = sp_pr.find("a:prstGeom", NS) if sp_pr is not None else None
    short = min(int(shape.width or 0), int(shape.height or 0))
    if geom is not None and geom.get("prst") == "roundRect":
        adj = 16667
        for gd in geom.findall("a:avLst/a:gd", NS):
            if gd.get("name") == "adj" and (m := re.match(r"val\s+(\d+)", gd.get("fmla") or "")):
                adj = int(m.group(1))
        look.corner = int(short * min(adj, 50000) / 100000)
    elif geom is not None and geom.get("prst") in {"ellipse", "flowChartTerminator"}:
        look.corner = short // 2  # the closest box: a pill

    # Text body: anchor, inset, first paragraph's alignment, the runs' font.
    body_pr = el.find("p:txBody/a:bodyPr", NS)
    if body_pr is not None:
        look.anchor = _ANCHOR.get(body_pr.get("anchor") or "")
        if body_pr.get("lIns") is not None:
            look.inset = int(body_pr.get("lIns"))
    first_ppr = el.find("p:txBody/a:p/a:pPr", NS)
    if first_ppr is not None:
        look.align = _ALIGN.get(first_ppr.get("algn") or "")
    run_props = [r for r in el.iterfind(f".//{{{a}}}r/{{{a}}}rPr")]
    runs = len(el.findall(f".//{{{a}}}r"))
    for rpr in run_props:
        if look.size_pt is None and rpr.get("sz"):
            look.size_pt = int(rpr.get("sz")) / 100
        latin = rpr.find("a:latin", NS)
        if look.typeface is None and latin is not None and latin.get("typeface"):
            look.typeface = latin.get("typeface")
        fill = _fill_of(rpr)
        if look.color is None and fill not in (None, "none"):
            look.color, _ = _color(fill, theme)
    if runs and len(run_props) == runs:
        look.caps = all(r.get("cap") == "all" for r in run_props)
        look.underline = all((r.get("u") or "none") != "none" for r in run_props)
    if style is not None and (font_ref := style.find("a:fontRef", NS)) is not None:
        if look.color is None:
            look.color, _ = _color(font_ref, theme)
        if look.typeface is None and font_ref.get("idx") in ("major", "minor"):
            look.typeface = "+mj-lt" if font_ref.get("idx") == "major" else "+mn-lt"
    return look


def _fill_of(el):
    """The color element of a solid (or the first stop of a gradient) fill
    inside `el`, 'none' for an explicit noFill, or None when not set."""
    if el is None:
        return None
    if el.find("a:noFill", NS) is not None:
        return "none"
    solid = el.find("a:solidFill", NS)
    if solid is not None:
        return solid
    stop = el.find("a:gradFill/a:gsLst/a:gs", NS)
    return stop


@dataclass
class _Theme:
    colors: dict  # scheme name ('accent1', 'lt1', …) → #RRGGBB
    line_widths: dict  # line style index (1-based) → EMU


_THEMES: dict[int, tuple[object, _Theme]] = {}


def _theme(shape) -> _Theme:
    """The slide master's theme colors and line widths (cached per theme part)."""
    from lxml import etree
    from pptx.opc.constants import RELATIONSHIP_TYPE as RT

    master = _master_of(shape)
    try:
        part = master.part.part_related_by(RT.THEME)
    except (AttributeError, KeyError):
        return _Theme({}, {})
    cached = _THEMES.get(id(part))
    if cached is not None and cached[0] is part:  # ids can be reused once a deck is gone
        return cached[1]
    root = etree.fromstring(part.blob)
    colors = {}
    scheme = root.find(".//a:clrScheme", NS)
    for child in scheme if scheme is not None else []:
        name = child.tag.rsplit("}", 1)[-1]
        value = child.find("a:srgbClr", NS)
        sys_clr = child.find("a:sysClr", NS)
        if value is not None and value.get("val"):
            colors[name] = "#" + value.get("val").upper()
        elif sys_clr is not None and sys_clr.get("lastClr"):
            colors[name] = "#" + sys_clr.get("lastClr").upper()
    widths = {i: int(ln.get("w") or 9525) for i, ln in enumerate(root.findall(".//a:fmtScheme/a:lnStyleLst/a:ln", NS), 1)}
    theme = _Theme(colors, widths)
    _THEMES[id(part)] = (part, theme)
    return theme


def _color(holder, theme: _Theme) -> tuple[str | None, float | None]:
    """(#RRGGBB, alpha or None) of the color element inside `holder` (a fill,
    a style reference), with lumMod / lumOff / shade / tint / alpha applied."""
    import colorsys

    for el in holder:
        tag = el.tag.rsplit("}", 1)[-1]
        if tag == "srgbClr":
            base = "#" + (el.get("val") or "000000").upper()
        elif tag == "schemeClr":
            name = el.get("val") or ""
            base = theme.colors.get(_CLR_MAP.get(name, name))
        elif tag == "sysClr":
            base = "#" + (el.get("lastClr") or "000000").upper()
        elif tag == "prstClr":
            base = _PRESET_COLORS.get(el.get("val") or "")
        else:
            continue
        if not base or not re.fullmatch(r"#[0-9A-F]{6}", base):
            return None, None
        r, g, b = (int(base[i:i + 2], 16) / 255 for i in (1, 3, 5))
        alpha = None
        for mod in el:
            kind = mod.tag.rsplit("}", 1)[-1]
            v = int(mod.get("val") or 100000) / 100000
            if kind == "alpha":
                alpha = v if v < 1 else None
            elif kind == "shade":
                r, g, b = r * v, g * v, b * v
            elif kind == "tint":
                r, g, b = (c + (1 - c) * (1 - v) for c in (r, g, b))
            elif kind in ("lumMod", "lumOff"):
                h, lum, s = colorsys.rgb_to_hls(r, g, b)
                lum = lum * v if kind == "lumMod" else lum + v
                r, g, b = colorsys.hls_to_rgb(h, min(1, max(0, lum)), s)
        hex_ = "#" + "".join(f"{round(min(1, max(0, c)) * 255):02X}" for c in (r, g, b))
        return hex_, (round(alpha, 2) if alpha is not None else None)
    return None, None
