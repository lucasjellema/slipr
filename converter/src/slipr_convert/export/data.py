"""Data for tables and tag clouds: CSV files and inline values, as text cells.

Mirrors shared/csv.js and the table / tag cloud rules of docs/show-format.md
closely enough for a static copy on a PowerPoint slide.
"""
from __future__ import annotations

import csv
import io
import re
import unicodedata
from collections.abc import Callable

ReadFile = Callable[[str], bytes | None]

_DECIMAL_COMMA = re.compile(r"^-?\d{1,3}(\.\d{3})*(,\d+)?%?$|^-?\d+(,\d+)?%?$")


def read_csv(data: bytes) -> tuple[list[str], list[list]]:
    """Header and rows. Comma, semicolon or tab, detected from the first line;
    with semicolons, `1234,5` and `12,5%` are numbers with a decimal comma."""
    text = data.decode("utf-8-sig", errors="replace").replace("\r\n", "\n")
    first = text.split("\n", 1)[0]
    sep = max((",", ";", "\t"), key=first.count)
    rows = [r for r in csv.reader(io.StringIO(text), delimiter=sep) if any(c.strip() for c in r)]
    if not rows:
        return [], []
    header, body = rows[0], rows[1:]
    return [h.strip() for h in header], [[_cell(c, sep == ";") for c in r] for r in body]


def _cell(text: str, decimal_comma: bool):
    t = text.strip()
    if not t:
        return None
    if decimal_comma and _DECIMAL_COMMA.match(t):
        t = t.replace(".", "").replace(",", ".")
    percent = t.endswith("%")
    try:
        value = float(t[:-1] if percent else t)
    except ValueError:
        return text
    value = value / 100 if percent else value
    return int(value) if value.is_integer() and not percent and "." not in t else value


def table_cells(value: dict, read_file: ReadFile) -> tuple[list[str], list[list[str]], list[str] | None, list[str], str | None]:
    """A table value → (header labels, formatted rows, totals row or None,
    column alignments 'l' | 'r' | 'c', a problem or None)."""
    columns = list(value.get("columns") or [])
    rows = [list(r) for r in value.get("rows") or []]
    if value.get("data"):
        blob = read_file(value["data"])
        if blob is None:
            return [], [], None, [], f"data file not found: {value['data']}"
        header, file_rows = read_csv(blob)
        listed = [c["key"] for c in columns]
        extra = [{"key": h} for h in header if h not in listed]
        known = [c for c in columns if c["key"] in header]
        columns = known + extra
        index = {h: i for i, h in enumerate(header)}
        rows = [[r[index[c["key"]]] if index[c["key"]] < len(r) else None for c in columns] for r in file_rows]
    shown = [(i, c) for i, c in enumerate(columns) if not c.get("hidden")]
    numeric = {i: _all_numbers([r[i] for r in rows if i < len(r)]) for i, _ in shown}
    labels = [c.get("label") or c["key"] for _, c in shown]
    sort = value.get("sort")
    if isinstance(sort, dict):
        keys = [c["key"] for c in columns]
        if sort.get("column") in keys:
            k = keys.index(sort["column"])
            rows.sort(key=lambda r: _sort_key(r[k] if k < len(r) else None), reverse=sort.get("order") == "desc")
    body = [[_format(r[i] if i < len(r) else None, c, numeric[i]) for i, c in shown] for r in rows]
    totals = None
    if any(c.get("total") for _, c in shown):
        totals = []
        for n, (i, c) in enumerate(shown):
            kind = c.get("total")
            nums = [r[i] for r in rows if i < len(r) and isinstance(r[i], (int, float))]
            if kind == "count":
                totals.append(str(sum(1 for r in rows if i < len(r) and r[i] not in (None, ""))))
            elif kind and nums:
                total = {"sum": sum(nums), "avg": sum(nums) / len(nums), "min": min(nums), "max": max(nums)}[kind]
                totals.append(_format(total, c, True))
            else:
                totals.append("Total" if n == 0 else "")
    align = []
    for i, c in shown:
        a = c.get("align")
        align.append("c" if a == "center" else "r" if a == "end" or (a is None and numeric[i]) else "l")
    return labels, body, totals, align, None


def _all_numbers(cells: list) -> bool:
    filled = [c for c in cells if c not in (None, "")]
    return bool(filled) and all(isinstance(c, (int, float)) and not isinstance(c, bool) for c in filled)


def _sort_key(v):
    return (0, v, "") if isinstance(v, (int, float)) else (1, 0, str(v or "").lower())


def _format(v, column: dict, numeric: bool) -> str:
    if v is None or v == "":
        return ""
    fmt = column.get("format")
    decimals = column.get("decimals")
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if fmt == "percent":
            return f"{v * 100:.{1 if decimals is None else decimals}f} %"
        if fmt == "currency":
            symbol = {"EUR": "€", "USD": "$", "GBP": "£"}.get(column.get("currency", "EUR"), column.get("currency", "EUR") + " ")
            return f"{symbol}{v:,.{2 if decimals is None else decimals}f}"
        if fmt == "integer":
            return f"{round(v):,}"
        if fmt == "number" or decimals is not None:
            return f"{v:,.{decimals if decimals is not None else 2}f}"
        return str(v)
    if fmt == "markdown":
        from .markdown import plain
        return plain(str(v))
    return str(v)


def cloud_terms(value: dict, read_file: ReadFile) -> tuple[list[tuple[str, float]], str | None]:
    """A tag cloud value → [(term, weight)] in display order, plus a problem or None."""
    terms: list[tuple[str, float]] = []
    if value.get("data"):
        blob = read_file(value["data"])
        if blob is None:
            return [], f"data file not found: {value['data']}"
        header, rows = read_csv(blob)
        t_col = header.index(value["termColumn"]) if value.get("termColumn") in header else 0
        w_col = header.index(value["weightColumn"]) if value.get("weightColumn") in header else None
        if w_col is None and "weightColumn" not in value and len(header) > 1 and _all_numbers([r[1] for r in rows if len(r) > 1]):
            w_col = 1
        for r in rows:
            if t_col < len(r) and r[t_col] not in (None, ""):
                w = r[w_col] if w_col is not None and w_col < len(r) and isinstance(r[w_col], (int, float)) else 1
                terms.append((str(r[t_col]), float(w)))
    else:
        for t in value.get("terms") or []:
            if str(t.get("text", "")).strip():
                terms.append((str(t["text"]).strip(), float(t.get("weight", 1))))
    merged: dict[str, list] = {}
    for text, w in terms:
        key = _fold(text)
        if key in merged:
            merged[key][1] += w
        else:
            merged[key] = [text, w]
    items = [(t, w) for t, w in merged.values()]
    if value.get("maxTerms"):
        keep = {t for t, _ in sorted(items, key=lambda x: -x[1])[: int(value["maxTerms"])]}
        items = [x for x in items if x[0] in keep]
    order = value.get("order", "cloud")
    if order == "alphabetical":
        items.sort(key=lambda x: _fold(x[0]))
    elif order in ("weight", "cloud"):
        items.sort(key=lambda x: -x[1])
        if order == "cloud":
            before, after = [], []
            for n, item in enumerate(items[1:]):
                (after if n % 2 == 0 else before).append(item)
            items = list(reversed(before)) + items[:1] + after
    return items, None


def _fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if not unicodedata.combining(c))
