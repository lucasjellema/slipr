# Template Editor: architecture

The fourth Slipr app (I-106, D-017). Plain ES modules, no build step, like the viewer and the editor. Spec: `docs/specs/I-106-template-editor.md`.

```
template-editor/
├── index.html            app shell: top bar, start screen, workspace, two dialogs
├── preview.html          the preview page, loaded in an iframe
├── css/
│   ├── template-editor.css  the app's look (--slipr-te-* tokens, dark and light)
│   └── preview.css          the frame around the slides inside the iframe
├── js/
│   ├── main.js           start screen, workspace, tabs, saving; wires the store to the UI
│   ├── store.js          ✅ DOM-free: state, undo / redo (coalescing), subscribers
│   ├── actions.js        ✅ DOM-free: the open template and every change to it (setToken, setMeta, addFont, outputFiles, changedPaths, …)
│   ├── css-tokens.js     ✅ DOM-free: custom properties in top-level :root rules (parse, set in place, resolve var(), check values), @font-face, url() / src rewriting
│   ├── color.js          ✅ DOM-free: CSS colours, luminance, contrast ratio
│   ├── token-catalog.js  ✅ DOM-free: the token list (kind, group, links, labels)
│   ├── contrast-pairs.js ✅ DOM-free: the WCAG pairs and checkContrast()
│   ├── template-files.js ✅ DOM-free: referenced files, clone metadata and README, style guide sync, ids
│   ├── json-text.js      ✅ DOM-free: template.json patched in place (formatting kept)
│   ├── sample-show.js    ✅ DOM-free: the generated sample, fitting the demo shows to a template
│   ├── source.js         reading templates (URL, folder handle), writing folders, the .zip
│   ├── preview/preview.js  runs in the iframe: renders slides and reader blocks with shared/render.js and shared/blocks.js
│   └── ui/
│       ├── token-panel.js   the Colours / Type / Sizes / Other tabs
│       ├── template-tab.js  the Template tab
│       └── preview-frame.js the editor side of the iframe: blob: URLs, stylesheet swaps, render calls
└── test/                 Node tests for the DOM-free modules and the app's colour tokens
```

## Data flow

1. **Open.** `source.js` reads every file into a `Map<path, string | Blob>` (text for `.json`, `.css`, `.html`, `.md`, `.txt`, `.svg`). From a URL, the files are found from `template.json`'s references (`referencedFiles()`), plus the README and font licences if they exist. `actions.openTemplate()` makes the state and links the style guide colours to tokens.
2. **Edit.** UI → `store.update(action, { coalesceKey })` → subscribers: the title bar, the panel (rebuilt; the field being typed in keeps its text and caret) and `preview.setStyles()`.
3. **Preview.** The iframe holds two `<style>` elements. A token change only replaces their text; template files referenced by the stylesheets and layouts are `blob:` URLs, made once per file content. Mode, aspect and sample changes re-render through `sliprPreview.render()`, which builds a `ShowContext` with the layouts' URLs already rewritten.
4. **Save.** `outputFiles()` = every file plus `template.json` patched in place (`json-text.js`) with the style guide synced. **Save** writes `changedPaths()` to the opened folder; **Save as folder…** writes everything into `<picked folder>/<id>/`; **Download .zip** packs everything under `<id>/` with `shared/zip.js`.

## Why an iframe

The template's stylesheets set `:root` tokens and global `.slipr-*` rules; in the editor's own document they would restyle its UI, and two templates could not be compared. In the iframe they apply to the preview only, and `@font-face` rules work (they do not inside shadow DOM).
