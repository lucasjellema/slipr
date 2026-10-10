"""Intermediate model → Slipr slide: choose a layout and fill its slots.

Placeholder roles first (template format 0.2):
  - `template.pptxIgnore` lists placeholder idx values that are never content
    (footer, slide number, theme bar, overlays, logo). They are dropped.
  - A `pptxMapping` entry can be an object: {"layout": id, "placeholders":
    {"<idx>": "<slot>" | null}}. Content in a placeholder with a role goes
    straight into that slot; `null` means "ignore this placeholder".

Layout choice, in order:
  1. Explicit mapping by PowerPoint layout name: the --mapping file, then the
     template's `pptxMapping`. It is skipped when the slide has pictures and
     the mapped layout cannot hold any, while another layout could.
  2. Title-only slides: "title" for the first slide, "section" later on
     (when the template has such layouts).
  3. Best fit: the layout whose slots match the slide's text blocks and
     pictures with the least content left over or slots left empty.

Nothing is lost: text or pictures that do not fit the chosen layout go to
the slide's READER LAYER (text / image blocks), so readers still see them.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, replace

from .model import ImageRef, SlideModel, TextBody

LIST_TYPES = {"list", "richtext"}


@dataclass
class Capacity:
    title: bool
    text_slots: list[str]  # names of 'text' slots other than the title
    body_slots: list[dict]  # 'list' / 'richtext' slots, in order
    image_slots: list[str]


def capacity(layout: dict, filled: set[str] | frozenset[str] = frozenset()) -> Capacity:
    """Free slots of a layout, leaving out the ones already `filled`."""
    slots = [s for s in layout.get("slots", []) if s["name"] not in filled]
    text_slots = [s["name"] for s in slots if s["type"] == "text"]
    title = "title" in text_slots
    if "title" in filled:
        rest = text_slots  # the title is taken: all remaining text slots are free
    else:
        rest = [n for n in text_slots if n != "title"] if title else text_slots[1:]
    return Capacity(
        title=title,
        text_slots=rest,
        body_slots=[s for s in slots if s["type"] in LIST_TYPES],
        image_slots=[s["name"] for s in slots if s["type"] == "image"],
    )


@dataclass
class LayoutEntry:
    """What the mapping tables say about one PowerPoint layout name."""

    layout: str | None = None
    roles: dict[int, str] = field(default_factory=dict)  # idx → slot
    ignore: set[int] = field(default_factory=set)  # idx explicitly ignored (null roles)
    source: str = ""


def lookup_entry(layout_name: str, template: dict, mapping: dict | None = None) -> LayoutEntry:
    for source, table in (("--mapping", mapping or {}), ("template pptxMapping", template.get("pptxMapping", {}))):
        target = table.get(layout_name)
        if isinstance(target, str):
            return LayoutEntry(layout=target, source=source)
        if isinstance(target, dict) and target.get("layout"):
            placeholders = target.get("placeholders", {}) or {}
            return LayoutEntry(
                layout=target["layout"],
                roles={int(k): v for k, v in placeholders.items() if v},
                ignore={int(k) for k, v in placeholders.items() if v is None},
                source=source,
            )
    return LayoutEntry()


def choose_layout(sm: SlideModel, template: dict, mapping: dict | None = None) -> tuple[str, str]:
    layouts = {l["id"]: l for l in template.get("layouts", [])}
    if not layouts:
        raise ValueError("The template has no layouts")
    any_image_layout = any(capacity(l).image_slots for l in layouts.values())

    entry = lookup_entry(sm.layout_name, template, mapping)
    if entry.layout in layouts:
        has_role_images = any(im.idx in entry.roles for im in sm.images)
        if sm.images and not has_role_images and not capacity(layouts[entry.layout]).image_slots and any_image_layout:
            pass  # the mapped layout would push the pictures out: use best fit instead
        else:
            return entry.layout, f'PowerPoint layout "{sm.layout_name}" mapped to "{entry.layout}" ({entry.source})'

    if not sm.bodies and not sm.images:
        if sm.index == 0 and "title" in layouts:
            return "title", "first slide with only a title"
        if sm.index > 0 and "section" in layouts and not sm.subtitle:
            return "section", "title-only slide"
        if sm.subtitle and "title" in layouts:
            return "title", "title and subtitle only"

    best, best_cost = None, None
    for lid, layout in layouts.items():
        cap = capacity(layout)
        n_body, n_img = len(sm.bodies), len(sm.images)
        n_slots = len(cap.body_slots)
        cost = 0
        cost += 3 * n_body if n_slots == 0 else max(0, n_body - n_slots)  # moved away / merged
        cost += 5 * max(0, n_img - len(cap.image_slots))  # pictures moved to the reader layer
        cost += max(0, n_slots - n_body) + max(0, len(cap.image_slots) - n_img)  # empty slots
        cost += 2 if (sm.title and not cap.title) else 0
        if best_cost is None or cost < best_cost:
            best, best_cost = lid, cost
    return best, f"best fit for {len(sm.bodies)} text block(s) and {len(sm.images)} picture(s)"


@dataclass
class MappedSlide:
    slide: dict
    layout: str
    reason: str
    moved: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    remarks: list[str] = field(default_factory=list)


def map_slide(
    sm: SlideModel,
    slide_id: str,
    template: dict,
    *,
    images: list[str],
    mapping: dict | None = None,
    chapter: str | None = None,
    include_notes: bool = True,
    notes_to_reader: bool = False,
) -> MappedSlide:
    """`images`: the asset path for each of `sm.images`, in the same order."""
    entry = lookup_entry(sm.layout_name, template, mapping)
    ignore = set(template.get("pptxIgnore", []) or []) | entry.ignore
    sm, image_paths = _drop_ignored(sm, images, ignore)

    layout_id, reason = choose_layout(sm, template, mapping)
    layout = next(l for l in template["layouts"] if l["id"] == layout_id)
    slot_types = {s["name"]: s["type"] for s in layout.get("slots", [])}
    result = MappedSlide(slide={"id": slide_id, "layout": layout_id}, layout=layout_id, reason=reason)
    content: dict = {}
    blocks: list[dict] = []
    had_title = sm.title is not None or any(r == "title" for r in entry.roles.values())

    # 1. Placeholder roles: content goes straight into the slot the template names.
    if entry.layout == layout_id and entry.roles:
        sm, image_paths = _apply_roles(sm, image_paths, entry.roles, slot_types, content, result)

    # 2. Everything else: generic filling of the slots that are still free.
    cap = capacity(layout, set(content))
    text_slots = list(cap.text_slots)
    if sm.title:
        if cap.title:
            content["title"] = sm.title
        elif text_slots:
            content[text_slots.pop(0)] = sm.title
        else:
            blocks.append({"id": "converted-title", "type": "text", "md": f"**{_escape(sm.title)}**"})
            result.moved.append(f"title “{sm.title}” (the layout has no free title slot)")
    if sm.subtitle:
        slot = _take(text_slots, "subtitle", "kicker", "caption", "byline")
        if slot:
            content[slot] = sm.subtitle
        else:
            blocks.append({"id": "converted-subtitle", "type": "text", "md": _escape(sm.subtitle)})
            result.moved.append("subtitle")

    # Text bodies → list / richtext slots; extra bodies merge into the last slot
    bodies = list(sm.bodies)
    for i, slot in enumerate(cap.body_slots):
        if not bodies:
            break
        last = i == len(cap.body_slots) - 1
        taken = bodies if last else bodies[:1]
        bodies = [] if last else bodies[1:]
        joiner = "\n" if slot["type"] == "list" and all(b.is_list for b in taken) else "\n\n"
        content[slot["name"]] = joiner.join(b.markdown for b in taken)
        if len(taken) > 1:
            result.remarks.append(f"{len(taken)} text blocks combined in slot “{slot['name']}”")

    # Short single-line leftovers can fill remaining text slots (e.g. a caption)
    for body in list(bodies):
        if text_slots and not body.is_list and "\n" not in body.markdown and len(body.markdown) <= 120:
            content[_take(text_slots, "subtitle", "caption") or text_slots.pop(0)] = markdown_to_plain(body.markdown)
            bodies.remove(body)
    for n, body in enumerate(bodies, 1):
        blocks.append({"id": f"converted-text-{n}", "type": "text", "md": body.markdown})
        result.moved.append(f"text block {n} (“{_preview(body.markdown)}”)")

    # Pictures → image slots; extra pictures become reader image blocks
    free_images = list(cap.image_slots)
    for n, (ref, path) in enumerate(zip(sm.images, image_paths), 1):
        value = _image_value(ref, path, result, n)
        if free_images:
            content[free_images.pop(0)] = value
        else:
            blocks.append({"id": f"converted-image-{n}", "type": "image", "image": value})
            result.moved.append(f"picture {n}")

    if not had_title:
        result.remarks.append("no title found on this slide")
    result.slide["content"] = content
    if chapter:
        result.slide["chapter"] = chapter

    # Notes, and what could not be converted
    notes = sm.notes if include_notes else None
    if sm.unsupported:
        kinds = ", ".join(sorted(set(sm.unsupported)))
        result.skipped.extend(sm.unsupported)
        warning = f"_[Converter] Not converted from PowerPoint: {kinds}._"
        notes = f"{notes}\n\n{warning}" if notes else warning
    if notes:
        result.slide["notes"] = notes
    if notes_to_reader and include_notes and sm.notes:
        blocks.append({"id": "notes", "type": "text", "md": sm.notes})

    audience: dict = {}
    if sm.hidden:
        audience["hidden"] = True
    if sm.has_build_animations and any(content.get(s["name"]) for s in layout.get("slots", []) if s["type"] in LIST_TYPES):
        audience["fragments"] = True
    if audience:
        result.slide["audience"] = audience
    if blocks:
        result.slide["reader"] = {"blocks": blocks}
    return result


def _drop_ignored(sm: SlideModel, paths: list[str], ignore: set[int]) -> tuple[SlideModel, list[str]]:
    """Remove content in placeholders the template declares as non-content."""
    if not ignore:
        return sm, list(paths)
    kept = [(im, p) for im, p in zip(sm.images, paths) if im.idx not in ignore]
    return replace(
        sm,
        title=None if sm.title_idx in ignore else sm.title,
        subtitle=None if sm.subtitle_idx in ignore else sm.subtitle,
        bodies=[b for b in sm.bodies if b.idx not in ignore],
        images=[im for im, _ in kept],
    ), [p for _, p in kept]


def _apply_roles(
    sm: SlideModel, paths: list[str], roles: dict[int, str], slot_types: dict[str, str],
    content: dict, result: MappedSlide,
) -> tuple[SlideModel, list[str]]:
    """Put role-mapped content into its slot; return what is left for generic filling."""

    def put(slot: str, text: str | None, md: str | None) -> bool:
        kind = slot_types.get(slot)
        if kind is None:
            result.remarks.append(f"placeholder role names unknown slot “{slot}” (ignored)")
            return False
        if slot in content:
            # Two placeholders for one slot: combine text, keep the first picture.
            if kind in LIST_TYPES and md:
                content[slot] = f"{content[slot]}\n\n{md}"
                return True
            return False
        if kind == "text":
            content[slot] = text if text is not None else markdown_to_plain(md or "")
        elif kind in LIST_TYPES:
            content[slot] = md if md is not None else _escape(text or "")
        else:
            return False
        return True

    title, subtitle = sm.title, sm.subtitle
    if title and sm.title_idx in roles and put(roles[sm.title_idx], title, None):
        title = None
    if subtitle and sm.subtitle_idx in roles and put(roles[sm.subtitle_idx], subtitle, None):
        subtitle = None
    bodies: list[TextBody] = []
    for b in sm.bodies:
        if b.idx in roles and put(roles[b.idx], None, b.markdown):
            continue
        bodies.append(b)
    images: list[ImageRef] = []
    left_paths: list[str] = []
    for n, (im, path) in enumerate(zip(sm.images, paths), 1):
        slot = roles.get(im.idx) if im.idx is not None else None
        if slot and slot_types.get(slot) == "image" and slot not in content:
            content[slot] = _image_value(im, path, result, n)
            continue
        images.append(im)
        left_paths.append(path)
    return replace(sm, title=title, subtitle=subtitle, bodies=bodies, images=images), left_paths


def _image_value(ref: ImageRef, path: str, result: MappedSlide, n: int) -> dict:
    if not ref.alt:
        result.remarks.append(f"picture {n} has no alt text (add a description in PowerPoint or in show.json)")
    return {"src": path, "alt": ref.alt, "fit": "contain"}


def markdown_to_plain(md: str) -> str:
    """Slipr Markdown → plain text, for 'text' slots."""
    # Protect escaped characters first, so "\*" is never mistaken for emphasis.
    escaped: list[str] = []

    def protect(m: re.Match) -> str:
        escaped.append(m.group(1))
        return f"{len(escaped) - 1}"

    s = re.sub(r"\\(.)", protect, md)
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"\*(.+?)\*", r"\1", s)
    s = re.sub(r"^\s*(?:[-*+]|\d+[.)]|[A-Za-z][.)])\s+", "", s, flags=re.M)  # list markers
    s = re.sub("(\\d+)", lambda m: escaped[int(m.group(1))], s)
    return re.sub(r"\s+", " ", s).strip()


def _take(names: list[str], *preferred: str) -> str | None:
    for name in preferred:
        if name in names:
            names.remove(name)
            return name
    return None


def _escape(text: str) -> str:
    return re.sub(r"([\\`*_\[\]])", r"\\\1", text)


def _preview(md: str, n: int = 40) -> str:
    plain = markdown_to_plain(md)
    return plain if len(plain) <= n else plain[: n - 1] + "…"
