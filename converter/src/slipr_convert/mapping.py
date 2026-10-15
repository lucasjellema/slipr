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

Tables, charts, SmartArt and videos (visuals, I-121) count like pictures:
they want a slot of their type (`table`, `diagram`, `video`), and a layout
mapped by name yields to best fit when it has no such slot while another
layout has.

Nothing is lost: text, pictures or visuals that do not fit the chosen layout
go to the slide's READER LAYER (text / image / table / diagram / video
blocks), so readers still see them.
When the slide size is known, pictures become extra images (D-013) and text
boxes become text elements (D-016) at their PowerPoint place instead; text
boxes and shapes with a visible box (badges, callouts) always do.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field, replace

from . import visuals as vis
from .model import ImageRef, SlideModel, TextBody, TextLook, Visual

LIST_TYPES = {"list", "richtext"}
VISUAL_TYPES = {"table", "diagram", "video"}
# Slot types the converter never fills; a layout that requires one is a poor fit.
_NEVER_FILLED = {"web", "pdf", "graph", "map", "tag-cloud"}
_NUMBER_ONLY = re.compile(r"^\d{1,2}[.)]?$")


@dataclass
class Capacity:
    title: bool
    text_slots: list[str]  # names of 'text' slots other than the title
    body_slots: list[dict]  # 'list' / 'richtext' slots, in order
    image_slots: list[str]
    visual_slots: dict[str, list[str]] = field(default_factory=dict)  # 'table' / 'diagram' / 'video' → slot names
    unfillable: int = 0  # required slots of a type the converter never fills


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
        visual_slots={t: [s["name"] for s in slots if s["type"] == t] for t in sorted(VISUAL_TYPES)
                      if any(s["type"] == t for s in slots)},
        unfillable=sum(1 for s in slots if s["type"] in _NEVER_FILLED and s.get("required")),
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
    need = Counter(vis.SLOT_TYPE[v.kind] for v in sm.visuals)
    can_hold = {t for t in need if any(capacity(l).visual_slots.get(t) for l in layouts.values())}

    entry = lookup_entry(sm.layout_name, template, mapping)
    if entry.layout in layouts:
        # A plain name mapping yields to best fit when it would push pictures
        # out. A mapping with placeholder roles is the template author's
        # explicit choice and wins for pictures (extra pictures become extra
        # images), but not for tables, diagrams or videos another layout can hold.
        mapped = capacity(layouts[entry.layout])
        if any(not mapped.visual_slots.get(t) for t in can_hold):
            pass
        elif sm.images and not entry.roles and not mapped.image_slots and any_image_layout:
            pass
        else:
            return entry.layout, f'PowerPoint layout "{sm.layout_name}" mapped to "{entry.layout}" ({entry.source})'

    if not sm.bodies and not sm.images and not sm.visuals:
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
        cost += 5 * max(0, n_img - len(cap.image_slots))  # pictures without a slot (extra images)
        cost += max(0, n_slots - n_body) + max(0, len(cap.image_slots) - n_img)  # empty slots
        cost += 2 if (sm.title and not cap.title) else 0
        cost += sum(4 * max(0, n - len(cap.visual_slots.get(t, []))) for t, n in need.items())  # visuals to the reader layer
        cost += sum(max(0, len(names) - need.get(t, 0)) for t, names in cap.visual_slots.items())  # empty visual slots
        cost += 3 * cap.unfillable
        if best_cost is None or cost < best_cost:
            best, best_cost = lid, cost
    extra = f" and {len(sm.visuals)} table(s), diagram(s) or video(s)" if sm.visuals else ""
    return best, f"best fit for {len(sm.bodies)} text block(s) and {len(sm.images)} picture(s){extra}"


