"""Fixture decks, generated in code with python-pptx.

Uses python-pptx's built-in default template, whose layouts are named
"Title Slide", "Title and Content", "Section Header", "Two Content",
"Comparison", "Title Only", "Blank", "Content with Caption",
"Picture with Caption", the same names as PowerPoint's defaults.
"""
from __future__ import annotations

import io
import json
import struct
import uuid
import zlib
from pathlib import Path

import pytest
from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import PP_PLACEHOLDER
from pptx.util import Inches

REPO = Path(__file__).resolve().parents[2]
P = "http://schemas.openxmlformats.org/presentationml/2006/main"
P14 = "http://schemas.microsoft.com/office/powerpoint/2010/main"


def png(rgb: tuple[int, int, int], w: int = 4, h: int = 3) -> bytes:
    """A tiny valid PNG of one colour."""
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def layout(prs, name: str):
    return next(l for l in prs.slide_layouts if l.name == name)


def placeholder(slide, *types):
    return next(ph for ph in slide.placeholders if ph.placeholder_format.type in types)


def set_alt(shape, text: str) -> None:
    for el in shape._element.iter(f"{{{P}}}cNvPr"):
        el.set("descr", text)
        return


A = "http://schemas.openxmlformats.org/drawingml/2006/main"


def add_picture_effect(pic, effect: str) -> None:
    """Give a picture a PowerPoint effect, as PowerPoint writes it (I-084):
    'shadow', 'softEdges', 'roundedCorners' or 'border'."""
    sp_pr = pic._element.spPr
    if effect in ("shadow", "softEdges"):
        lst = sp_pr.find(f"{{{A}}}effectLst")
        if lst is None:
            lst = etree.SubElement(sp_pr, f"{{{A}}}effectLst")
        if effect == "shadow":
            shadow = etree.SubElement(lst, f"{{{A}}}outerShdw", blurRad="76200", dist="38100", dir="5400000")
            color = etree.SubElement(shadow, f"{{{A}}}srgbClr", val="000000")
            etree.SubElement(color, f"{{{A}}}alpha", val="40000")
        else:
            etree.SubElement(lst, f"{{{A}}}softEdge", rad="63500")
    elif effect == "roundedCorners":
        sp_pr.find(f"{{{A}}}prstGeom").set("prst", "roundRect")
    elif effect == "border":
        pic.line.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        pic.line.width = Inches(0.05)


def set_transparency(pic, percent: int) -> None:
    """PowerPoint's picture transparency: <a:alphaModFix amt> on the image."""
    blip = pic._element.find(f".//{{{A}}}blip")
    etree.SubElement(blip, f"{{{A}}}alphaModFix", amt=str((100 - percent) * 1000))


def add_build_animation(slide) -> None:
    """Minimal <p:timing> with a paragraph build, as PowerPoint writes for bullets."""
    body = next(sh for sh in slide.placeholders if sh.placeholder_format.type != PP_PLACEHOLDER.TITLE)
    spid = body.shape_id
    timing = etree.SubElement(slide._element, f"{{{P}}}timing")
    bld_lst = etree.SubElement(timing, f"{{{P}}}bldLst")
    etree.SubElement(bld_lst, f"{{{P}}}bldP", spid=str(spid), grpId="0", build="p")


def add_sections(prs, sections: list[tuple[str, list]]) -> None:
    root = prs.part._element
    ext_lst = root.find(f"{{{P}}}extLst")
    if ext_lst is None:
        ext_lst = etree.SubElement(root, f"{{{P}}}extLst")
    ext = etree.SubElement(ext_lst, f"{{{P}}}ext", uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}")
    sec_lst = etree.SubElement(ext, f"{{{P14}}}sectionLst", nsmap={"p14": P14})
    for name, slides in sections:
        sec = etree.SubElement(sec_lst, f"{{{P14}}}section", name=name, id="{" + str(uuid.uuid4()).upper() + "}")
        ids = etree.SubElement(sec, f"{{{P14}}}sldIdLst")
        for slide in slides:
            etree.SubElement(ids, f"{{{P14}}}sldId", id=str(slide.slide_id))


