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
    shape_id: int = 0  # PowerPoint's shape id (animations name shapes by it), I-121

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
    shape_id: int = 0  # PowerPoint's shape id (animations name shapes by it), I-121
    name: str = ""  # the shape's name; "!!name" pairs pictures for Morph, I-121


@dataclass
class ChartData:
    """A chart's data: categories × series (I-121)."""

    title: str | None
    categories: list[str]
    series: list[tuple[str, list[float | None]]]  # (name, one value per category)
    number_format: str = "General"  # Excel-style format code of the values, e.g. '0.0%'


@dataclass
class DiagramNode:
    text: str
    children: list[DiagramNode] = field(default_factory=list)


@dataclass
class DiagramData:
    """A SmartArt graphic's node tree (I-121).

    kind: 'hierarchy' | 'process' | 'cycle' | 'list', from its layout.
    """

    kind: str
    roots: list[DiagramNode]


@dataclass
class VideoData:
    """A video: embedded (`blob`) or online (`url`), I-121."""

    title: str
    blob: bytes | None = None
    ext: str = "mp4"
    url: str | None = None
    poster: tuple[bytes, str, str] | None = None  # (blob, ext, sha1) of the poster frame
    start_ms: int = 0  # PowerPoint's trim from the start
    end_trim_ms: int = 0  # PowerPoint's trim from the end (the video's length is unknown)
    bookmarks: list[tuple[int, str]] = field(default_factory=list)  # (ms, name)


@dataclass
class Visual:
    """A table, chart, SmartArt graphic or video on a slide (I-121).

    kind: 'table' | 'chart' | 'smartArt' | 'video'. Exactly one of the data
    fields is set: `rows` (table: the first row holds the labels), `chart`,
    `diagram` or `video`.
    """

    kind: str
    top: int = 0
    left: int = 0
    idx: int | None = None
    rows: list[list[str]] | None = None
    chart: ChartData | None = None
    diagram: DiagramData | None = None
    video: VideoData | None = None


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
    visuals: list[Visual] = field(default_factory=list)  # tables, charts, SmartArt, videos (I-121)
    transition: str | None = None  # PowerPoint transition name ('fade', 'push', 'morph', …); None = none set
    entrances: dict[int, tuple[int, int]] = field(default_factory=dict)  # shape id → (presetID, presetSubtype)
    zoom_targets: list[int] = field(default_factory=list)  # PowerPoint slide ids that slide / section zooms open
    background: ImageRef | None = None  # the slide's own background picture


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
    slide_parts: list[str] = field(default_factory=list)  # each slide's part name, for slide links (I-121)


@dataclass
class Asset:
    path: str  # relative to the show folder, e.g. 'images/slide03-1.png'
    data: bytes


@dataclass
class ConversionResult:
    show: dict
    assets: list[Asset]
    report: Report