@dataclass
class MappedSlide:
    slide: dict
    layout: str
    reason: str
    moved: list[str] = field(default_factory=list)
    placed: list[str] = field(default_factory=list)  # pictures placed as extra images (I-083), text boxes as text elements (I-089)
    picture_styles: list[dict] = field(default_factory=list)  # the template's pictureStyles (I-084)
    skipped: list[str] = field(default_factory=list)
    remarks: list[str] = field(default_factory=list)
    converted_notes: list[str] = field(default_factory=list)  # markers for the speaker notes (charts → tables)


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
    slide_size: tuple[int, int] | None = None,
    visual_assets: list[tuple[str | None, str | None]] | None = None,
    related: list[str] | None = None,
    background: str | None = None,
) -> MappedSlide:
    """`images`: the asset path for each of `sm.images`, in the same order.
    `slide_size`: the deck's slide width and height (EMU); with it, pictures that
    fit no image slot become extra images at their PowerPoint position (D-013).
    `visual_assets`: (video file, poster) paths for each of `sm.visuals`.
    `related`: slide ids that zooms on this slide open. `background`: the path
    of the slide's own background picture."""
    entry = lookup_entry(sm.layout_name, template, mapping)
    # An explicit role for this layout wins over the template-wide ignore list
    # (idx numbers mean different things per layout, e.g. 91 = logo or a text box).
    ignore = (set(template.get("pptxIgnore", []) or []) | entry.ignore) - set(entry.roles)
    sm, image_paths = _drop_ignored(sm, images, ignore)
    # Text boxes holding only a number ("1", "2.") are decorative numbering
    # (agendas, numbered cards); the Slipr layout numbers its own items.
    numbering = [b for b in sm.bodies if _NUMBER_ONLY.match(markdown_to_plain(b.markdown))]
    if numbering:
        sm = replace(sm, bodies=[b for b in sm.bodies if b not in numbering])
    # Text boxes and shapes whose box is visible (a fill or a line: badges, pills,
    # callouts) become text elements at their place; they need no slot (D-016, I-089).
    shaped = [b for b in sm.bodies if b.look is not None and b.look.is_shape] if _known_size(slide_size) else []
    if shaped:
        sm = replace(sm, bodies=[b for b in sm.bodies if all(b is not s for s in shaped)])
    fonts = (template.get("styleguide") or {}).get("fonts") or {}

    layout_id, reason = choose_layout(sm, template, mapping)
    layout = next(l for l in template["layouts"] if l["id"] == layout_id)
    slot_types = {s["name"]: s["type"] for s in layout.get("slots", [])}
    result = MappedSlide(slide={"id": slide_id, "layout": layout_id}, layout=layout_id, reason=reason,
                         picture_styles=[s for s in template.get("pictureStyles", []) or [] if isinstance(s, dict)])
    if numbering:
        result.remarks.append(f"{len(numbering)} numbering text box(es) left out (the layout numbers its own items)")
    content: dict = {}
    blocks: list[dict] = []
    had_title = sm.title is not None or any(r == "title" for r in entry.roles.values())

    # 1. Placeholder roles: content goes straight into the slot the template names.
    if entry.layout == layout_id and entry.roles:
        sm, image_paths = _apply_roles(sm, image_paths, entry.roles, slot_types, content, result, layout)

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
    # What is left: text boxes become text elements at their place (I-089),
    # placeholder text goes to the reader layer.
    text_overlays: list[tuple[TextBody, dict]] = []
    n = 0
    for body in shaped + bodies:
        if body.look is not None and (overlay := _text_overlay_value(body, slide_size, fonts)) is not None:
            text_overlays.append((body, overlay))
            result.placed.append(f"text box “{_preview(body.markdown)}”")
            continue
        n += 1
        blocks.append({"id": f"converted-text-{n}", "type": "text", "md": body.markdown})
        result.moved.append(f"text block {n} (“{_preview(body.markdown)}”)")

    # Pictures → image slots; extra pictures become extra images at their
    # PowerPoint position (D-013), or reader image blocks when that is unknown.
    free_images = list(cap.image_slots)
    overlays: list[dict] = []
    for n, (ref, path) in enumerate(zip(sm.images, image_paths), 1):
        value = _image_value(ref, path, result, n)
        if free_images:
            content[free_images.pop(0)] = value
        elif (overlay := _overlay_value(ref, value, slide_size)) is not None:
            if (fragment := _fragment(sm.entrances.get(ref.shape_id))) is not None:
                overlay["fragment"] = fragment
            overlays.append(overlay)
            result.placed.append(f"picture {n}")
        else:
            blocks.append({"id": f"converted-image-{n}", "type": "image", "image": value})
            result.moved.append(f"picture {n}")
    # Text elements in front of the extra images (labels on pictures), in reading order.
    for body, overlay in sorted(text_overlays, key=lambda pair: (pair[0].top, pair[0].left)):
        if (fragment := _fragment(sm.entrances.get(body.shape_id))) is not None:
            overlay["fragment"] = fragment
        overlays.append(overlay)

    # Tables, charts, SmartArt and videos → a slot of their type (by placeholder
    # role first), else a reader block of the same type (I-121).
    roles = entry.roles if entry.layout == layout_id else {}
    free_visual = {t: list(names) for t, names in capacity(layout, set(content)).visual_slots.items()}
    counts: Counter = Counter()
    for v, (video_path, poster_path) in zip(sm.visuals, visual_assets or [(None, None)] * len(sm.visuals)):
        slot_type = vis.SLOT_TYPE[v.kind]
        counts[v.kind] += 1
        label = f"{_VISUAL_LABEL[v.kind]} {counts[v.kind]}"
        value = _visual_value(v, video_path, poster_path, result, label)
        if value is None:
            result.skipped.append(label)
            continue
        free = free_visual.get(slot_type, [])
        slot = roles.get(v.idx) if v.idx is not None else None
        if not (slot and slot in free):
            slot = free[0] if free else None
        if slot:
            free.remove(slot)
            content[slot] = value
        else:
            counts[f"block-{slot_type}"] += 1
            blocks.append({"id": f"converted-{slot_type}-{counts[f'block-{slot_type}']}", "type": slot_type, **value})
            result.moved.append(f"{label} (the layout has no free {slot_type} slot)")

    if not had_title:
        result.remarks.append("no title found on this slide")
    result.slide["content"] = content
    if overlays:
        result.slide["overlays"] = overlays
    if chapter:
        result.slide["chapter"] = chapter

    # Notes, and what could not be converted
    notes = sm.notes if include_notes else None
    if sm.unsupported:
        kinds = ", ".join(sorted(set(sm.unsupported)))
        result.skipped.extend(sm.unsupported)
        warning = f"_[Converter] Not converted from PowerPoint: {kinds}._"
        notes = f"{notes}\n\n{warning}" if notes else warning
    for marker in result.converted_notes:
        notes = f"{notes}\n\n{marker}" if notes else marker
    if notes:
        result.slide["notes"] = notes
    if notes_to_reader and include_notes and sm.notes:
        blocks.append({"id": "notes", "type": "text", "md": sm.notes})

    audience: dict = {}
    if sm.hidden:
        audience["hidden"] = True
    if sm.has_build_animations and any(content.get(s["name"]) for s in layout.get("slots", []) if s["type"] in LIST_TYPES):
        audience["fragments"] = True
    if background:
        audience["background"] = background
    if audience:
        result.slide["audience"] = audience
    reader: dict = {}
    if blocks:
        reader["blocks"] = blocks
    if related:
        reader["related"] = list(related)
        result.remarks.append(f"zoom to {', '.join(related)} → related slides (reader mode)")
    if reader:
        result.slide["reader"] = reader
    return result


