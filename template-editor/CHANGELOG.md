# Changelog: Template Editor

Newest first. Group entries under **Added / Changed / Fixed / Removed**.

## [Unreleased]

### 2026-10-15: Layout composer (I-111)
- **Added** the **Layouts** tab (D-019): every layout with its name, description and slot settings (label, help, required, maximum length, maximum items); **New layout…** (empty with a title, or a copy of any layout, hand-written ones included) makes a composed layout; for composed layouts a box list (order = stacking and reading order, ↑ / ↓, remove), **+ Slot…** for every shared slot type with a *look* from the template's own layouts (card looks bring their blueprint and fields), **+ Picture…** (a template image or a new file in `assets/decor/`, with a fit), per-box left / top / width / height, slot rename, a background colour token, the template's variant classes, and **Remove layout…**.
- **Added** a stage preview: with a layout selected, one sample slide of it fills the preview (audience or reader, 16:9 or 4:3); for composed layouts the boxes are drawn over it on a 10 % grid: drag to move, handles to resize, arrow keys (Shift: 5 %, Alt: size), one undo step per drag or run of keys.
- **Added** `js/composer/` (`html-elements.js`, `composer-css.js`, `layout-model.js`), `js/layout-actions.js`, `js/ui/layouts-tab.js`, `js/ui/stage-overlay.js`; tests in `test/composer.test.js`.
- **Changed** `json-text.js`: structural changes (a new layout, a new slot key) are patched node by node instead of rewriting the file; new entries follow their neighbours' style (one-line slot objects in the default template). **Save** deletes the file of a removed layout from the opened folder.

### 2026-10-15: Theme designer (I-106, phase 1)
- **Added** the template editor app (`template-editor/`, D-017): start from a template in `templates/index.json` (new name and id; version 0.1.0, a new README) or open a template folder; edit every custom property of the template's top-level `:root` rules in tabs (Colours, Type, Sizes, Other), grouped by the stylesheet's own comments, with links between tokens (`var()`), colour swatches, font suggestions, − / + for sizes and checked values; add font files (`assets/fonts/`, `@font-face`); WCAG AA contrast checks for 25 token pairs, summarised and per row; the Template tab for name, id, version, description and style guide fonts; a live preview in an iframe (audience grid or reader article, 16:9 or 4:3, the demo shows or a generated slide per layout), updated per keystroke; undo / redo; Save (changed files only), Save as folder… and Download .zip. Values change in place, `template.json` keeps its formatting, and its style guide colours follow their tokens.
