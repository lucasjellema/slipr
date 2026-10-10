"""DrawingML text → Slipr Markdown (see docs/show-format.md → Markdown subset).

- Bullet levels become nested `- ` items (two spaces per level).
- Bold / italic runs become **…** / *…*; hyperlinks become [text](url).
- Characters that mean something in Slipr Markdown are escaped.
"""
from __future__ import annotations

import re

from . import reader

_SPECIAL = re.compile(r"([\\`*_\[\]])")


def escape_markdown(text: str) -> str:
    return _SPECIAL.sub(r"\\\1", text)


def plain_text(text_frame) -> str:
    """All text of a frame on one line (for titles and subtitles)."""
    parts = []
    for paragraph in text_frame.paragraphs:
        chunk = "".join(" " if kind == "break" else (run.text or "") for kind, run in reader.paragraph_parts(paragraph))
        if chunk.strip():
            parts.append(chunk.strip())
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def runs_markdown(paragraph, *, breaks_as: str = "\n") -> str:
    """One paragraph's runs as inline Markdown."""
    # Segments: ("text", text, bold, italic, link) or ("break",).
    segments: list[tuple] = []
    for kind, run in reader.paragraph_parts(paragraph):
        if kind == "break":
            segments.append(("break",))
            continue
        text = run.text or ""
        if not text:
            continue
        try:
            link = run.hyperlink.address
        except Exception:  # fields have no hyperlink support
            link = None
        fmt = (run.font.bold is True, run.font.italic is True, link)
        # Merge neighbours with identical formatting, so we never emit "**a****b**".
        if segments and segments[-1][0] == "text" and segments[-1][2:] == fmt:
            segments[-1] = ("text", segments[-1][1] + text, *fmt)
        else:
            segments.append(("text", text, *fmt))

    out = []
    for seg in segments:
        if seg[0] == "break":
            out.append(breaks_as)
            continue
        _, text, bold, italic, link = seg
        lead = text[: len(text) - len(text.lstrip())]
        trail = text[len(text.rstrip()):]
        core = escape_markdown(text.strip())
        if core:
            if italic:
                core = f"*{core}*"
            if bold:
                core = f"**{core}**"
            if link and re.match(r"^(https?:|mailto:)", link, re.I):
                core = f"[{core}]({link})"
        out.append(f"{lead}{core}{trail}")
    return re.sub(r"[ \t]+\n", "\n", "".join(out)).strip()


def frame_markdown(text_frame, *, as_list: bool, inherited=None) -> str:
    """A whole text frame as Markdown: bullet lists and/or paragraphs.

    Bullets per paragraph: its own setting, else `inherited(level)` (the
    layout / master placeholder's setting), else `as_list` (placeholders
    usually have bullets from the master; text boxes don't).
    """
    blocks: list[tuple[str, list[str]]] = []  # ("list", lines) or ("para", [text])
    for paragraph in text_frame.paragraphs:
        setting = reader.bullet_setting(paragraph)
        if setting is None and inherited is not None:
            setting = inherited(paragraph.level)
        bulleted = setting == "on" or (setting is None and as_list)
        text = runs_markdown(paragraph, breaks_as=" " if bulleted else "\n")
        if not text:
            continue
        if bulleted:
            line = f"{'  ' * max(0, min(paragraph.level, 8))}- {text}"
            if blocks and blocks[-1][0] == "list":
                blocks[-1][1].append(line)
            else:
                blocks.append(("list", [line]))
        else:
            blocks.append(("para", [text]))
    return "\n\n".join("\n".join(lines) for _, lines in blocks).strip()


def notes_markdown(text_frame) -> str:
    """Speaker notes: paragraphs, keeping simple formatting."""
    paras = [runs_markdown(p) for p in text_frame.paragraphs]
    return "\n\n".join(p for p in paras if p).strip()
