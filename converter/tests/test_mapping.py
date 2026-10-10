"""Layout choice and slot filling, on hand-made intermediate models."""
from __future__ import annotations

from slipr_convert.mapping import choose_layout, map_slide, markdown_to_plain
from slipr_convert.model import ImageRef, SlideModel, TextBody


def sm(**kw) -> SlideModel:
    base = dict(index=3, slide_id=300, layout_name="Custom")
    base.update(kw)
    return SlideModel(**base)


def body(md: str, is_list: bool = True) -> TextBody:
    return TextBody(markdown=md, is_list=is_list, placeholder="body")


IMG = ImageRef(blob=b"x", ext="png", sha1="abc", alt="A chart")


def test_best_fit(template):
    assert choose_layout(sm(title="T", bodies=[body("- a")]), template)[0] == "bullets"
    assert choose_layout(sm(title="T", bodies=[body("- a"), body("- b")]), template)[0] == "two-column"
    assert choose_layout(sm(title="T", images=[IMG]), template)[0] == "image-full"
    assert choose_layout(sm(title="T", bodies=[body("- a")], images=[IMG]), template)[0] == "image-full"
    assert choose_layout(sm(index=0, title="T"), template)[0] == "title"
    assert choose_layout(sm(title="T"), template)[0] == "section"


def test_explicit_mapping_wins_unless_it_would_drop_pictures(template):
    assert choose_layout(sm(layout_name="Two Content", title="T", bodies=[body("- a")]), template)[0] == "two-column"
    custom = {"Custom": "section"}
    assert choose_layout(sm(title="T", bodies=[body("- a")]), template, custom)[0] == "section"
    # Mapping says bullets, but the slide has a picture: best fit instead
    layout, reason = choose_layout(sm(layout_name="Title and Content", title="T", images=[IMG]), template)
    assert layout == "image-full" and "best fit" in reason


def test_leftovers_go_to_the_reader_layer(template):
    long_text = "- " + "word " * 60
    mapped = map_slide(sm(title="Photo", bodies=[body(long_text)], images=[IMG, IMG]), "s-04", template,
                       images=["images/a.png", "images/b.png"])
    assert mapped.layout == "image-full"
    assert mapped.slide["content"]["image"]["src"] == "images/a.png"
    blocks = mapped.slide["reader"]["blocks"]
    assert [b["type"] for b in blocks] == ["text", "image"]
    assert blocks[1]["image"]["src"] == "images/b.png"
    assert len(mapped.moved) == 2


def test_more_bodies_than_slots_merge_into_the_last(template):
    mapped = map_slide(sm(title="T", bodies=[body("- a"), body("- b"), body("- c")]), "s-05", template, images=[])
    assert mapped.layout == "two-column"
    assert mapped.slide["content"]["left"] == "- a"
    assert mapped.slide["content"]["right"] == "- b\n\n- c"


def test_markdown_to_plain():
    assert markdown_to_plain("**Bold** and *it* [link](https://x.y) \\*star\\*") == "Bold and it link *star*"
