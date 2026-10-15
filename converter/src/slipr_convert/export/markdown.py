"""Slipr Markdown → paragraphs and runs, ready to become PowerPoint text.

The subset of docs/show-format.md: paragraphs, `- ` lists nested with two
spaces, `1.` / `A.` / `a.` lists, fenced code, `**bold**`, `*italic*`,
`` `code` ``, `[text](url)`, `[[glossary]]`, `^[popup]` and `\\` escapes.
No PowerPoint knowledge here: write.py and xml.py turn this into shapes.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

_LIST_ITEM = re.compile(r"^( *)(?:([-*+])|(\d+)\.|([A-Za-z])\.)\s+(.*)$")
_FENCE = re.compile(r"^\s*```")


@dataclass
class Run:
    text: str
    bold: bool = False
    italic: bool = False
    code: bool = False
    link: str | None = None  # http(s) / mailto only; slide links become plain text

    @property
    def is_break(self) -> bool:
        return self.text == "\n"


@dataclass
class Para:
    """kind: 'p' (paragraph), 'bullet', 'number', 'upper' (A.), 'lower' (a.) or 'code'."""

    kind: str = "p"
    level: int = 0
    runs: list[Run] = field(default_factory=list)
    start: int = 1  # first number of a numbered list item's list
    role: str = ""  # "line": a one-line text slot (outline level 0); "heading": a card's first field

    @property
    def text(self) -> str:
        return "".join(r.text for r in self.runs)

    @property
    def is_subheading(self) -> bool:
        """A paragraph that is entirely bold, as the renderer's slipr-md-subheading."""
        visible = [r for r in self.runs if r.text.strip()]
        return self.kind == "p" and bool(visible) and all(r.bold for r in visible)


def parse(md: str | list | None, glossary: dict | None = None) -> list[Para]:
    """Block-level parse. A `list` slot may also be an array of strings."""
    if md is None:
        return []
    if isinstance(md, list):
        return [Para("bullet", 0, inline(str(item), glossary)) for item in md if str(item).strip()]
    paras: list[Para] = []
    lines = str(md).replace("\r\n", "\n").split("\n")
    current: Para | None = None
    i = 0
    while i < len(lines):
        line = lines[i]
        if _FENCE.match(line):
            current = None
            i += 1
            while i < len(lines) and not _FENCE.match(lines[i]):
                paras.append(Para("code", 0, [Run(lines[i], code=True)]))
                i += 1
            i += 1
            continue
        if not line.strip():
            current = None
            i += 1
            continue
        item = _LIST_ITEM.match(line)
        if item:
            indent, dash, number, letter, rest = item.groups()
            level = min(len(indent) // 2, 4)
            if dash:
                kind, start = "bullet", 1
            elif number:
                kind, start = "number", int(number)
            else:
                kind = "upper" if letter.isupper() else "lower"
                start = ord(letter.lower()) - ord("a") + 1
            current = Para(kind, level, inline(rest, glossary), start)
            paras.append(current)
        elif current is not None and current.kind != "p" and line.startswith(" "):
            current.runs += [Run(" ")] + inline(line.strip(), glossary)  # continuation of a list item
        elif current is not None and current.kind == "p":
            current.runs += [Run("\n")] + inline(line.strip(), glossary)
        else:
            text = line.strip()
            heading = re.match(r"^#{1,6}\s+(.*)$", text)
            runs = inline(heading.group(1), glossary) if heading else inline(text, glossary)
            if heading:
                for r in runs:
                    r.bold = True
            current = Para("p", 0, runs)
            paras.append(current)
        i += 1
    return paras


def inline(text: str, glossary: dict | None = None) -> list[Run]:
    """Inline Markdown → runs. Neighbouring runs with the same look are merged."""
    runs: list[Run] = []
    _inline(text, glossary or {}, runs, bold=False, italic=False, link=None)
    return _merge(runs)


def _inline(text: str, glossary: dict, out: list[Run], *, bold: bool, italic: bool, link: str | None) -> None:
    buf: list[str] = []

    def flush() -> None:
        if buf:
            out.append(Run("".join(buf), bold=bold, italic=italic, link=link))
            buf.clear()

    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c == "\\" and i + 1 < n:
            buf.append(text[i + 1])
            i += 2
        elif c == "`":
            end = text.find("`", i + 1)
            if end < 0:
                buf.append(c)
                i += 1
                continue
            flush()
            out.append(Run(text[i + 1:end], bold=bold, italic=italic, code=True, link=link))
            i = end + 1
        elif text.startswith("[[", i) and (end := text.find("]]", i + 2)) > 0:
            ref = text[i + 2:end]
            term_id, _, label = ref.partition("|")
            entry = glossary.get(term_id.strip())
            buf.append(label or (entry.get("term") if isinstance(entry, dict) else None) or term_id)
            i = end + 2
        elif text.startswith("^[", i) and (end := _closing(text, i + 1)) > 0:
            i = end + 1  # an inline popup is reader-only: left out of the slide
        elif c == "[" and (close := _closing(text, i)) > 0 and text.startswith("(", close + 1) \
                and (paren := text.find(")", close + 2)) > 0:
            url = text[close + 2:paren].strip()
            flush()
            safe = url if re.match(r"^(https?:|mailto:)", url, re.I) else None
            _inline(text[i + 1:close], glossary, out, bold=bold, italic=italic, link=safe or link)
            i = paren + 1
        elif text.startswith("**", i):
            flush()
            bold = not bold
            i += 2
        elif c == "*":
            flush()
            italic = not italic
            i += 1
        else:
            buf.append(c)
            i += 1
    flush()


def _closing(text: str, open_at: int) -> int:
    """Index of the `]` matching the `[` at open_at, or -1."""
    depth = 0
    i = open_at
    while i < len(text):
        if text[i] == "\\":
            i += 2
            continue
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def _merge(runs: list[Run]) -> list[Run]:
    merged: list[Run] = []
    for r in runs:
        if not r.text:
            continue
        prev = merged[-1] if merged else None
        if prev and not prev.is_break and not r.is_break and (prev.bold, prev.italic, prev.code, prev.link) == (r.bold, r.italic, r.code, r.link):
            prev.text += r.text
        else:
            merged.append(r)
    return merged


def plain(md: str | list | None, glossary: dict | None = None) -> str:
    """Markdown as plain text: one line per paragraph, list markers kept as text."""
    lines = []
    for p in parse(md, glossary):
        text = "".join(" " if r.is_break else r.text for r in p.runs) if p.kind != "p" else "".join(r.text for r in p.runs)
        lines.append(("  " * p.level) + marker(p) + text)
    return "\n".join(lines)


def marker(p: Para, number: int | None = None) -> str:
    """The list marker as text ('• ', '3. ', 'B. '), for places without real bullets."""
    n = number if number is not None else p.start
    if p.kind == "bullet":
        return "• "
    if p.kind == "number":
        return f"{n}. "
    if p.kind in ("upper", "lower"):
        letter = chr(ord("a") + (n - 1) % 26)
        return (letter.upper() if p.kind == "upper" else letter) + ". "
    return ""
