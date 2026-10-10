"""Command line: slipr-convert <deck.pptx> --template <folder> --out <folder>."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .convert import convert
from .emit import OutputExistsError, slugify
from .reader import ReadError
from .validate import schema_dir, validate_template


def main(argv: list[str] | None = None) -> int:
    # Windows consoles often use a legacy code page: never crash on a character
    # from a slide title or file name.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(prog="slipr-convert", description="Convert a PowerPoint deck into a Slipr show.")
    parser.add_argument("pptx", type=Path, help="the .pptx file to convert")
    parser.add_argument("--template", type=Path, required=True, help="Slipr template folder (contains template.json)")
    parser.add_argument("--out", type=Path, required=True, help="output show folder")
    parser.add_argument("--mapping", type=Path, help="JSON file: PowerPoint layout name → Slipr layout id")
    parser.add_argument("--id", dest="show_id", help="show id (default: from the file name)")
    parser.add_argument("--lang", default="en", help="language of the deck (BCP-47, default: en)")
    parser.add_argument("--no-notes", action="store_true", help="leave out speaker notes")
    parser.add_argument("--notes-to-reader", action="store_true", help="also copy speaker notes into a reader text block")
    parser.add_argument("--force", action="store_true", help="overwrite a non-empty output folder")
    args = parser.parse_args(argv)

    def fail(message: str) -> int:
        print(f"slipr-convert: {message}", file=sys.stderr)
        return 1

    if not args.pptx.is_file():
        return fail(f"file not found: {args.pptx}")
    template_file = args.template / "template.json"
    if not template_file.is_file():
        return fail(f"no template.json in {args.template}")
    try:
        template = json.loads(template_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        return fail(f"{template_file} is not valid JSON: {err}")
    problems = validate_template(template)
    if problems:
        return fail("the template is invalid:\n  " + "\n  ".join(problems))

    layout_mapping = None
    if args.mapping:
        try:
            layout_mapping = json.loads(args.mapping.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as err:
            return fail(f"cannot read --mapping: {err}")

    out_dir = args.out.resolve()
    template_ref = relpath(args.template.resolve(), out_dir)
    schema_file = schema_dir() / "show.schema.json"
    schema_ref = relpath(schema_file.resolve(), out_dir) if schema_file.exists() else None

    try:
        result = convert(
            args.pptx, template,
            template_ref=template_ref,
            show_id=args.show_id or slugify(args.pptx.stem) or "converted-show",
            source_name=args.pptx.name,
            language=args.lang,
            schema_ref=schema_ref,
            layout_mapping=layout_mapping,
            include_notes=not args.no_notes,
            notes_to_reader=args.notes_to_reader,
        )
    except ReadError as err:
        return fail(str(err))

    from .emit import write_show  # local import keeps the core free of file writing

    try:
        write_show(result, out_dir, force=args.force)
    except OutputExistsError as err:
        return fail(str(err))

    r = result.report
    print(f"Converted {len(r.slides)} slides -> {out_dir / 'show.json'}")
    print(f"  {len(result.assets)} image(s), {r.moved_count} item(s) moved to the reader layer, {r.skipped_count} element(s) not converted")
    if r.warnings:
        print(f"  WARNING: {len(r.warnings)} validation problem(s), see conversion-report.md")
    print(f"  Report: {out_dir / 'conversion-report.md'}")
    return 0


def relpath(target: Path, start: Path) -> str:
    """Relative path with forward slashes (works in URLs and on every OS)."""
    try:
        return Path(os.path.relpath(target, start)).as_posix()
    except ValueError:  # different drives on Windows
        return target.as_uri()


if __name__ == "__main__":
    sys.exit(main())
