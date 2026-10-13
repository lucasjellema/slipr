"""Intermediate model: what was found in the deck, independent of Slipr.

This is the seam between "understanding PowerPoint" (reader, extract, text)
and "producing Slipr" (mapping, emit).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .report import Report


@dataclass
class TextLook:
    """What a free text box or shape looks like, in PowerPoint terms (EMU,
    points, #rrggbb). mapping.py turns it into a Slipr text style.

    typeface: the first run's font, or '+mj-lt' / '+mn-lt' for the theme's
    heading / body font; None when inherited.
    """

    typeface: str | None = None
    size_pt: float | None = None
    caps: bool = False
    underline: bool = False
    align: str | None = None  # 'center' | 'right'; None = left
    anchor: str | None = None  # 'middle' | 'bottom'; None = top
    color: str | None = None
    fill: str | None = None
    fill_alpha: float | None = None  # 0–1, None = opaque
    line_width: int = 0  # EMU; 0 = no visible line
    line_dash: str | None = None  # 'dashed' | 'dotted'; None = solid
    line_color: str | None = None
    corner: int = 0  # corner radius, EMU
    inset: int = 91440  # left inset (PowerPoint's default 0.1 in)

    @property
    def is_shape(self) -> bool:
        """True when the box itself is visible (a fill or a line): a badge, pill or callout."""
        return bool(self.fill or self.line_width)


@dataclass
class TextBody:
    """A block of text from a placeholder or text box."""

    markdown: str
    is_list: bool
    placeholder: str | None  # 'body', 'object', … or None for a plain text box
    top: int = 0
    left: int = 0
    idx: int | None = None  # placeholder idx (for template placeholder roles), None for text boxes
    width: int = 0
    height: int = 0
    look: TextLook | None = None  # text boxes and shapes only (not placeholders): their look, I-089

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
    effects: list[str] = field(default_factory=list)  # PowerPoint picture effects (reader.PICTURE_EFFECTS), I-084
    opacity: float | None = None  # from the picture's transparency; None when opaque
    crop: tuple[float, float, float, float] | None = None  # shown part (x, y, w, h), fractions of the picture, I-090


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
    slide_width: int = 0  # EMU; 0 when unknown (positions of extra images need it)
    slide_height: int = 0


@dataclass
class Asset:
    path: str  # relative to the show folder, e.g. 'images/slide03-1.png'
    data: bytes


@dataclass
class ConversionResult:
    show: dict
    assets: list[Asset]
    report: Report
