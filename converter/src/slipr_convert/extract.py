"""python-pptx objects → intermediate model (model.py).

What is extracted per slide: title, subtitle, text bodies (placeholders and
text boxes, in reading order), pictures with alt text, speaker notes, the
hidden flag, the section, build animations, and a list of elements that
cannot be converted (tables, charts, SmartArt, media, …).

Pictures and shapes from the slide layout / master (logos, decorations) are
not part of `slide.shapes` and are therefore ignored, as intended: the Slipr
template provides the looks.
"""
from __future__ import annotations

from pptx.enum.shapes import MSO_SHAPE_TYPE, PP_PLACEHOLDER

from . import reader, text
from .model import DeckModel, ImageRef, SlideModel, TextBody

_TITLE = {PP_PLACEHOLDER.TITLE, PP_PLACEHOLDER.CENTER_TITLE, PP_PLACEHOLDER.VERTICAL_TITLE}
_SUBTITLE = {PP_PLACEHOLDER.SUBTITLE}
_IGNORED = {PP_PLACEHOLDER.DATE, PP_PLACEHOLDER.FOOTER, PP_PLACEHOLDER.SLIDE_NUMBER, PP_PLACEHOLDER.HEADER}
_LIST_PLACEHOLDERS = {PP_PLACEHOLDER.BODY, PP_PLACEHOLDER.OBJECT, PP_PLACEHOLDER.VERTICAL_BODY, PP_PLACEHOLDER.VERTICAL_OBJECT}


def extract_deck(prs) -> DeckModel:
    section_of: dict[int, str] = {}
    section_names = []
    for name, ids in reader.sections(prs):
        section_names.append(name)
        for sid in ids:
            section_of[sid] = name

    slides = [extract_slide(slide, i, section_of.get(slide.slide_id)) for i, slide in enumerate(prs.slides)]

    core = prs.core_properties
    stamp = core.modified or core.created
    ratio = (prs.slide_width or 4) / (prs.slide_height or 3)
    return DeckModel(
        title=(core.title or "").strip() or None,
        author=(core.author or "").strip() or None,
        date=stamp.date().isoformat() if stamp else None,
        aspect_ratio="4:3" if abs(ratio - 4 / 3) < 0.05 else "16:9",
        sections=section_names,
        slides=slides,
    )


def extract_slide(slide, index: int, section: str | None) -> SlideModel:
    model = SlideModel(
        index=index,
        slide_id=slide.slide_id,
        layout_name=slide.slide_layout.name or "",
        hidden=reader.is_hidden(slide),
        section=section,
        has_build_animations=reader.has_build_animations(slide),
    )
    for shape in _walk(slide.shapes):
        _extract_shape(shape, model)

    model.bodies.sort(key=lambda b: (b.top, b.left))
    model.images.sort(key=lambda im: (im.top, im.left))

    if slide.has_notes_slide:  # NB: accessing slide.notes_slide would create one
        frame = slide.notes_slide.notes_text_frame
        if frame is not None:
            notes = text.notes_markdown(frame)
            model.notes = notes or None
    return model


def _walk(shapes):
    """All shapes, descending into groups."""
    for shape in shapes:
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from _walk(shape.shapes)
        else:
            yield shape


def _extract_shape(shape, model: SlideModel) -> None:
    ph_type = shape.placeholder_format.type if shape.is_placeholder else None
    idx = shape.placeholder_format.idx if shape.is_placeholder else None
    if ph_type in _IGNORED:
        return
    top, left = int(shape.top or 0), int(shape.left or 0)

    # Pictures (plain pictures and filled picture placeholders)
    image = _image_of(shape)
    if image is not None:
        blob, ext, sha1 = image
        model.images.append(ImageRef(
            blob=blob, ext=ext, sha1=sha1, alt=reader.alt_text(shape),
            top=top, left=left, width=int(shape.width or 0), height=int(shape.height or 0), idx=idx,
        ))
        return

    kind = reader.graphic_kind(shape)  # tables, charts, SmartArt, OLE (also inside placeholders)
    if shape.shape_type == MSO_SHAPE_TYPE.MEDIA or kind:
        model.unsupported.append(kind or "media")
        return

    if not getattr(shape, "has_text_frame", False) or not shape.text_frame.text.strip():
        return  # empty placeholder or a decorative shape

    if ph_type in _TITLE and model.title is None:
        model.title = text.plain_text(shape.text_frame)
        model.title_idx = idx
        return
    if ph_type in _SUBTITLE and model.subtitle is None:
        model.subtitle = text.plain_text(shape.text_frame)
        model.subtitle_idx = idx
        return

    as_list = ph_type in _LIST_PLACEHOLDERS or (shape.is_placeholder and ph_type is None)
    markdown = text.frame_markdown(shape.text_frame, as_list=as_list,
                                   style_of=lambda paragraph: reader.paragraph_style(shape, paragraph))
    if markdown:
        placeholder = ph_type.name.lower() if ph_type is not None else None
        model.bodies.append(TextBody(markdown=markdown, is_list=markdown.lstrip().startswith("- "),
                                     placeholder=placeholder, top=top, left=left, idx=idx))


def _image_of(shape):
    """(blob, ext, sha1) for shapes that carry a picture, else None.

    `shape.image` raises ValueError for linked (not embedded) pictures and
    for empty picture placeholders, so hasattr() cannot be used to probe it.
    """
    if shape.shape_type != MSO_SHAPE_TYPE.PICTURE and not shape.is_placeholder:
        return None
    try:
        img = shape.image
    except (AttributeError, ValueError, KeyError):
        if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
            return None  # a linked picture: nothing to copy
        return None  # an empty picture placeholder, or not a picture at all
    return img.blob, (img.ext or "png").lower(), img.sha1
