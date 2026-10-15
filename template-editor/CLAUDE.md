# CLAUDE.md: Template Editor

Read the root `CLAUDE.md` first. This file adds template-editor guidance. Specs: `docs/specs/I-106-template-editor.md` (decision D-017) and `docs/specs/I-111-layout-composer.md` (layout composer, D-019).

## Orientation in 60 seconds

- State flows one way: **UI → `store.update(action)` → subscribers → UI**, as in the show editor. Every change is a pure function in `js/actions.js` (tested); `js/main.js` only wires.
- The template's files live in memory as a `Map<path, string | Blob>`; `template.json` is kept parsed (`state.template`) and written as a patch of its original text (`json-text.js`).
- The preview runs in an **iframe** (`preview.html`, `js/preview/preview.js`) and uses `shared/render.js` and `shared/blocks.js`. Do not render slides in the editor's own document, and do not add editor-only rendering.

## Invariants (D-017)

- **Only token values change** in hand-written CSS. Edits go through `setTokenValue()` (one declaration's value, in place) and `addFontFace()`. Never regenerate or reformat a stylesheet, and never add tokens a template does not declare (phase 1 decision).
- **The layout composer (I-111, D-019) owns only its own text**: the `slipr-composer` blocks of `theme.css` (`setBlock()`), the files of composed layouts (root class `slipr-composed`) and layout entries in `template.json`. Hand-written layouts get slot-setting changes only (`setSlotProp()`, `setLayoutMeta()`): never their HTML, CSS, slot names or types. Composed layouts are read from their file and block each time (`composedOf()`); keep no separate model.
- **Only top-level `:root` rules count.** `:root` inside `@media` is left alone. A token declared twice (theme and reader) is edited where it wins: the last declaration.
- **Values are checked before they are written** (`checkValue()`: no `;`, braces, comment markers, `<` / `>`, balanced quotes and brackets), so an edit can never break out of its declaration.
- **template.json keeps its formatting**: `patchJsonText()` replaces only what changed; a container whose keys or length changed is rewritten reusing its kept members' text (array members matched by value, then `id` / `name`), new members in their neighbours' style.
- **No hard-coded colours** in `css/template-editor.css` outside the two token blocks; `test/theme-contrast.test.js` checks AA contrast for both themes. The theme follows the show editor's choice (`localStorage` key `slipr-editor-theme`).
- New contrast pairs go in `js/contrast-pairs.js`; `test/tokens.test.js` pins the current findings of both shipped templates (chore C-009), so a template colour change shows up there.

## Smoke-test checklist

In Claude's browser pane the native folder picker cannot be driven: stub `window.showDirectoryPicker` to return a folder of the origin-private file system (`navigator.storage.getDirectory()`), and remove it afterwards. Downloads: stub `HTMLAnchorElement.prototype.click` to capture the blob URL. The `slipr` launch entry uses port 8080; when another session holds it, use `slipr-alt` (port 8085). Type with real key presses (`computer` → `type`) into a focused field: a script that keeps a reference to an input types into a detached element after the first rebuild.

1. Start screen: both templates of `templates/index.json` are offered; **Open a template folder…** is disabled with a note in browsers without the File System Access API.
2. **Start from Conclusion**: the dialog suggests *Conclusion (magenta) copy* / `conclusion-magenta-copy`; `conclusion` as id is refused. The workspace shows 42 colours, 7 type, 24 sizes, 2 other tokens; the contrast summary lists the known findings; the preview shows the Conclusion demo (23 slides). 4:3 is disabled for Conclusion (its theme has no 4:3 rule) and works for Default.
3. Type a colour into *Magenta*: focus and caret stay, the preview follows each valid keystroke, *Accent* and the tag cloud follow (linked). An invalid value (`#12`) is marked and not applied. `Ctrl+Z` undoes the typing in one step.
4. Link *Accent* to *Blue* with its select; − / + on a size; *Use a font…* on a font row; drag a colour swatch (the picker stays open; one undo step).
5. **Add font file…** with a `.woff2`: the family is suggested from the file name; the font is offered under *Use a font…*, the chosen token starts with it, and the preview's stylesheet has the `@font-face` rule with a `blob:` URL.
6. Reader mode with the *Generated* sample: text, details, four callouts and tabs in the template's reader style.
7. Template tab: an invalid id or version is marked and not applied; style guide colours say which token they follow (a click shows the token).
8. **Save as folder…** writes `<folder>/<id>/` with every file (README, layouts, assets, the font licence, added fonts); the title shows the folder. Change a token, **Save**: only the changed files are written, and the style guide colour follows its token. **Download .zip**: one folder named after the id. **Close** and **Open a template folder…** on the saved folder: the changes are there, no broken images.
9. Dark and light theme (set `data-theme` on `<html>`), and 375 px width (no sideways scroll).
10. **Layouts** tab (Default): 13 layouts, all hand-written. **New layout…** "Two up" as a copy of *Two columns*: the preview stages one slide; title on top, each column title above its text, the logo top right. Drag a box (one undo step), arrow keys / Shift / Alt on a focused box, the X / Y / W / H fields follow. **+ Slot…** Tag cloud and **+ Picture…** `assets/logos/logo.svg`: both appear and are selected. Reader mode below 640 px: one column, no pictures. Conclusion: a copy of *Text and photo* keeps `cnc cnc-dark` (white text on black). Save as folder… writes `layouts/<id>.html`, two `slipr-composer` blocks at the end of `theme.css` and the layout in `template.json` (other lines unchanged); **Remove layout…** + Save deletes the file and both blocks. In the pane, screenshots only show the top-left of large viewports: hide `.te-panel` and set a 640 × 400 viewport to see the stage.
11. The console has no errors except 404s of optional files probed when starting from a template (`README.md`, `assets/fonts/OFL.txt` …), and font decoding warnings for fake font files.

## Common pitfalls

- Objects passed to the iframe come from another window: `preview.js` copies them with `structuredClone`, because `instanceof Map` / `Array` checks fail across windows.
- Rebuilding the panel while a native colour picker is open closes it: swatch `input` events update the store and preview but wait for `change` to rebuild the panel (`view.swatchActive`).
- `catalogOf()` caches per `files` map; always replace the map (`new Map(state.files)`), never mutate it.
