"""Intermediate model: what was found in the deck, independent of Slipr.

This is the seam between "understanding PowerPoint" (reader, extract, text)
and "producing Slipr" (mapping, emit).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .report import Report


@dataclass
class TextBody:
    """A block of text from a placeholder or text box."""

    markdown: str
    is_list: bool
    placeholder: str | None  # 'body', 'object', … or None for a plain text box
    top: int = 0
    left: int = 0
    idx: int | None = None  # placeholder idx (for template placeholder roles), None for text boxes

    @property
    def plain_length(self) -> int:
        return len(self.markdown.replace("*", "").replace("- ", ""))


@dataclass
class ImageRef:
    blob: bytes
    ext: str
    sha1: str
    alt: str
    top: int = 0
    left: int = 0
    width: int = 0
    height: int = 0
    idx: int | None = None  # placeholder idx when the picture fills a placeholder


@dataclass
class SlideModel:
    index: int  # 0-based position in the deck
    slide_id: int  # PowerPoint's internal slide id (used for sections)
    layout_name: str
    hidden: bool = False
    section: str | None = None
    title: str | None = None
    subtitle: str | None = None
    title_idx: int | None = None
    subtitle_idx: int | None = None
    bodies: list[TextBody] = field(default_factory=list)
    images: list[ImageRef] = field(default_factory=list)
    notes: str | None = None
    unsupported: list[str] = field(default_factory=list)
    has_build_animations: bool = False


@dataclass
class DeckModel:
    title: str | None
    author: str | None
    date: str | None  # ISO YYYY-MM-DD
    aspect_ratio: str  # '16:9' or '4:3'
    sections: list[str]  # section names in order (empty when the deck has none)
    slides: list[SlideModel]


@dataclass
class Asset:
    path: str  # relative to the show folder, e.g. 'images/slide03-1.png'
    data: bytes


@dataclass
class ConversionResult:
    show: dict
    assets: list[Asset]
    report: Report
