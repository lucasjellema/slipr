"""The converter core: a .pptx in, a ConversionResult out. No files written.

    from slipr_convert import convert
    result = convert("deck.pptx", template, template_ref="../../templates/default")
    result.show       # dict, ready for json.dumps
    result.assets     # images to write next to show.json
    result.report     # what was decided and what was lost
"""
from __future__ import annotations

from pathlib import Path

from .emit import build_show, slugify
from .extract import extract_deck
from .model import ConversionResult
from .reader import Source, open_presentation


def convert(
    source: Source,
    template: dict,
    *,
    template_ref: str,
    show_id: str | None = None,
    source_name: str | None = None,
    language: str = "en",
    schema_ref: str | None = None,
    layout_mapping: dict[str, str] | None = None,
    include_notes: bool = True,
    notes_to_reader: bool = False,
) -> ConversionResult:
    name = source_name or (Path(source).name if isinstance(source, (str, Path)) else "deck.pptx")
    deck = extract_deck(open_presentation(source))
    return build_show(
        deck, template,
        template_ref=template_ref,
        show_id=show_id or slugify(Path(name).stem) or "converted-show",
        source_name=name,
        language=language,
        schema_ref=schema_ref,
        layout_mapping=layout_mapping,
        include_notes=include_notes,
        notes_to_reader=notes_to_reader,
    )
