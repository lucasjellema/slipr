"""Layout choice and slot filling, on hand-made intermediate models."""
from __future__ import annotations

import json

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


def role_template(template):
    """The default template plus 0.2 roles, shaped like the Conclusion template."""
    t = json.loads(json.dumps(template))
    t["slipr"] = "0.2"
    t["pptxIgnore"] = [16, 85, 91]
    t["pptxMapping"]["Title slide (wave)"] = {"layout": "title", "placeholders": {"0": None, "36": "title", "35": "byline"}}
    t["pptxMapping"]["Text"] = {"layout": "bullets", "placeholders": {"0": "title", "13": "body", "35": None}}
    return t


def body_at(md, idx, is_list=False):
    return TextBody(markdown=md, is_list=is_list, placeholder="body", idx=idx)


def test_roles_put_content_in_the_named_slots(template):
    t = role_template(template)
    model = sm(index=0, layout_name="Title slide (wave)", title="Title slide (wave)", title_idx=0,
               bodies=[body_at("QUARTERLY REVIEW", 36), body_at("*Jane Doe*", 35), body_at("BUSINESS DONE DIFFERENTLY", 16)])
    mapped = map_slide(model, "s-01", t, images=[])
    assert mapped.layout == "title"
    assert mapped.slide["content"] == {"title": "QUARTERLY REVIEW", "byline": "Jane Doe"}
    assert "reader" not in mapped.slide, "footer (idx 16) and the off-slide title (idx 0) are ignored, not moved"
    assert not any("no title" in r for r in mapped.remarks)


def test_roles_with_ignored_logo_picture(template):
    t = role_template(template)
    logo = ImageRef(blob=b"x", ext="png", sha1="logo", alt="", idx=91)
    model = sm(layout_name="Text", title="Highlights", title_idx=0,
               bodies=[body_at("Context", 35), body_at("- a\n- b", 13, is_list=True)], images=[logo])
    mapped = map_slide(model, "s-02", t, images=["images/logo.png"])
    assert mapped.layout == "bullets"
    assert mapped.slide["content"] == {"title": "Highlights", "body": "- a\n- b"}
    assert "reader" not in mapped.slide
    assert not any("alt text" in r for r in mapped.remarks), "the ignored logo is not reported"


def test_unmapped_layouts_still_drop_template_wide_ignores(template):
    t = role_template(template)
    model = sm(layout_name="Something else", title="T", title_idx=0,
               bodies=[body_at("- point", 2, is_list=True), body_at("FOOTER", 16)])
    mapped = map_slide(model, "s-03", t, images=[])
    assert mapped.slide["content"]["body"] == "- point"
    assert "reader" not in mapped.slide


def test_an_explicit_role_overrides_the_template_wide_ignore(template):
    t = role_template(template)
    t["pptxMapping"]["Facts"] = {"layout": "bullets", "placeholders": {"0": "title", "91": "body"}}
    model = sm(layout_name="Facts", title="Facts", title_idx=0, bodies=[body_at("3.000+ colleagues", 91)])
    mapped = map_slide(model, "s-05", t, images=[])
    assert mapped.slide["content"]["body"] == "3.000+ colleagues"


def cards_template(template):
    t = role_template(template)
    t["layouts"].append({
        "id": "cards4", "name": "Cards", "file": "layouts/bullets.html",
        "slots": [
            {"name": "title", "type": "text"},
            {"name": "cards", "type": "cards", "maxItems": 4, "fields": [
                {"name": "image", "type": "image"},
                {"name": "title", "type": "text"},
                {"name": "text", "type": "richtext"},
            ]},
        ],
    })
    t["pptxMapping"]["Four columns"] = {"layout": "cards4", "placeholders": {
        "0": "title", "13": "cards[0]", "14": "cards[1]", "20": "cards[0].image", "21": "cards[1].title"}}
    return t


def test_card_roles_fill_cards(template):
    t = cards_template(template)
    pic = ImageRef(blob=b"x", ext="png", sha1="p", alt="A photo", idx=20)
    model = sm(layout_name="Four columns", title="Columns", title_idx=0, images=[pic], bodies=[
        body_at("**First**\n\nIntro line\n\n- bullet a\n- bullet b", 13),
        body_at("Second title", 21),  # field role first, so the whole-card fill only finds 'text' free
        body_at("Second card text", 14),
    ])
    mapped = map_slide(model, "s-06", t, images=["images/p.png"])
    assert mapped.layout == "cards4"
    assert mapped.slide["content"]["cards"] == [
        {"title": "First", "text": "Intro line\n\n- bullet a\n- bullet b", "image": {"src": "images/p.png", "alt": "A photo"}},
        {"title": "Second title", "text": "Second card text"},
    ]
    assert "reader" not in mapped.slide


def test_empty_cards_are_dropped(template):
    t = cards_template(template)
    model = sm(layout_name="Four columns", title="Columns", title_idx=0, bodies=[body_at("Only one", 14)])
    mapped = map_slide(model, "s-07", t, images=[])
    assert mapped.slide["content"]["cards"] == [{"title": "Only one"}]


def test_role_for_unknown_slot_is_reported(template):
    t = role_template(template)
    t["pptxMapping"]["Text"]["placeholders"]["13"] = "nope"
    model = sm(layout_name="Text", title="T", title_idx=0, bodies=[body_at("- a", 13, is_list=True)])
    mapped = map_slide(model, "s-04", t, images=[])
    assert any("unknown slot" in r for r in mapped.remarks)
    assert mapped.slide["content"]["body"] == "- a", "falls back to generic filling"


def test_markdown_to_plain():
    assert markdown_to_plain("**Bold** and *it* [link](https://x.y) \\*star\\*") == "Bold and it link *star*"
