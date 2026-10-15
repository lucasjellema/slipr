"""I-121: tables, charts, SmartArt, videos, motion, links, zooms and backgrounds."""
from __future__ import annotations

import json
import shutil

import pytest

from slipr_convert import convert
from slipr_convert.export import export_show
from slipr_convert.validate import validate_show
from slipr_convert.visuals import parse_number, table_value
from .conftest import REPO, js_validate

node = pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not available")


@pytest.fixture(scope="module")
def features(feature_deck, template):
    return convert(feature_deck, template, template_ref="../../templates/default", show_id="features", source_name="features.pptx")


def slide(result, number: int) -> dict:
    return result.show["slides"][number - 1]


# -- numbers and tables ------------------------------------------------------------------------------

@pytest.mark.parametrize("text, expected", [
    ("1200", (1200.0, "number", None, 0)),
    ("1,234.5", (1234.5, "number", None, 1)),
    ("1.234,5", (1234.5, "number", None, 1)),
    ("1.200", (1200.0, "number", None, 0)),
    ("12,5", (12.5, "number", None, 1)),
    ("12,5 %", (12.5, "percent", None, 1)),
    ("-5%", (-5.0, "percent", None, 0)),
    ("€ 1.200", (1200.0, "currency", "EUR", 0)),
    ("$3.50", (3.5, "currency", "USD", 2)),
    ("1 200 EUR", (1200.0, "currency", "EUR", 0)),
    ("−3", (-3.0, "number", None, 0)),
    ("Q1", None), ("", None), ("12a", None), ("1.2.3,4,5", None),
])
def test_parse_number(text, expected):
    assert parse_number(text) == expected


def test_table_value_keeps_text_years_and_odd_totals():
    value, remarks = table_value([["Year", "Name", "Score"], ["2024", "A", "3"], ["2025", "B", "4"], ["Total", "", "9"]])
    assert value["columns"] == [{"key": "year", "label": "Year"}, {"key": "name", "label": "Name"}, {"key": "score", "label": "Score"}]
    # 9 is not 3 + 4: the totals row stays a row; years stay text.
    assert value["rows"] == [["2024", "A", 3], ["2025", "B", 4], ["Total", None, 9]]
    assert remarks == []


def test_table_value_labels_and_ragged_rows():
    value, _ = table_value([["", "Größe", "Größe"], ["a"], ["b", "1", "2"]])
    assert [c["key"] for c in value["columns"]] == ["column-1", "grosse", "grosse-2"]
    assert value["rows"] == [["a", None, None], ["b", 1, 2]]


# -- the feature deck -------------------------------------------------------------------------------

def test_valid_and_format_02(features):
    assert validate_show(features.show) == []
    assert features.report.warnings == []
    assert features.show["slipr"] == "0.2"


def test_chart_becomes_a_table(features):
    s = slide(features, 1)
    assert s["layout"] == "table"
    assert s["content"]["table"] == {
        "columns": [{"key": "category", "label": "Category"},
                    {"key": "2025", "label": "2025", "visual": "bar"}, {"key": "2026", "label": "2026", "visual": "bar"}],
        "rows": [["Q1", 10, 11], ["Q2", 12.5, 13], ["Q3", 14, 18]],
        "caption": "Sales per quarter",
    }
    assert s["notes"] == "_[Converter] A PowerPoint chart “Sales per quarter” was converted to a table._"


def test_embedded_video(features):
    s = slide(features, 2)
    assert s["layout"] == "video"
    assert s["content"]["video"] == {
        "video": "media/slide02-1.mp4", "title": "The launch", "start": 1.5,
        "chapters": [{"time": 0, "title": "Countdown"}, {"time": 4.2, "title": "Lift-off"}],
        "fallback": {"src": "images/slide02-video1.png", "alt": "Poster of “The launch”"},
    }
    assert any("trims 2 s from the end" in n for n in features.report.slides[1].notes)
    video = next(a for a in features.assets if a.path == "media/slide02-1.mp4")
    assert video.data.startswith(b"\x00\x00\x00\x18ftyp")


def test_online_video(features):
    assert slide(features, 3)["content"]["video"]["video"] == "https://www.youtube.com/watch?v=abcDEF12345"


def test_smartart_becomes_mermaid(features):
    process = slide(features, 4)
    assert process["layout"] == "diagram"
    assert process["content"]["diagram"]["mermaid"] == (
        'flowchart LR\n  n1["Plan"]\n  n2["Build<br/>• Test"]\n  n3["Ship"]\n  n1 --> n2\n  n2 --> n3')
    org = slide(features, 5)
    assert org["content"]["diagram"]["mermaid"] == (
        'flowchart TD\n  n1["CEO"]\n  n2["CFO"]\n  n1 --> n2\n  n3["CTO #quot;tech#quot;"]\n  n1 --> n3')


