"""Assemble the Slipr show (dict), its image assets and the report;
and write them to a show folder (used by the CLI only).
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import unicodedata
from collections import Counter
from pathlib import Path

from . import mapping
from .model import Asset, ConversionResult, DeckModel
from .report import Report
from .text import SLIDE_LINK
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

    # Images and videos: one file per distinct picture or video
    assets: list[Asset] = []
    path_by_sha: dict[str, str] = {}

    def asset(sha1: str, path: str, data: bytes) -> str:
        if sha1 not in path_by_sha:
            path_by_sha[sha1] = path
            assets.append(Asset(path=path, data=data))
        return path_by_sha[sha1]

    sid_of = {sm.slide_id: sid for sm, sid in zip(deck.slides, slide_ids)}
    slides = []
    for sm, sid in zip(deck.slides, slide_ids):
        stem = f"slide{sm.index + 1:0{width}d}"
        paths = [asset(ref.sha1, f"images/{stem}-{k}.{ref.ext}", ref.blob) for k, ref in enumerate(sm.images, 1)]
        visual_assets = []
        for k, v in enumerate((v for v in sm.visuals if v.video is not None), 1):
            video = v.video
            file = asset(_sha1(video.blob), f"media/{stem}-{k}.{video.ext}", video.blob) if video.blob is not None else None
            poster = asset(video.poster[2], f"images/{stem}-video{k}.{video.poster[1]}", video.poster[0]) if video.poster else None
            visual_assets.append((file, poster))
        it = iter(visual_assets)
        visual_assets = [next(it) if v.video is not None else (None, None) for v in sm.visuals]
        background = asset(sm.background.sha1, f"images/{stem}-background.{sm.background.ext}", sm.background.blob) if sm.background else None

        mapped = mapping.map_slide(
            sm, sid, template,
            images=paths,
            mapping=layout_mapping,
            chapter=chapter_ids.get(sm.section) if sm.section else None,
            include_notes=include_notes,
            notes_to_reader=notes_to_reader,
            slide_size=(deck.slide_width, deck.slide_height),
            visual_assets=visual_assets,
            related=[sid_of[t] for t in sm.zoom_targets if t in sid_of and sid_of[t] != sid],
            background=background,
        )
        slides.append(mapped.slide)
        entry = report.slide(sm.index + 1, sid, sm.title or "")
        entry.layout, entry.reason = mapped.layout, mapped.reason
        entry.moved, entry.skipped, entry.notes = mapped.moved, mapped.skipped, mapped.remarks
        entry.placed = mapped.placed
        if sm.hidden:
            entry.notes.append("hidden in PowerPoint → backup slide (audience.hidden)")

    default_transition = _apply_motion(deck, slides, report)
    _resolve_slide_links(slides, dict(zip(deck.slide_parts, slide_ids)))

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
        # Format 0.2 only when it is needed: extra images (I-083), picture style or opacity (I-084),
        # tables, videos and morph ids (I-121).
        "slipr": "0.2" if any(_needs_format_02(s) for s in slides) else "0.1",
        "id": show_id,
        "meta": meta,
        "template": {"ref": template_ref, "version": version_range(template.get("version", "1.0.0"))},
        "settings": {"aspectRatio": deck.aspect_ratio, "transition": default_transition, "slideNumbers": True},
    })
    if chapters:
        show["chapters"] = chapters
    show["slides"] = slides

    report.warnings.extend(validate_show(show))
    return ConversionResult(show=show, assets=assets, report=report)


def _apply_motion(deck: DeckModel, slides: list[dict], report: Report) -> str:
    """PowerPoint transitions → Slipr (I-121). Returns the show's default
    transition: the most common one, or "fade" when the deck has none at
    all; slides that differ get their own `audience.transition`. A Morph
    transition sets `audience.autoAnimate` on its slide and the one before."""
    names = [sm.transition for sm in deck.slides]
    if all(n is None for n in names):
        return "fade"
    mapped = [mapping.slipr_transition(n) or "none" for n in names]
    default = Counter(mapped).most_common(1)[0][0]
    for i, (sm, slide, transition) in enumerate(zip(deck.slides, slides, mapped)):
        if sm.transition == "morph":
            for target in (slides[i - 1], slide) if i else (slide,):
                target.setdefault("audience", {})["autoAnimate"] = True
            report.slides[i].notes.append("Morph transition → auto-animate with the slide before")
        if transition != default:
            slide.setdefault("audience", {})["transition"] = transition
    return default


_SLIDE_LINK = re.compile(r"\]\(" + re.escape(SLIDE_LINK) + r"([^)]*)\)")


def _resolve_slide_links(value, sid_of_part: dict[str, str]):
    """Turn the converter's slide-link markers into Slipr slide links
    (`#s-07`); a link to a slide that is not in the deck keeps its text only."""
    if isinstance(value, dict):
        for key, item in value.items():
            value[key] = _resolve_slide_links(item, sid_of_part)
    elif isinstance(value, list):
        for i, item in enumerate(value):
            value[i] = _resolve_slide_links(item, sid_of_part)
    elif isinstance(value, str) and SLIDE_LINK in value:
        def link(m: re.Match) -> str:
            sid = sid_of_part.get(m.group(1))
            return f"](#{sid})" if sid else "]()"

        value = _SLIDE_LINK.sub(link, value)
        value = re.sub(r"\[([^\]]*)\]\(\)", r"\1", value)  # unresolved: keep the text
    return value


def _sha1(blob: bytes) -> str:
    return hashlib.sha1(blob).hexdigest()  # noqa: S324 - a content key, not security


def _needs_format_02(value) -> bool:
    """Does a slide use show format 0.2: extra images, a picture with a style,
    opacity, crop or morph id, a table or a video?"""
    if isinstance(value, dict):
        if value.get("overlays"):
            return True
        if isinstance(value.get("src"), str) and any(k in value for k in ("style", "opacity", "crop", "morphId")):
            return True
        if isinstance(value.get("video"), str) or ("columns" in value and "rows" in value):
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
        shutil.rmtree(out_dir / "media", ignore_errors=True)
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
