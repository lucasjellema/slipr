"""Assemble the Slipr show (dict), its image assets and the report;
and write them to a show folder (used by the CLI only).
"""
from __future__ import annotations

import json
import re
import shutil
import unicodedata
from pathlib import Path

from . import mapping
from .model import Asset, ConversionResult, DeckModel
from .report import Report
from .validate import validate_show


class OutputExistsError(Exception):
    """The output folder is not empty and --force was not given."""


def build_show(
    deck: DeckModel,
    template: dict,
    *,
    template_ref: str,
    show_id: str,
    source_name: str,
    language: str = "en",
    schema_ref: str | None = None,
    layout_mapping: dict[str, str] | None = None,
    include_notes: bool = True,
    notes_to_reader: bool = False,
) -> ConversionResult:
    report = Report(source=source_name)
    width = max(2, len(str(len(deck.slides))))
    slide_ids = [f"s-{n:0{width}d}" for n in range(1, len(deck.slides) + 1)]

    # Chapters from PowerPoint sections
    chapter_ids: dict[str, str] = {}
    chapters = []
    for name in deck.sections:
        cid = unique(slugify(name) or "chapter", set(chapter_ids.values()))
        chapter_ids[name] = cid
        chapters.append({"id": cid, "title": name})

    # Images: one file per distinct picture
    assets: list[Asset] = []
    path_by_sha: dict[str, str] = {}
    slides = []
    for sm, sid in zip(deck.slides, slide_ids):
        paths = []
        for k, ref in enumerate(sm.images, 1):
            if ref.sha1 not in path_by_sha:
                path = f"images/slide{sm.index + 1:0{width}d}-{k}.{ref.ext}"
                path_by_sha[ref.sha1] = path
                assets.append(Asset(path=path, data=ref.blob))
            paths.append(path_by_sha[ref.sha1])

        mapped = mapping.map_slide(
            sm, sid, template,
            images=paths,
            mapping=layout_mapping,
            chapter=chapter_ids.get(sm.section) if sm.section else None,
            include_notes=include_notes,
            notes_to_reader=notes_to_reader,
            slide_size=(deck.slide_width, deck.slide_height),
        )
        slides.append(mapped.slide)
        entry = report.slide(sm.index + 1, sid, sm.title or "")
        entry.layout, entry.reason = mapped.layout, mapped.reason
        entry.moved, entry.skipped, entry.notes = mapped.moved, mapped.skipped, mapped.remarks
        entry.placed = mapped.placed
        if sm.hidden:
            entry.notes.append("hidden in PowerPoint → backup slide (audience.hidden)")

    first_title = next((s.title for s in deck.slides if s.title), None)
    meta = {"title": deck.title or first_title or show_id, "language": language}
    if deck.author:
        meta["author"] = deck.author
    if deck.date:
        meta["date"] = deck.date

    show: dict = {}
    if schema_ref:
        show["$schema"] = schema_ref
    show.update({
        # Format 0.2 only when it is needed: extra images (I-083), picture style or opacity (I-084).
        "slipr": "0.2" if any(_needs_format_02(s) for s in slides) else "0.1",
        "id": show_id,
        "meta": meta,
        "template": {"ref": template_ref, "version": version_range(template.get("version", "1.0.0"))},
        "settings": {"aspectRatio": deck.aspect_ratio, "transition": "fade", "slideNumbers": True},
    })
    if chapters:
        show["chapters"] = chapters
    show["slides"] = slides

    report.warnings.extend(validate_show(show))
    return ConversionResult(show=show, assets=assets, report=report)


def _needs_format_02(value) -> bool:
    """Does a slide use show format 0.2: extra images, or a picture with a style or opacity?"""
    if isinstance(value, dict):
        if value.get("overlays"):
            return True
        if isinstance(value.get("src"), str) and ("style" in value or "opacity" in value):
            return True
        return any(_needs_format_02(v) for v in value.values())
    if isinstance(value, list):
        return any(_needs_format_02(v) for v in value)
    return False


def write_show(result: ConversionResult, out_dir: Path, *, force: bool = False) -> None:
    out_dir = Path(out_dir)
    if out_dir.exists() and any(out_dir.iterdir()):
        if not force:
            raise OutputExistsError(f"{out_dir} is not empty (use --force to overwrite)")
        for name in ("show.json", "conversion-report.md"):
            (out_dir / name).unlink(missing_ok=True)
        shutil.rmtree(out_dir / "images", ignore_errors=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    for asset in result.assets:
        target = out_dir / asset.path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(asset.data)
    (out_dir / "show.json").write_text(json.dumps(result.show, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    (out_dir / "conversion-report.md").write_text(result.report.to_markdown(), encoding="utf-8", newline="\n")


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def unique(base: str, taken: set[str]) -> str:
    candidate, n = base, 2
    while candidate in taken:
        candidate, n = f"{base}-{n}", n + 1
    return candidate


def version_range(version: str) -> str:
    """'1.4.2' → '^1.4'."""
    parts = (version.split(".") + ["0", "0"])[:2]
    return f"^{parts[0]}.{parts[1]}"
