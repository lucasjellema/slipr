"""Slipr show → PowerPoint (.pptx), the reverse of the converter (I-045). See converter/README.md."""
from .report import ExportReport
from .write import ExportResult, export_show

__all__ = ["export_show", "ExportResult", "ExportReport"]
