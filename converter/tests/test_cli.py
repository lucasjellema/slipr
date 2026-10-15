"""The command line, plus a cross-check with the JavaScript validator."""
from __future__ import annotations

import json
import shutil
import subprocess

import pytest

from slipr_convert.cli import main
from .conftest import REPO


@pytest.fixture()
def deck_file(tmp_path, sample_deck):
    path = tmp_path / "My Deck.pptx"
    path.write_bytes(sample_deck)
    return path


def run(deck_file, out, *extra):
    return main([str(deck_file), "--template", str(REPO / "templates" / "default"), "--out", str(out), *extra])


def test_writes_show_folder(tmp_path, deck_file, capsys):
    out = tmp_path / "shows" / "my-deck"
    assert run(deck_file, out) == 0
    show = json.loads((out / "show.json").read_text(encoding="utf-8"))
    assert show["id"] == "my-deck"
    assert (out / "images" / "slide05-1.png").exists()
    assert "converted to a table" not in (out / "conversion-report.md").read_text(encoding="utf-8")
    assert show["slides"][6]["layout"] == "table"
    assert "Converted 8 slides" in capsys.readouterr().out


def test_relative_template_and_schema_refs(tmp_path, deck_file):
    out = REPO / "converter" / "out" / "pytest-refs"  # inside the repo: refs must be relative
    try:
        assert run(deck_file, out, "--force") == 0
        show = json.loads((out / "show.json").read_text(encoding="utf-8"))
        assert show["template"]["ref"] == "../../../templates/default"
        assert show["$schema"] == "../../../shared/schema/show.schema.json"
    finally:
        shutil.rmtree(out, ignore_errors=True)


def test_refuses_to_overwrite_without_force(tmp_path, deck_file, capsys):
    out = tmp_path / "show"
    assert run(deck_file, out) == 0
    assert run(deck_file, out) == 1
    assert "--force" in capsys.readouterr().err
    assert run(deck_file, out, "--force") == 0


def test_options(tmp_path, deck_file):
    out = tmp_path / "show"
    mapping = tmp_path / "map.json"
    mapping.write_text(json.dumps({"Title and Content": "two-column"}), encoding="utf-8")
    assert run(deck_file, out, "--id", "custom-id", "--lang", "nl", "--no-notes", "--mapping", str(mapping)) == 0
    show = json.loads((out / "show.json").read_text(encoding="utf-8"))
    assert show["id"] == "custom-id"
    assert show["meta"]["language"] == "nl"
    assert "notes" not in show["slides"][1]
    assert show["slides"][1]["layout"] == "two-column"


def test_helpful_errors(tmp_path, capsys):
    assert main(["missing.pptx", "--template", str(REPO / "templates" / "default"), "--out", str(tmp_path / "x")]) == 1
    bad = tmp_path / "bad.pptx"
    bad.write_bytes(b"not a zip")
    assert main([str(bad), "--template", str(REPO / "templates" / "default"), "--out", str(tmp_path / "x")]) == 1
    assert main([str(bad), "--template", str(tmp_path), "--out", str(tmp_path / "x")]) == 1
    err = capsys.readouterr().err
    assert "file not found" in err and "Not a readable .pptx" in err and "no template.json" in err


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not available")
def test_output_passes_the_javascript_validator(converted, template, tmp_path):
    """Contract test: what Python writes, the viewer accepts (schema + semantic checks)."""
    show_file = tmp_path / "show.json"
    show_file.write_text(json.dumps(converted.show), encoding="utf-8")
    script = (
        "import { validateShow } from " + json.dumps((REPO / "shared" / "validate.js").as_uri()) + ";"
        "import { readFileSync } from 'node:fs';"
        f"const show = JSON.parse(readFileSync({json.dumps(str(show_file))}, 'utf8'));"
        f"const template = JSON.parse(readFileSync({json.dumps(str(REPO / 'templates' / 'default' / 'template.json'))}, 'utf8'));"
        "const r = validateShow(show, { template });"
        "console.log(JSON.stringify({ errors: r.errors, warnings: r.warnings }));"
    )
    proc = subprocess.run(["node", "--input-type=module", "-e", script], capture_output=True, text=True, check=True)
    result = json.loads(proc.stdout)
    assert result["errors"] == []
    # The only expected warning: the picture without alt text (slide 6).
    assert [(w["path"], w["code"]) for w in result["warnings"]] == [("slides[5].content.image", "missing-alt")]
