# Changelog: Template Editor

Newest first. Group entries under **Added / Changed / Fixed / Removed**.

## [Unreleased]

### 2026-10-15: Theme designer (I-106, phase 1)
- **Added** the template editor app (`template-editor/`, D-017): start from a template in `templates/index.json` (new name and id; version 0.1.0, a new README) or open a template folder; edit every custom property of the template's top-level `:root` rules in tabs (Colours, Type, Sizes, Other), grouped by the stylesheet's own comments, with links between tokens (`var()`), colour swatches, font suggestions, − / + for sizes and checked values; add font files (`assets/fonts/`, `@font-face`); WCAG AA contrast checks for 25 token pairs, summarised and per row; the Template tab for name, id, version, description and style guide fonts; a live preview in an iframe (audience grid or reader article, 16:9 or 4:3, the demo shows or a generated slide per layout), updated per keystroke; undo / redo; Save (changed files only), Save as folder… and Download .zip. Values change in place, `template.json` keeps its formatting, and its style guide colours follow their tokens.
