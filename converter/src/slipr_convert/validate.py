"""Validate converter output against the shared JSON Schema.

The schema in <repo>/shared/schema/ is the contract between this Python
converter and the JavaScript apps (D-006). It is loaded from the repository,
never copied. Set SLIPR_SCHEMA_DIR to use another location.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from jsonschema import Draft202012Validator


def schema_dir() -> Path:
    env = os.environ.get("SLIPR_SCHEMA_DIR")
    if env:
        return Path(env)
    # converter/src/slipr_convert/validate.py → repo root is three levels up from the package
    return Path(__file__).resolve().parents[3] / "shared" / "schema"


@lru_cache(maxsize=2)
def _validator(name: str) -> Draft202012Validator:
    path = schema_dir() / name
    if not path.exists():
        raise FileNotFoundError(f"Slipr schema not found: {path} (set SLIPR_SCHEMA_DIR)")
    return Draft202012Validator(json.loads(path.read_text(encoding="utf-8")))


def validate_show(show: dict) -> list[str]:
    """Readable schema errors; empty when valid."""
    errors = sorted(_validator("show.schema.json").iter_errors(show), key=lambda e: list(e.absolute_path))
    return [f"{_path(e.absolute_path)}: {e.message}" for e in errors]


def validate_template(template: dict) -> list[str]:
    errors = sorted(_validator("template.schema.json").iter_errors(template), key=lambda e: list(e.absolute_path))
    return [f"template {_path(e.absolute_path)}: {e.message}" for e in errors]


def _path(parts) -> str:
    out = ""
    for p in parts:
        out += f"[{p}]" if isinstance(p, int) else (f".{p}" if out else str(p))
    return out or "(root)"
