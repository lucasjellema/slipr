"""Tables, charts, SmartArt and videos (model.Visual) → Slipr slot values (I-121).

- table    → a `table` value with inline columns and rows; numbers, percentages
             and amounts are recognised per column, a totals row becomes
             `total: "sum"`.
- chart    → a `table` value: a category column and one column per series,
             with a data bar (Slipr has no chart type yet).
- smartArt → a `diagram` value: a Mermaid flowchart of the node tree.
- video    → a `video` value; the file and poster paths come from emit.
"""
from __future__ import annotations

import re
import unicodedata

from .model import ChartData, DiagramData, DiagramNode, VideoData

# The slot (and reader block) type each kind of visual becomes.
SLOT_TYPE = {"table": "table", "chart": "table", "smartArt": "diagram", "video": "video"}

_CURRENCY = {"€": "EUR", "$": "USD", "£": "GBP", "¥": "JPY", "eur": "EUR", "usd": "USD", "gbp": "GBP"}
_TOTAL_LABEL = re.compile(r"^\s*(total|totals|totaal|sum|som|grand total|eindtotaal)\b", re.I)
_YEAR = re.compile(r"^(19|20)\d\d$")


def _key(label: str, n: int, taken: set[str]) -> str:
    ascii_text = unicodedata.normalize("NFKD", label.replace("ß", "ss")).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-") or f"column-{n}"
    key, i = base, 2
    while key in taken:
        key, i = f"{base}-{i}", i + 1
    taken.add(key)
    return key


def parse_number(text: str) -> tuple[float, str, str | None, int] | None:
    """'1.234,5' / '1,234.5' / '12,5 %' / '€ 1.200' / '-3' → (value, kind,
    currency, decimals), kind 'number' | 'percent' | 'currency'; None when
    the text is not a number. Percentages are returned as written (12.5)."""
    s = text.strip().replace(" ", " ").replace("−", "-")
    if not s:
        return None
    kind, currency = "number", None
    if s.endswith("%"):
        kind, s = "percent", s[:-1].strip()
    else:
        for sym, code in _CURRENCY.items():
            if s.lower().startswith(sym) or s.lower().startswith("-" + sym):
                kind, currency = "currency", code
                s = ("-" if s.startswith("-") else "") + s.lstrip("-")[len(sym):].strip()
                break
            if s.lower().endswith(sym):
                kind, currency = "currency", code
                s = s[: -len(sym)].strip()
                break
    s = s.replace(" ", "")
    if not re.fullmatch(r"[-+]?[\d.,]*\d", s):
        return None
    if "," in s and "." in s:
        decimal = "," if s.rfind(",") > s.rfind(".") else "."
    elif "," in s:
        decimal = None if re.fullmatch(r"[-+]?\d{1,3}(,\d{3})+", s) else ","
    elif "." in s:
        decimal = None if re.fullmatch(r"[-+]?\d{1,3}(\.\d{3})+", s) else "."
    else:
        decimal = None
    thousands = {",": ".", ".": ","}.get(decimal or "", ",." if decimal is None else "")
    digits = s
    for sep in thousands:
        digits = digits.replace(sep, "")
    if decimal == ",":
        digits = digits.replace(",", ".")
    try:
        value = float(digits)
    except ValueError:
        return None
    decimals = len(digits.split(".", 1)[1]) if "." in digits else 0
    return value, kind, currency, decimals


def table_value(rows: list[list[str]]) -> tuple[dict, list[str]]:
    """A PowerPoint table (first row = labels) → (table value, remarks)."""
    remarks: list[str] = []
    rows = [r for r in rows if any(c.strip() for c in r)]
    if not rows:
        return {"columns": [{"key": "column-1"}], "rows": []}, ["empty table"]
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    header, body = rows[0], rows[1:]
    taken: set[str] = set()
    columns = []
    for n, label in enumerate(header, 1):
        column = {"key": _key(label, n, taken)}
        if label.strip() and label.strip() != column["key"]:
            column["label"] = label.strip()
        columns.append(column)

    totals_row = body[-1] if len(body) > 2 and _TOTAL_LABEL.match(body[-1][0] or "") else None
    cells: list[list] = [[c.strip() or None for c in r] for r in body]
    numeric: list[int] = []
    for c, column in enumerate(columns):
        parsed = [parse_number(r[c]) for r in body if r[c].strip()]
        if not parsed or any(p is None for p in parsed):
            continue
        kinds = {(p[1], p[2]) for p in parsed}
        if len(kinds) != 1:
            continue
        kind, currency = kinds.pop()
        if kind == "number" and all(p[3] == 0 and _YEAR.match(str(int(p[0]))) for p in parsed):
            continue  # years: keep them as text, without thousands separators
        decimals = max(p[3] for p in parsed)
        for r, row in enumerate(body):
            if row[c].strip():
                value = parse_number(row[c])[0]
                cells[r][c] = round(value / 100, decimals + 2) if kind == "percent" else value
                if isinstance(cells[r][c], float) and cells[r][c].is_integer() and kind != "percent":
                    cells[r][c] = int(cells[r][c])
        if kind == "percent":
            column["format"], column["decimals"] = "percent", decimals
        elif kind == "currency":
            column["format"], column["currency"] = "currency", currency
            column["decimals"] = decimals
        elif decimals:
            column["format"], column["decimals"] = "number", decimals
        numeric.append(c)

    # A last row "Total" whose numbers are the sums of the column becomes a total.
    if totals_row and numeric:
        last = cells[-1]
        sums_match = all(
            last[c] is None or abs(sum(r[c] for r in cells[:-1] if isinstance(r[c], (int, float))) - last[c]) < 0.005 * max(1, abs(last[c]))
            for c in numeric
        ) and all(last[c] is None for c in range(1, len(columns)) if c not in numeric)
        if sums_match:
            for c in numeric:
                if last[c] is not None:
                    columns[c]["total"] = "sum"
            cells = cells[:-1]
            remarks.append("table: the totals row became column totals")
    return {"columns": columns, "rows": cells}, remarks


