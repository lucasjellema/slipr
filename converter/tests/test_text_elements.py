"""Text boxes and shapes → text elements (I-089, D-016)."""
from __future__ import annotations

from lxml import etree

from slipr_convert import reader
from slipr_convert.mapping import _font_role, _inline_text, map_slide
from slipr_convert.model import ImageRef, SlideModel, TextBody, TextLook

SLIDE = (12192000, 6858000)  # 13.333 x 7.5 in, 16:9
A = "http://schemas.openxmlformats.org/drawingml/2006/main"


def slide(converted, n: int) -> dict:
    return converted.show["slides"][n - 1]


def test_a_badge_and_a_theme_styled_shape_become_text_elements(converted):
    s = slide(converted, 2)
    assert s["content"]["body"].startswith("- Revenue"), "the bullets still fill the body slot"
    badge, draft = s["overlays"]
    assert badge == {
        "text": "New",
        "style": {"size": 1.46, "uppercase": True, "align": "center", "valign": "middle", "color": "#FFFFFF",
                  "background": "#BC448C", "radius": 0.75, "padding": 0.75},
        "x": 0.75, "y": 0.0667, "w": 0.15, "h": 0.08,
    }
    # python-pptx's default theme: accent 1 fill and outline, white (lt1) text; an oval becomes a pill
    assert draft["text"] == "Draft"
    assert draft["style"] | {"borderWidth": None} == {"valign": "middle", "color": "#FFFFFF", "background": "#4F81BD",
                                                    "borderWidth": None, "borderColor": "#4F81BD", "radius": 3.75, "padding": 0.75}
    assert converted.report.slides[1].placed == ["text box “New”", "text box “Draft”"]
    assert "reader" not in s


def test_the_plain_text_box_on_a_blank_slide_still_fills_the_caption(converted):
    s = slide(converted, 6)
    assert s["content"]["caption"] == "Free text box"
    assert all("image" in o for o in s["overlays"])


def _box(md: str, look: TextLook | None, **kw) -> TextBody:
    base = dict(markdown=md, is_list=md.startswith("- "), placeholder=None, top=600000, left=600000,
                width=3048000, height=1371600, look=look)
    base.update(kw)
    return TextBody(**base)


def _sm(**kw) -> SlideModel:
    return SlideModel(index=3, slide_id=300, layout_name="Custom", **kw)


PHOTO = ImageRef(blob=b"a", ext="png", sha1="a", alt="Photo", width=6096000, height=3429000)


def test_a_leftover_text_box_becomes_a_text_element(template):
    long_text = "First line of a long note\n\n- one point\n- another point"
    mapped = map_slide(_sm(title="Photo", images=[PHOTO], bodies=[_box(long_text, TextLook(size_pt=18, inset=0))]),
                       "s-04", template, images=["images/a.png"], slide_size=SLIDE)
    assert mapped.layout == "image-full"
    [overlay] = mapped.slide["overlays"]
    assert overlay["text"] == "First line of a long note\n• one point\n• another point"
    assert overlay["style"] == {"size": 1.88}
    assert (overlay["x"], overlay["y"], overlay["w"], overlay["h"]) == (0.0492, 0.0875, 0.25, 0.2)
    assert "reader" not in mapped.slide


def test_without_a_slide_size_text_goes_to_the_reader_layer_as_before(template):
    long_text = "First line of a long note\n\n- one point\n- another point"
    badge = TextLook(fill="#000000")
    mapped = map_slide(_sm(title="Photo", images=[PHOTO], bodies=[_box(long_text, TextLook()), _box("Hi", badge)]),
                       "s-04", template, images=["images/a.png"])
    assert "overlays" not in mapped.slide
    assert mapped.placed == []
    assert any(b["type"] == "text" for b in mapped.slide["reader"]["blocks"]) or "Hi" in str(mapped.slide["content"])


def test_text_elements_are_in_front_of_extra_images(template):
    logo = ImageRef(blob=b"b", ext="png", sha1="b", alt="Logo", top=6000000, left=10972800, width=1219200, height=685800)
    label = _box("Label", TextLook(fill="#FFFFFF"), top=100, left=100)
    mapped = map_slide(_sm(title="Photo", images=[PHOTO, logo], bodies=[label]), "s-04", template,
                       images=["images/a.png", "images/b.png"], slide_size=SLIDE)
    assert ["image" in o for o in mapped.slide["overlays"]] == [True, False]


def test_fonts_map_to_the_template_first(template):
    conclusion = {"heading": "Arial Black (uppercase)", "body": "Arial", "quote": "Source Serif 4"}
    assert _font_role(None, conclusion) == "body"
    assert _font_role("+mj-lt", conclusion) == "heading"
    assert _font_role("+mn-lt", conclusion) == "body"
    assert _font_role("Arial Black", conclusion) == "heading"
    assert _font_role("Arial", conclusion) == "body"
    assert _font_role("Consolas", conclusion) == "mono"
    assert _font_role("Georgia", conclusion) == "serif"
    assert _font_role("Microsoft Sans Serif", conclusion) == "body"
    assert _font_role("Calibri", conclusion) == "body", "an unknown sans font: the template's body font"


def test_inline_text():
    assert _inline_text("**Title**\n\nLine one\nLine two\n\n- a\n  - b") == "**Title**\nLine one\nLine two\n• a\n• b"


def test_color_modifiers():
    theme = reader._Theme({"accent1": "#4F81BD", "lt1": "#FFFFFF", "dk1": "#000000"}, {})

    def color(xml: str):
        return reader._color(etree.fromstring(f'<a:solidFill xmlns:a="{A}">{xml}</a:solidFill>'), theme)

    assert color('<a:srgbClr val="ffffff"><a:lumMod val="50000"/></a:srgbClr>') == ("#808080", None)
    assert color('<a:schemeClr val="bg1"/>') == ("#FFFFFF", None)
    assert color('<a:schemeClr val="tx1"><a:lumMod val="75000"/><a:lumOff val="25000"/></a:schemeClr>') == ("#404040", None)
    assert color('<a:srgbClr val="BC448C"><a:alpha val="60000"/></a:srgbClr>') == ("#BC448C", 0.6)
    assert color('<a:srgbClr val="FF0000"><a:shade val="50000"/></a:srgbClr>') == ("#800000", None)
    assert color('<a:prstClr val="white"/>') == ("#FFFFFF", None)
    assert color('<a:schemeClr val="accent9"/>') == (None, None)
