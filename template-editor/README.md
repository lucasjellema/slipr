# Slipr Template Editor

Make a Slipr template without writing CSS by hand. Start from one of Slipr's templates, change its colours, fonts and sizes while you watch sample slides in audience and reader mode, check the contrast, and save the result as a template folder or a `.zip`.

> **Status:** phase 1 (I-106, 2026-10-15): the theme designer. Layouts, header and footer, reader rules, opening the show editor with the new template and PPTX import come later (I-111 … I-115 in [BACKLOG.md](../BACKLOG.md)). Spec: [docs/specs/I-106-template-editor.md](../docs/specs/I-106-template-editor.md).

## Quick start

1. Run `npm run serve` in the repository root.
2. Open <http://localhost:8080/template-editor/> in **Chrome** or **Edge** (other browsers can start from a template and download a `.zip`, but cannot open or save folders).
3. Choose **Start from Slipr Default** (or Conclusion), give the new template a name, and change what you like.
4. **Save as folder…** and pick Slipr's `templates/` folder: the template is written into `templates/<id>/`. Add the id to `templates/index.json` so the show editor offers it for new shows. Or **Download .zip** and unpack it there.

## What you can change

| Tab | What it shows |
|---|---|
| **Colours** | Every colour token of the template, grouped as in its stylesheet, with a swatch and a text field (any CSS colour). A token can be **linked** to another one (`= Magenta`): change the brand colour and everything linked to it follows. At the top, the **contrast checks** (WCAG AA) of the pairs Slipr knows: body text, muted text, text on primary, links, callout titles, table colours, tag cloud and graph colours. Each colour row shows its own checks |
| **Type** | The font stacks. *Use a font…* puts one of the template's fonts or a common stack in; **Add font file…** copies a `.woff2` (or `.woff`, `.ttf`, `.otf`) into the template's `assets/fonts/` and adds it to the stylesheet, so shows still present offline. Check that the font's licence allows that |
| **Sizes** | Lengths and numbers (title size, padding, reader line height, …), with − / + for simple values |
| **Other** | Other values, such as `hidden` |
| **Template** | Name, id, version and description; the style guide's font descriptions; the style guide colours (they follow their token when you save); whether `template.json` is valid |

The preview on the right shows **Audience** (all sample slides) or **Reader** (the slides with their reader blocks), at **16:9** or **4:3** (when the template draws 4:3), with sample content: Slipr's demo show, the Conclusion demo, or *Generated* (one slide per layout).

**Undo** / **Redo**: `Ctrl+Z`, `Ctrl+Y` (or `Ctrl+Shift+Z`). **Save**: `Ctrl+S`.

## What it does to your files

Only the **values** of custom properties in the top-level `:root` rules of `theme.css` and `reader.css` change, plus an `@font-face` rule for each font you add. Comments, order and every other rule stay as they were, and `template.json` keeps its layout: a saved template's diff shows only what you changed (D-017). That also means the editor can only change what the template expresses as a token.

## For developers

See [CLAUDE.md](CLAUDE.md) (orientation, invariants, smoke test) and [ARCHITECTURE.md](ARCHITECTURE.md) (modules).