def chart_value(chart: ChartData) -> dict:
    """A chart's data as a table: categories × series, with data bars."""
    taken: set[str] = set()
    first = {"key": _key("category", 0, taken), "label": "Category"}
    percent = "%" in chart.number_format
    decimals = 0
    m = re.search(r"\.(0+)", chart.number_format)
    if m:
        decimals = len(m.group(1))
    columns = [first]
    for n, (name, _) in enumerate(chart.series, 1):
        column = {"key": _key(name, n, taken), "label": name}
        if percent:
            column["format"], column["decimals"] = "percent", decimals
        elif decimals:
            column["format"], column["decimals"] = "number", decimals
        column["visual"] = "bar"
        columns.append(column)
    rows = []
    for i, category in enumerate(chart.categories):
        row: list = [category]
        for _, values in chart.series:
            v = values[i] if i < len(values) else None
            row.append(int(v) if isinstance(v, float) and v.is_integer() and not percent else v)
        rows.append(row)
    value: dict = {"columns": columns, "rows": rows}
    if chart.title:
        value["caption"] = chart.title
    return value


def _safe(text: str) -> str:
    """Text inside a quoted Mermaid label: quotes and angle brackets as entities."""
    return text.replace('"', "#quot;").replace("<", "#lt;").replace(">", "#gt;")


def _label(text: str) -> str:
    return f'"{_safe(text)}"'


def diagram_value(diagram: DiagramData) -> dict:
    """SmartArt → a Mermaid flowchart: a hierarchy top-down with every link,
    a process or cycle left-to-right through the top-level nodes (their
    sub-points in the node's label), a cycle closed back to the start."""
    lines: list[str] = []
    counter = iter(range(1, 10_000))

    if diagram.kind == "hierarchy":
        lines.append("flowchart TD")

        def walk(node: DiagramNode, parent: str | None) -> None:
            nid = f"n{next(counter)}"
            lines.append(f"  {nid}[{_label(node.text)}]")
            if parent:
                lines.append(f"  {parent} --> {nid}")
            for child in node.children:
                walk(child, nid)

        for root in diagram.roots:
            walk(root, None)
    else:
        lines.append("flowchart LR")
        ids = []
        for node in diagram.roots:
            nid = f"n{next(counter)}"
            ids.append(nid)
            subs = [c.text for c in _flatten(node.children)]
            label = "<br/>".join([_safe(node.text)] + [f"• {_safe(t)}" for t in subs])
            lines.append(f'  {nid}["{label}"]')
        for a, b in zip(ids, ids[1:]):
            lines.append(f"  {a} --> {b}")
        if diagram.kind == "cycle" and len(ids) > 2:
            lines.append(f"  {ids[-1]} --> {ids[0]}")
    return {"mermaid": "\n".join(lines)}


def _flatten(nodes: list[DiagramNode]) -> list[DiagramNode]:
    out = []
    for node in nodes:
        out.append(node)
        out.extend(_flatten(node.children))
    return out


_YOUTUBE_ID = re.compile(r"(?:youtube(?:-nocookie)?\.com/(?:embed/|v/|watch\?v=)|youtu\.be/)([\w-]{6,})", re.I)
_VIMEO_ID = re.compile(r"vimeo\.com/(?:video/)?(\d+)", re.I)


def online_video(url: str) -> str | None:
    """A YouTube or Vimeo link as Slipr reads it, an https video file as is,
    else None (other sites)."""
    if m := _YOUTUBE_ID.search(url):
        return f"https://www.youtube.com/watch?v={m.group(1)}"
    if m := _VIMEO_ID.search(url):
        return f"https://vimeo.com/{m.group(1)}"
    if re.match(r"^https://", url, re.I) and re.search(r"\.(mp4|webm|m4v|mov)(\?|#|$)", url, re.I):
        return url
    return None


def _seconds(ms: int) -> int | float:
    s = round(ms / 1000, 2)
    return int(s) if float(s).is_integer() else s


def video_value(video: VideoData, path: str | None, poster: str | None) -> tuple[dict | None, list[str]]:
    """A video value (None when an online video is on a site Slipr cannot
    play), and remarks for the report."""
    remarks: list[str] = []
    source = path if video.blob is not None else online_video(video.url or "")
    if not source:
        return None, [f"online video on a site Slipr cannot play ({video.url})"]
    value: dict = {"video": source, "title": video.title}
    if video.start_ms > 0:
        value["start"] = _seconds(video.start_ms)
    if video.end_trim_ms > 0:
        remarks.append(f"video “{video.title}”: PowerPoint trims {video.end_trim_ms / 1000:g} s from the end; set `end` by hand")
    if video.bookmarks:
        chapters = [{"time": _seconds(ms), "title": name or f"Bookmark {n}"}
                    for n, (ms, name) in enumerate(sorted(video.bookmarks), 1)]
        value["chapters"] = chapters
    if poster:
        value["fallback"] = {"src": poster, "alt": f"Poster of “{video.title}”"}
    return value, remarks