def test_list_smartart_becomes_a_list(features):
    s = slide(features, 9)
    assert s["layout"] == "bullets"
    assert s["content"]["body"] == "- Open\n  - Honest\n- Curious"


def test_slide_links_and_zooms(features):
    s = slide(features, 6)
    assert s["content"]["body"] == "- See [the chart](#s-01) or go on"
    assert s["reader"] == {"related": ["s-02"]}


def test_transitions(features):
    # fade, push, push, then nothing: "none" is the most common and the show default.
    assert features.show["settings"]["transition"] == "none"
    assert [(s.get("audience") or {}).get("transition") for s in features.show["slides"]] == [
        "fade", "slide", "slide", None, None, None, None, None, None]


def test_morph_entrance_and_background(features):
    s7, s8 = slide(features, 7), slide(features, 8)
    assert s7["audience"] == {"background": "images/slide07-background.png", "autoAnimate": True}
    assert s8["audience"] == {"autoAnimate": True}
    assert s7["overlays"][0]["image"]["morphId"] == s8["overlays"][0]["image"]["morphId"] == "logo"
    assert s7["overlays"][0]["fragment"] == "fade-up"
    assert "fragment" not in s8["overlays"][0]
    assert s8["content"]["image"]["src"] == s7["content"]["image"]["src"], "the same photo is one file"


def test_a_deck_without_transitions_keeps_fade(converted):
    assert converted.show["settings"]["transition"] == "fade"
    assert all("transition" not in (s.get("audience") or {}) for s in converted.show["slides"])


@node
def test_feature_show_passes_the_javascript_validator(features, tmp_path):
    result = js_validate(features.show, "default", tmp_path)
    assert result["errors"] == []
    assert result["warnings"] == []


@node
def test_conclusion_template_puts_smartart_in_the_reader_layer(feature_deck, tmp_path):
    """The Conclusion template has no diagram layout: the diagram becomes a reader block."""
    template = json.loads((REPO / "templates" / "conclusion" / "template.json").read_text(encoding="utf-8"))
    result = convert(feature_deck, template, template_ref="../../templates/conclusion")
    process = result.show["slides"][3]
    assert process["reader"]["blocks"][0]["type"] == "diagram"
    assert process["reader"]["blocks"][0]["id"] == "converted-diagram-1"
    assert result.show["slides"][0]["layout"] == "table"
    assert result.show["slides"][1]["layout"] == "video"
    assert js_validate(result.show, "conclusion", tmp_path)["errors"] == []


# -- round trip: show → PowerPoint → show ---------------------------------------------------------------

def _load(name: str):
    folder = REPO / "shows" / name
    show = json.loads((folder / "show.json").read_text(encoding="utf-8"))
    template_name = show["template"]["ref"].rstrip("/").rsplit("/", 1)[-1]
    template = json.loads((REPO / "templates" / template_name / "template.json").read_text(encoding="utf-8"))
    return show, template, template_name, lambda rel: (folder / rel).read_bytes() if (folder / rel).is_file() else None


def _values(slide: dict, slot_type: str) -> list[dict]:
    """Table / video values of a slide: its slots and its reader blocks."""
    key = {"table": "columns", "video": "video"}[slot_type]
    found = [v for v in slide.get("content", {}).values() if isinstance(v, dict) and key in v]
    found += [b for b in (slide.get("reader") or {}).get("blocks", []) if b.get("type") == slot_type]
    return found


@node
@pytest.mark.parametrize("name", ["demo", "conclusion-demo"])
def test_round_trip_keeps_tables_and_videos(name, tmp_path):
    show, template, template_name, read_file = _load(name)
    exported = export_show(show, template, read_file=read_file)
    again = convert(exported.pptx, template, template_ref=f"../../templates/{template_name}")
    slides = [s for s in show["slides"]]
    assert len(again.show["slides"]) == len(slides)
    for before, after in zip(slides, again.show["slides"]):
        for slot, value in before.get("content", {}).items():
            if not isinstance(value, dict) or value.get("fallback"):
                continue
            if isinstance(value.get("columns"), list) and value.get("rows") and "data" not in value:
                tables = _values(after, "table")
                assert tables, f"{before['id']}: table `{slot}` came back"
                labels = [c.get("label", c["key"]) for c in tables[0]["columns"]]
                assert labels == [c.get("label", c["key"]) for c in value["columns"] if not c.get("hidden")]
            if isinstance(value.get("video"), str) and not value["video"].startswith("http"):
                videos = _values(after, "video")
                assert videos and videos[0]["video"].startswith("media/"), f"{before['id']}: video `{slot}` came back"
    result = js_validate(again.show, template_name, tmp_path)
    assert result["errors"] == []