_VISUAL_LABEL = {"table": "table", "chart": "chart", "smartArt": "SmartArt", "video": "video"}


def _visual_value(v: Visual, video_path: str | None, poster_path: str | None, result: MappedSlide, label: str) -> dict | None:
    """The Slipr value of a visual (I-121), with its remarks in the report."""
    if v.kind == "table":
        value, remarks = vis.table_value(v.rows or [])
        result.remarks.extend(remarks)
        return value
    if v.kind == "chart":
        title = f" “{v.chart.title}”" if v.chart.title else ""
        result.remarks.append(f"{label}{title} converted to a table with its data")
        result.converted_notes.append(f"_[Converter] A PowerPoint chart{title} was converted to a table._")
        return vis.chart_value(v.chart)
    if v.kind == "smartArt":
        result.remarks.append(f"{label} ({v.diagram.kind}) converted to a Mermaid diagram")
        return vis.diagram_value(v.diagram)
    value, remarks = vis.video_value(v.video, video_path, poster_path)
    result.remarks.extend(remarks)
    return value


# PowerPoint entrance effects (presetID) → Reveal fragment styles; Fly In by direction (presetSubtype).
_FLY_IN = {1: "fade-down", 2: "fade-left", 4: "fade-up", 8: "fade-right"}


def _fragment(effect: tuple[int, int] | None):
    """An overlay's `fragment` for a PowerPoint entrance effect, or None."""
    if effect is None:
        return None
    preset, subtype = effect
    if preset == 10:
        return "fade-in"
    if preset == 2:
        return _FLY_IN.get(subtype, True)
    if preset in (23, 31, 53):  # Zoom, Grow & Turn, Grow
        return "grow"
    return True