def build_sample_deck() -> bytes:
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)  # 16:9
    prs.core_properties.title = "Quarterly Review"
    prs.core_properties.author = "Test Author"

    # 1. Title slide
    s1 = prs.slides.add_slide(layout(prs, "Title Slide"))
    s1.shapes.title.text = "Quarterly Review"
    placeholder(s1, PP_PLACEHOLDER.SUBTITLE).text = "Q3 2026"

    # 2. Bullets with levels, bold, italic, a link, notes, build animation
    s2 = prs.slides.add_slide(layout(prs, "Title and Content"))
    s2.shapes.title.text = "Highlights"
    tf = placeholder(s2, PP_PLACEHOLDER.OBJECT, PP_PLACEHOLDER.BODY).text_frame
    p = tf.paragraphs[0]
    r = p.add_run(); r.text = "Revenue "
    r = p.add_run(); r.text = "up"; r.font.bold = True
    p2 = tf.add_paragraph(); p2.level = 1
    r = p2.add_run(); r.text = "in "
    r = p2.add_run(); r.text = "all"; r.font.italic = True
    r = p2.add_run(); r.text = " regions"
    p3 = tf.add_paragraph()
    r = p3.add_run(); r.text = "See report"; r.hyperlink.address = "https://example.com/report"
    p4 = tf.add_paragraph(); p4.text = "Costs *stable* [flat]"  # literal Markdown characters
    s2.notes_slide.notes_text_frame.text = "Mention the new team."
    add_build_animation(s2)

    # 3. Section header (its body has no bullets via the layout)
    s3 = prs.slides.add_slide(layout(prs, "Section Header"))
    s3.shapes.title.text = "Details"
    placeholder(s3, PP_PLACEHOLDER.BODY).text = "The numbers behind it"

    # 4. Two content
    s4 = prs.slides.add_slide(layout(prs, "Two Content"))
    s4.shapes.title.text = "Before and after"
    bodies = [ph for ph in s4.placeholders if ph.placeholder_format.type != PP_PLACEHOLDER.TITLE]
    bodies[0].text_frame.text = "Manual work"
    bodies[1].text_frame.text = "Automated"

    # 5. Picture with caption (picture placeholder, alt text)
    s5 = prs.slides.add_slide(layout(prs, "Picture with Caption"))
    s5.shapes.title.text = "Our office"
    pic = placeholder(s5, PP_PLACEHOLDER.PICTURE).insert_picture(io.BytesIO(png((200, 30, 30))))
    set_alt(pic, "The office building at sunrise")
    add_picture_effect(pic, "shadow")      # → picture style "shadow" (I-084)
    set_transparency(pic, 30)              # → opacity 0.7
    placeholder(s5, PP_PLACEHOLDER.BODY).text = "Amsterdam, 2026"

    # 6. Blank slide with a text box and a picture without alt text
    s6 = prs.slides.add_slide(layout(prs, "Blank"))
    box = s6.shapes.add_textbox(Inches(1), Inches(6), Inches(6), Inches(1))
    box.text_frame.text = "Free text box"
    s6.shapes.add_picture(io.BytesIO(png((30, 30, 200))), Inches(1), Inches(1), Inches(4), Inches(3))
    # …and a second picture that fits no image slot: an extra image at its place (I-083)
    logo = s6.shapes.add_picture(io.BytesIO(png((30, 160, 60))), Inches(7.5), Inches(5.5), Inches(2), Inches(1.5))
    set_alt(logo, "Company logo")

    # 7. A table (not converted)
    s7 = prs.slides.add_slide(layout(prs, "Title Only"))
    s7.shapes.title.text = "A table"
    s7.shapes.add_table(2, 2, Inches(1), Inches(2), Inches(6), Inches(2))

    # 8. A hidden backup slide
    s8 = prs.slides.add_slide(layout(prs, "Title and Content"))
    s8.shapes.title.text = "Backup"
    placeholder(s8, PP_PLACEHOLDER.OBJECT, PP_PLACEHOLDER.BODY).text = "Extra numbers"
    s8._element.set("show", "0")

    add_sections(prs, [("Intro", [s1, s2]), ("Main part", [s3, s4, s5, s6, s7, s8])])
    out = io.BytesIO()
    prs.save(out)
    return out.getvalue()


@pytest.fixture(scope="session")
def sample_deck() -> bytes:
    return build_sample_deck()


@pytest.fixture(scope="session")
def template() -> dict:
    return json.loads((REPO / "templates" / "default" / "template.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def converted(sample_deck, template):
    from slipr_convert import convert

    return convert(sample_deck, template, template_ref="../../templates/default", show_id="sample", source_name="sample.pptx")
