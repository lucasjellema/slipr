"""Slipr converter: PowerPoint (.pptx) → Slipr show. See converter/README.md."""
from .convert import convert
from .emit import write_show
from .model import ConversionResult

__all__ = ["convert", "write_show", "ConversionResult"]
