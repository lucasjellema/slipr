"""The export report: per slide, what went where and what PowerPoint could not take.

Written as `<deck>-export-report.md` next to the .pptx.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ExportSlideReport:
    number: int
    slide_id: str
    title: str
    layout: str = ""
    reason: str = ""
    placed: list[str] = field(default_factory=list)  # content drawn as free shapes (no placeholder for it)
    fallbacks: list[str] = field(default_factory=list)  # rich content shown as a picture, link card or list
    skipped: list[str] = field(default_factory=list)  # content that could not be exported
    notes: list[str] = field(default_factory=list)


@dataclass
class ExportReport:
    source: str
    slides: list[ExportSlideReport] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def slide(self, number: int, slide_id: str, title: str) -> ExportSlideReport:
        entry = ExportSlideReport(number, slide_id, title)
        self.slides.append(entry)
        return entry

    @property
    def fallback_count(self) -> int:
        return sum(len(s.fallbacks) for s in self.slides)

    @property
    def skipped_count(self) -> int:
        return sum(len(s.skipped) for s in self.slides)

    def to_markdown(self) -> str:
        lines = [
            "# PowerPoint export report",
            "",
            f"Source: `{self.source}`",
            "",
            f"- Slides: {len(self.slides)}",
            f"- Rich content as a picture, card or list: {self.fallback_count}",
            f"- Not exported: {self.skipped_count}",
            "",
        ]
        if self.warnings:
            lines += ["## Warnings", "", *[f"- {w}" for w in self.warnings], ""]
        lines += ["## Slides", ""]
        for s in self.slides:
            lines += [f"### {s.number}. {s.title or '(untitled)'} (`{s.slide_id}`)", ""]
            lines.append(f"- PowerPoint layout: **{s.layout}** ({s.reason})")
            lines += [f"- Placed as a free shape: {p}" for p in s.placed]
            lines += [f"- Fallback: {f}" for f in s.fallbacks]
            lines += [f"- ⚠ Not exported: {k}" for k in s.skipped]
            lines += [f"- {n}" for n in s.notes]
            lines.append("")
        return "\n".join(lines)
