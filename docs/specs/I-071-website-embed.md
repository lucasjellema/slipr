# I-071: Website embed

Status: **done** 2026-10-12 · Builds on I-070 · Decision: D-011 (refined)

## Lucas's decisions (2026-10-12)

1. **Sandbox**: an allow-list of extras, `allow: ["same-origin", "fullscreen", "modals", "downloads", "presentation"]` (any subset); the editor shows checkboxes, and `same-origin` gets a warning. Anything else is rejected by validation.
2. **Layouts**: both templates get a `web` layout. Default: title, page, caption (template 1.1.0 → 1.2.0). Conclusion: modelled on `title-only`, page in the content area, no new assets (0.1.1 → 0.1.2). Existing slides look unchanged.
3. **Audience mode**: the author picks `present: "live"` (default) or `"static"` (the fallback screenshot). Live pages load **without** a Load button in audience mode; reader mode still asks unless `load: "auto"`.
4. **Size in reader mode**: `aspect` (`"16:9"`, any `W:H`) or `height`; aspect wins. In audience mode the layout decides.

## What changed

- Show format 0.2: slot type `web` (`url`, `title`, `allow?`, `present?`, `load?`, `fallback?`); `allow` and `aspect` on the `embed` block. Schema `$defs.web`, `$defs.webAllow`; template schema slot type `web`.
- `shared/embeds/web.js`: `frameSandbox()`, `frameAspect()`, `isWeb()`, render options `{ mode, slot }`; an "Open in new tab ↗" link below every loaded frame. `index.js` passes the options and skips `data-embed-static` elements (still adding `embeds.css`). `render.js` fills `web` slots.
- Validation: `unsafe-url` (error), `static-without-fallback` and `same-origin-local` (warnings), format-version errors for 0.1 shows.
- `same-origin` is dropped for files in the show folder: such a page shares Slipr's origin, and with `allow-scripts` plus `allow-same-origin` it could remove its own sandbox and read the reader's IndexedDB.
- Editor: a field editor for `web` slots and the Embedded Page block share `ui/web-fields.js` (address, title, live / screenshot, click-to-load, permissions, fallback image); the block also gets an aspect choice. `setSlot` raises a 0.1 show to 0.2 for a web value.
- Single-file export: local pages in `web` slots are embedded.
- Demos: `s-live-page` in the demo (live local page with fullscreen and a fallback); `s-web` in the Conclusion demo (Wikipedia, presented as a screenshot; the show is now 0.2).

## Not verified here

Claude's browser pane blocks all sub-frame requests (`ERR_BLOCKED_BY_CLIENT`), so frame contents (local and external) were not seen; markup, sandbox, sizing and consent were checked.