# PowerPoint transitions → Slipr transitions (I-121); others become "fade".
_TRANSITIONS = {
    "fade": "fade", "dissolve": "fade", "flash": "fade",
    "push": "slide", "wipe": "slide", "cover": "slide", "pull": "slide", "split": "slide", "reveal": "slide",
    "uncover": "slide", "pan": "slide", "conveyor": "slide", "ferris": "slide",
    "zoom": "zoom", "vortex": "zoom", "ripple": "zoom", "warp": "zoom", "flythrough": "zoom",
    "prism": "convex", "cube": "convex", "gallery": "convex", "flip": "convex", "switch": "convex",
    "doors": "concave", "window": "concave",
    "cut": "none", "none": "none", "morph": "none",
}


def slipr_transition(name: str | None) -> str | None:
    """The Slipr transition for a PowerPoint one; None when the slide has none.
    Morph becomes auto-animate (emit) without a transition of its own;
    other effects become a fade."""
    if name is None:
        return None
    return _TRANSITIONS.get(name, "fade")


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


_CARD_ROLE = re.compile(r"^([A-Za-z0-9][\w-]*)\[(\d+)\](?:\.([A-Za-z0-9][\w-]*))?$")


def _apply_roles(
    sm: SlideModel, paths: list[str], roles: dict[int, str], slot_types: dict[str, str],
    content: dict, result: MappedSlide, layout: dict | None = None,
) -> tuple[SlideModel, list[str]]:
    """Put role-mapped content into its slot; return what is left for generic filling.

    Roles: "slot", or for cards slots "slot[i]" (the whole card: the
    placeholder's paragraphs fill the card's text fields in order, the last
    text field takes the rest) and "slot[i].field" (one field).
    """
    slot_defs = {s["name"]: s for s in (layout or {}).get("slots", [])}

    def card(slot: str, i: int) -> dict:
        cards = content.setdefault(slot, [])
        while len(cards) <= i:
            cards.append({})
        return cards[i]

    def put_card(role: str, text: str | None, md: str | None, image: dict | None) -> bool:
        m = _CARD_ROLE.match(role)
        slot_def = slot_defs.get(m.group(1)) if m else None
        if not m or not slot_def or slot_def.get("type") != "cards":
            result.remarks.append(f"placeholder role “{role}” does not name a cards slot (ignored)")
            return False
        fields = slot_def.get("fields", [])
        target = card(m.group(1), int(m.group(2)))
        if m.group(3):  # one field
            field = next((f for f in fields if f["name"] == m.group(3)), None)
            if field is None or field["name"] in target:
                return False
            if field["type"] == "image":
                if image is None:
                    return False
                target[field["name"]] = image
            elif field["type"] == "text":
                target[field["name"]] = text if text is not None else markdown_to_plain(md or "")
            else:
                target[field["name"]] = md if md is not None else _escape(text or "")
            return True
        if image is not None:  # a whole card from a picture: its first free image field
            field = next((f for f in fields if f["type"] == "image" and f["name"] not in target), None)
            if field is None:
                return False
            target[field["name"]] = image
            return True
        # A whole card from text: spread the blocks over the free text fields.
        blocks = [b for b in (md if md is not None else _escape(text or "")).split("\n\n") if b.strip()]
        free = [f for f in fields if f["type"] != "image" and f["name"] not in target]
        for n, field in enumerate(free):
            if not blocks:
                break
            last = n == len(free) - 1
            chunk = "\n\n".join(blocks) if last else blocks.pop(0)
            if last:
                blocks = []
            target[field["name"]] = markdown_to_plain(chunk) if field["type"] == "text" else chunk
        return True

    def put(slot: str, text: str | None, md: str | None) -> bool:
        if "[" in slot:
            return put_card(slot, text, md, None)
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
        if slot and "[" in slot and put_card(slot, None, None, _image_value(im, path, result, n)):
            continue
        if slot and slot_types.get(slot) == "image" and slot not in content:
            content[slot] = _image_value(im, path, result, n)
            continue
        images.append(im)
        left_paths.append(path)
    # Cards that received nothing (e.g. empty placeholders) are dropped.
    for name, value in list(content.items()):
        if slot_types.get(name) == "cards" and isinstance(value, list):
            content[name] = [c for c in value if c]
            if not content[name]:
                del content[name]
    return replace(sm, title=title, subtitle=subtitle, bodies=bodies, images=images), left_paths


