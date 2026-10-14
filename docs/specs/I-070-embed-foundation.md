# I-070: Shared foundation for rich embeds

Status: **done** 2026-10-12 · Decision: D-011

## Lucas's decisions (2026-10-12)

1. **Fallback image**: a generic optional `fallback` image (`{ src, alt, … }`, the normal image value) on embed values, part of show format **0.2** (still a draft, so no bump). A 0.1 show using it is an error, like overlays.
2. **Click-to-load**: the author decides per embed whether external content loads straight away or needs the reader's consent. The default is click-to-load. Field: `load: "click" | "auto"`.
3. **Consent memory**: per site (origin), for this tab only (sessionStorage). Nothing persists.
4. **Approved libraries**: Mermaid (already in), Cytoscape.js, Leaflet, PDF.js.

## What exists now

| Kind | Slot type | Block type | Library | Static fallback | Click-to-load |
|---|---|---|---|---|---|
| `diagram` | `diagram` | `diagram` | Mermaid 11.4.1 | Mermaid source (hidden until rendered) | no (local) |
| `web` | `web` in I-071 | `embed` | none (iframe) | link card: title, site, Open in new tab | external http(s) pages, unless `load: "auto"` |

I-071 (web slot, sandbox options, screenshots), I-072 (PDF), I-074 (graph) and I-075 (map) add kinds or options on top of this.

## Kind contract (`shared/embeds/<kind>.js`)

| Export | Meaning |
|---|---|
| `library` | Vendor folder relative to the Slipr root (`vendor/mermaid-11.4.1/`), or `null`. The single-file export leaves it out when the show doesn't use the kind |
| `thumbnail` | `true` if editor thumbnails render it live; otherwise they show the static fallback |
| `errorLabel` | Heading of the error box when hydration fails |
| `attributes(value, ctx)` | Data attributes for the embed element (DOM-free). `class` is added to `slipr-embed slipr-embed--<kind>`. `data-embed-origin` turns on click-to-load; `data-embed-print="fallback"` prints the fallback instead of the live content |
| `staticHtml(value, ctx)` | `{ html, fallback }`: static content when the value has no fallback image (DOM-free, built with `escape()`) |
| `hydrate(el, live, options)` | Async: render the live content into `live`; import the library here. Throws on failure. `options.readAsset(path)` reads a show file for shows from a folder or a zip (I-099: map tiles) |

Register the kind in `shared/embeds/index.js` (`EMBED_KINDS`, and the slot/block type maps), add the slot/block type to the schema, `docs/show-format.md` and validation, and make `usedEmbedKinds()` recognise it.

## Markup and states

```html
<div class="slipr-embed slipr-embed--web" data-embed="web" data-embed-src="…" data-embed-origin="https://example.com" data-embed-state="waiting">
  <div class="slipr-embed-fallback" data-fallback="card">…</div>
  <div class="slipr-embed-consent"><p>This content comes from <strong>example.com</strong>. …</p><button>Load</button></div>
</div>
```

`data-embed-state`: none (static only), `waiting` (click-to-load), `loading`, `ready` (live content in `.slipr-embed-live`, fallback hidden), `error` (`.slipr-embed-error`; an image or card fallback stays visible, Mermaid source is hidden). Clicking **Load** loads every waiting embed from the same site on the page.

`hydrateEmbeds(root, { thumbnail })` is called by audience mode, reader mode (after every re-render), the editor preview and, with `thumbnail: true`, the show grid. It adds `shared/embeds/embeds.css` to the page once.

## Not done here

- Editor fields for the diagram's fallback image: diagrams have no editor yet (slot and block are read-only in the editor); set `fallback` in `show.json`.
- A way for readers to withdraw consent within a tab (closing the tab does it).
