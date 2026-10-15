"""Command line: slipr-export <show folder> --out <deck.pptx> [--base <template.pptx>]."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from .export import export_show
from .validate import schema_dir, validate_show, validate_template


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(prog="slipr-export", description="Export a Slipr show to a PowerPoint deck.")
    parser.add_argument("show", type=Path, help="the show folder (or its show.json)")
    parser.add_argument("--out", type=Path, required=True, help="the .pptx file to write")
    parser.add_argument("--template", type=Path, help="Slipr template folder (default: the show's template.ref)")
    parser.add_argument("--base", type=Path, help="a .pptx whose layouts, masters and theme the deck uses "
                                                  "(e.g. the PowerPoint template the Slipr template was made from)")
    parser.add_argument("--no-notes", action="store_true", help="leave out the speaker notes")
    parser.add_argument("--no-reader", action="store_true", help="leave the reader layer out of the speaker notes")
    parser.add_argument("--force", action="store_true", help="overwrite an existing .pptx")
    args = parser.parse_args(argv)

    def fail(message: str) -> int:
        print(f"slipr-export: {message}", file=sys.stderr)
        return 1

    show_file = args.show / "show.json" if args.show.is_dir() else args.show
    if not show_file.is_file():
        return fail(f"no show.json in {args.show}")
    folder = show_file.parent.resolve()
    try:
        show = json.loads(show_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        return fail(f"{show_file} is not valid JSON: {err}")

    template_dir = args.template or resolve_template(show, folder)
    if template_dir is None:
        return fail("cannot find the show's template; pass --template <folder>")
    template_file = template_dir / "template.json"
    if not template_file.is_file():
        return fail(f"no template.json in {template_dir}")
    try:
        template = json.loads(template_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        return fail(f"{template_file} is not valid JSON: {err}")
    problems = validate_template(template)
    if problems:
        return fail("the template is invalid:\n  " + "\n  ".join(problems))

    base = None
    if args.base:
        if not args.base.is_file():
            return fail(f"file not found: {args.base}")
        base = args.base.read_bytes()
    out = args.out if args.out.suffix.lower() == ".pptx" else args.out.with_suffix(".pptx")
    if out.exists() and not args.force:
        return fail(f"{out} exists; use --force to overwrite it")

    def read_file(rel: str) -> bytes | None:
        path = (folder / rel).resolve()
        if not path.is_relative_to(folder) or not path.is_file():
            return None
        return path.read_bytes()

    try:
        result = export_show(show, template, read_file=read_file, base=base,
                             include_notes=not args.no_notes, include_reader=not args.no_reader,
                             source_name=show_file.name if show_file.parent == args.show else str(show_file))
    except Exception as err:  # a broken base deck, mostly: python-pptx raises many kinds
        return fail(f"export failed: {err}")
    result.report.warnings[:0] = [f"show.json: {p}" for p in validate_show(show)]

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(result.pptx)
    report_file = out.with_name(out.stem + "-export-report.md")
    report_file.write_text(result.report.to_markdown(), encoding="utf-8", newline="\n")

    r = result.report
    print(f"Exported {len(r.slides)} slides -> {out}")
    print(f"  {r.fallback_count} rich element(s) as a picture, card or list, {r.skipped_count} not exported")
    if r.warnings:
        print(f"  WARNING: {len(r.warnings)} problem(s), see the report")
    print(f"  Report: {report_file}")
    return 0


def resolve_template(show: dict, folder: Path) -> Path | None:
    """The template folder from template.ref: relative to show.json, or
    root-relative (/templates/<name>) against this repository."""
    ref = str((show.get("template") or {}).get("ref") or "")
    if not ref or re.match(r"^[a-z]+:", ref, re.I):
        return None
    if ref.startswith("/"):
        candidate = schema_dir().parents[1] / ref.lstrip("/")
    else:
        candidate = folder / ref
    if (candidate / "template.json").is_file():
        return candidate
    by_name = schema_dir().parents[1] / "templates" / ref.rstrip("/").rsplit("/", 1)[-1]
    return by_name if (by_name / "template.json").is_file() else None


if __name__ == "__main__":
    sys.exit(main())