def _image_value(ref: ImageRef, path: str, result: MappedSlide, n: int) -> dict:
    if not ref.alt:
        result.remarks.append(f"picture {n} has no alt text (add a description in PowerPoint or in show.json)")
    # No "fit": the template decides how its image slots crop (cover or contain).
    value = {"src": path, "alt": ref.alt}
    # PowerPoint picture effects → the first template picture style that stands
    # for one of them (D-014, I-084); transparency → opacity.
    for effect in ref.effects:
        style = next((s["id"] for s in result.picture_styles if s.get("pptxEffect") == effect), None)
        if style:
            value["style"] = style
            break
    if ref.effects and "style" not in value:
        result.remarks.append(f"picture {n}: the template has no picture style for {', '.join(ref.effects)}")
    if ref.opacity is not None:
        value["opacity"] = ref.opacity
    # PowerPoint's picture crop → the shown part (I-090).
    if ref.crop is not None:
        x, y, w, h = ref.crop
        value["crop"] = {"x": x, "y": y, "w": w, "h": h}
    # Morph pairs shapes named "!!name" (I-121 → morphId, I-091).
    if ref.name.startswith("!!") and (morph_id := re.sub(r"[^A-Za-z0-9_-]+", "-", ref.name[2:]).strip("-")):
        value["morphId"] = morph_id
    return value


def _overlay_value(ref: ImageRef, image: dict, slide_size: tuple[int, int] | None) -> dict | None:
    """An extra image at the picture's place on the slide (fractions of the
    slide, kept inside it), or None when the slide or picture size is unknown."""
    box = _box(ref.left, ref.top, ref.width, ref.height, slide_size)
    return None if box is None else {"image": image, **box}


def _known_size(slide_size: tuple[int, int] | None) -> bool:
    return bool(slide_size) and slide_size[0] > 0 and slide_size[1] > 0


