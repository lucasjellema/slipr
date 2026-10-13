"""The conversion report: every decision and every loss, per slide.

Written as `conversion-report.md` next to show.json, so the author knows
exactly which slides to touch up.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SlideReport:
    number: int  # 1-based, as PowerPoint shows it
    slide_id: str  # Slipr slide id
    title: str
    layout: str = ""
    reason: str = ""
    moved: list[str] = field(default_factory=list)  # content placed in the reader layer
    placed: list[str] = field(default_factory=list)  # pictures placed as extra images (I-083), text boxes as text elements (I-089)
    skipped: list[str] = field(default_factory=list)  # content that could not be converted
    notes: list[str] = field(default_factory=list)  # other remarks


@dataclass
class Report:
    source: str
    slides: list[SlideReport] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)  # deck-level (e.g. validation)

    def slide(self, number: int, slide_id: str, title: str) -> SlideReport:
        entry = SlideReport(number, slide_id, title)
        self.slides.append(entry)
        return entry

    @property
    def skipped_count(self) -> int:
        return sum(len(s.skipped) for s in self.slides)

    @property
    def moved_count(self) -> int:
        return sum(len(s.moved) for s in self.slides)

    @property
    def placed_count(self) -> int:
        return sum(len(s.placed) for s in self.slides)

    def to_markdown(self) -> str:
        lines = [
            "# Conversion report",
            "",
            f"Source: `{self.source}`",
            "",
            f"- Slides: {len(self.slides)}",
            f"- Content moved to the reader layer: {self.moved_count}",
            f"- Placed on the slide as extra images or text elements: {self.placed_count}",
            f"- Elements not converted: {self.skipped_count}",
            "",
        ]
        if self.warnings:
            lines += ["## Warnings", "", *[f"- {w}" for w in self.warnings], ""]
        lines += ["## Slides", ""]
        for s in self.slides:
            lines.append(f"### {s.number}. {s.title or '(untitled)'} → `{s.slide_id}`")
            lines.append("")
            lines.append(f"- Layout: **{s.layout}** ({s.reason})")
            lines += [f"- Moved to reader layer: {m}" for m in s.moved]
            lines += [f"- Placed as a text element: {p}" if p.startswith("text box") else f"- Placed as an extra image: {p}" for p in s.placed]
            lines += [f"- ⚠ Not converted: {k}" for k in s.skipped]
            lines += [f"- {n}" for n in s.notes]
            lines.append("")
        return "\n".join(lines)