def _box(left: int, top: int, width: int, height: int, slide_size: tuple[int, int] | None) -> dict | None:
    """x, y, w, h as fractions of the slide, kept inside it; None when a size is unknown."""
    if not _known_size(slide_size) or width <= 0 or height <= 0:
        return None
    sw, sh = slide_size
    w = min(1.0, max(0.02, width / sw))
    h = min(1.0, max(0.02, height / sh))
    x = min(1.0 - w, max(0.0, left / sw))
    y = min(1.0 - h, max(0.0, top / sh))
    return {"x": round(x, 4), "y": round(y, 4), "w": round(w, 4), "h": round(h, 4)}


def _text_overlay_value(body: TextBody, slide_size: tuple[int, int] | None, fonts: dict) -> dict | None:
    """A text element at the text box's place, with its look (D-016, I-089), or
    None when the slide or box size is unknown."""
    box = _box(body.left, body.top, body.width, body.height, slide_size)
    if box is None or body.look is None:
        return None
    value: dict = {"text": _inline_text(body.markdown)}
    style = _text_style(body.look, slide_size[0], fonts)
    if style:
        value["style"] = style
    return value | box


def _inline_text(md: str) -> str:
    """Block Markdown → the inline Markdown of a text element: one line per
    paragraph or list item (bullets become "•"), no blank lines."""
    lines = []
    for line in md.split("\n"):
        if not line.strip():
            continue
        m = re.match(r"^\s*[-*+]\s+(.*)$", line)
        lines.append(f"• {m.group(1)}" if m else line.strip())
    return "\n".join(lines)


_MONO_FONTS = ("consolas", "courier", "menlo", "monaco", "cascadia", "mono", "lucida console")
_SERIF_FONTS = ("serif", "times", "georgia", "cambria", "garamond", "palatino", "book antiqua")


def _font_role(typeface: str | None, fonts: dict) -> str:
    """The text style font for a PowerPoint typeface: the template's heading or
    body font when it is the theme's or the template's, a platform mono or
    serif font for those families, else the template's body font."""
    if not typeface or typeface.startswith("+mn"):
        return "body"
    if typeface.startswith("+mj"):
        return "heading"
    face = typeface.strip().lower()

    def family(v) -> str:  # "Arial Black (uppercase)" → "arial black"
        return re.sub(r"\s*\(.*$", "", str(v or "")).strip().lower()

    if face == family(fonts.get("heading")):
        return "heading"
    if face == family(fonts.get("body")):
        return "body"
    if any(k in face for k in _MONO_FONTS):
        return "mono"
    if "sans" not in face and any(k in face for k in _SERIF_FONTS):
        return "serif"
    return "body"


def _text_style(look: TextLook, slide_width: int, fonts: dict) -> dict:
    """A Slipr text style (schema key order) from a PowerPoint look. Lengths
    become percentages of the slide width, sizes from points."""
    def pct(emu: float, high: float) -> float:
        return round(min(high, max(0.0, emu / slide_width * 100)), 2)

    style: dict = {}
    font = _font_role(look.typeface, fonts)
    if font != "body":
        style["font"] = font
    if look.size_pt:
        style["size"] = round(min(20.0, max(0.5, look.size_pt * 12700 / slide_width * 100)), 2)
    if look.underline:
        style["underline"] = True
    if look.caps:
        style["uppercase"] = True
    if look.align:
        style["align"] = look.align
    if look.anchor:
        style["valign"] = look.anchor
    if look.color:
        style["color"] = look.color
    if look.fill:
        style["background"] = look.fill
        if look.fill_alpha is not None and look.fill_alpha < 1:
            style["backgroundOpacity"] = look.fill_alpha
    if look.line_width and (width := pct(look.line_width, 5)) > 0:
        style["borderWidth"] = width
        if look.line_dash:
            style["borderStyle"] = look.line_dash
        if look.line_color:
            style["borderColor"] = look.line_color
    if look.corner and (radius := pct(look.corner, 50)) > 0:
        style["radius"] = radius
    if look.inset and (padding := pct(look.inset, 10)) > 0:
        style["padding"] = padding
    return style


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
