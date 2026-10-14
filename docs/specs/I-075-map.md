# I-075: Interactive map (Leaflet)

Status: **done** · 2026-10-13 · Builds on I-070 · Decision: D-011 (Leaflet approved, refined). Verified in Claude's browser pane: reader mode (OpenStreetMap slot behind **Load**, no tile request before the click, then tiles with attribution; place panel with "Go to slide", Esc, tag filter, pins as focusable buttons; the offline block with a GeoJSON layer and no tiles), audience mode (live tiles without a Load button, no zoom control or dragging, each step flies to its place and shows its name, going back returns to the overview), the Conclusion demo (brand colors by tag), the editor (read-only summary, preview draws the map) and the single-file export (no requests besides the file; the offline block draws from the packed GeoJSON). Follow-up 2026-10-14: the demo's offline block gained a background outline of the Netherlands (Natural Earth 1:50m, public domain), and the Place… list leaves out places hidden by the tag filter. Real flights, touch and keyboard panning are for Lucas to try: Claude's pane runs no animation frames, so `flyTo` does not animate there

## Goal

Places on a slide or in the reader layer: offices, a route, where something happened. Readers explore the map (pan, zoom, click a place for its text or its slide, filter by tag); presenters tour it, flying from place to place click by click. Map tiles come from a server, which conflicts with offline presenting (D-002) and privacy (D-010), so the map must also work without them.

## Lucas's decisions (2026-10-13)

1. **Library**: Leaflet **1.9.4** (the stable release; 2.0 is still an alpha) from npm, vendored as `vendor/leaflet-1.9.4/` (`dist/leaflet-src.esm.js`, `dist/leaflet.css` and its images, see `VENDORED.md`), lazy-loaded.
2. **Offline and privacy**: click-to-load in reader mode (I-070), plus an author's **fallback image** and **local tiles** in the show folder. No snapshot rendering in the editor (yet).
3. **Tiles**: OpenStreetMap by default, with its attribution. In audience mode tiles load **live** (the presenter's own laptop, like web page slots); `present: "static"` shows the fallback instead.
4. **Colors from the template, by tag**, reusing the graph palette (`--slipr-graph-1` … `6`); tags are a legend and a filter in reader mode. The editor shows maps read-only.

## Format (show format 0.2)

A `map` slot value and a `map` reader block share these fields:

```json
{
  "center": { "lat": 52.09, "lng": 5.12 },
  "zoom": 8,
  "markers": [
    { "id": "ams", "lat": 52.3731, "lng": 4.8922, "title": "Amsterdam", "tags": ["city"], "md": "First stop.", "slide": "s-team" }
  ],
  "layers": [{ "data": "data/route.geojson", "title": "Route", "tag": "route" }],
  "tiles": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  "steps": [{ "marker": "ams", "zoom": 11 }],
  "present": "live",
  "load": "click",
  "caption": "…",
  "fallback": { "src": "images/map.png", "alt": "…" }
}
```

| Field | Type | Meaning |
|---|---|---|
| `center` | `{ lat, lng }` | The first view's center. Without it the view fits the markers and layers |
| `zoom` | number 0–22 | The first view's zoom; without a center, the most the fitted view zooms in (useful with a background layer, to keep some context around the places) |
| `markers` | array | `lat`, `lng` (required), `title` (default: the id or the position), `md` (Markdown shown when a reader selects it), `tags` (the first picks the color), `slide` (a link to that slide), `id` (for steps) |
| `layers` | array | GeoJSON files in the show folder (`.geojson` / `.json`): `data` (required), `title`, `tag` (the color). Lines and areas are drawn in the tag's color, points as small circles; a feature's `properties.name` (or `title`) is its tooltip. A layer **without a tag is background** (land, borders): filled with `--slipr-color-bg`, outlined in `--slipr-color-muted`, and left out of the fitted first view unless the map has nothing else |
| `tiles` | string or object | Absent: OpenStreetMap. An `https:` URL template with `{z}`, `{x}`, `{y}` (and optionally `{s}`): another tile server. A relative template (`tiles/{z}/{x}/{y}.png`): tiles in the show folder. `"none"`: no background. Object form `{ url, attribution, maxZoom }`; the attribution is plain text |
| `steps` | array | Audience mode, slots only: `{ marker, zoom? }`, one per click after the slide's own fragments: fly to that marker (zoom 12 by default) and show its name. Before the first step, and when going back past it, the map shows its first view |
| `present` | `live` · `static` | Slots, audience mode: `live` (default) loads tiles from a server; `static` keeps the fallback (image, or the list of places) and contacts nothing |
| `load` | `click` · `auto` | Reader mode, tiles from a server: `click` (default) waits for the reader's consent per site and tab (I-070); `auto` loads straight away |
| `caption` | string | Below the map |
| `fallback` | image | Static image for print, editor thumbnails, `present: "static"` and failures |

The reader block also has `id`, `type: "map"`, `for`, `depth` and an optional `title`; it has no `steps` or `present`. A map needs a `center`, `markers` or `layers`.

**Validation.** Errors (schema): none of `center` / `markers` / `layers`; a latitude outside ±90 or longitude outside ±180; a zoom outside 0–22; a tile address that is not `https:`, not relative or has no `{z}`; a layer file that is not a `.geojson` / `.json` in the show folder; `steps` or `present` on a block; a map in a 0.1 show. Warnings: a duplicate marker id, a step naming an unknown marker, a marker `slide` that does not exist, a layer file not found (with a file check), a tile server other than OpenStreetMap without an attribution. Marker Markdown is checked like any Markdown.

## Rendering (`shared/embeds/map.js`)

An embed kind (I-070 contract). The static content is an accessible **list** of the places (title and text) and layer titles, so print, thumbnails, screen readers and a failed load always show them. Hydration fetches the GeoJSON layers (through `resolveAsset`, so folder sources and single-file exports work), loads Leaflet and its stylesheet, and draws:

- **Pins** are Slipr's own SVG (a `divIcon` in the tag color, white outline), not Leaflet's marker images; the title is a tooltip. In reader mode a pin is a focusable `role="button"` with the place's name (Leaflet opens it with Enter).
- **Tiles**: the attribution control shows "Leaflet | © OpenStreetMap contributors" (a link), or the author's text, escaped. Requests use `strict-origin-when-cross-origin` referrers, as OpenStreetMap's usage policy asks for an identifiable referrer.
- **Reader mode** (blocks, and slots in reader mode): drag to pan; Leaflet's **+ / −** and keyboard; the wheel scrolls the page (not captured). A toolbar with **Fit**, the **Place…** list and tag chips (filter and legend); selecting a place shows a panel with its title, Markdown, **Go to slide** and **Clear**; Esc clears. Until the reader moves the map it keeps fitting its space (a reader column settles late); **Fit** resumes that.
- **Audience mode**: no controls, no dragging, fractional zoom so the first view fits exactly (with a margin and room for the pins). Steps are hidden Reveal fragments after the slot (like graph steps); a `MutationObserver` on those fragments only (Leaflet changes classes inside the map constantly) flies to the step's marker, so going back works too.
- Leaflet's panes stack up to `z-index: 1000`; `.slipr-map-canvas` isolates them so they never cover the reader's popovers or top bar.
- Editor thumbnails show the static list (`thumbnail: false`); the editor's audience preview draws the map.

## Offline and privacy

| Situation | Behavior |
|---|---|
| Reader mode, tiles from a server | Click-to-load per site per tab (I-070), unless `load: "auto"` |
| Audience mode, tiles from a server | Live (no question); `present: "static"` for none |
| `tiles: "none"` | Never contacts a server, works everywhere (also folder sources and exports) |
| Local tiles `tiles/{z}/{x}/{y}.png` | Load without a question from the show's own folder: by URL when the show is served (e.g. `npm run serve`, a static host); through the context's `readAsset` for shows opened from a folder or a zip (each tile read as a blob when Leaflet asks for it); packed into single-file exports, which list the tile folder (I-099, below) |
| Fallback image | Print, thumbnails, `present: "static"`, errors |

OpenStreetMap's tile policy forbids bulk downloading ("prefetching") of its tiles; authors who want local tiles make them with a tool and source that allow it.

## Templates

Both templates get a `map` layout (default 1.5.0: title, map, caption; Conclusion 0.1.6: kicker, title, map). They need no new tokens: maps use the graph palette.

## Local tiles everywhere (I-099, 2026-10-14)

A tile set has no list of files in the show, so it cannot be handled like images (`collectImagePaths()` gives no tile paths, so folder and zip shows got no blob URLs for tiles, and the export packed none). Now, without a format change:

- **Folder and zip shows**: `loadShowFromFolder()` / `loadShowFromZip()` give the context a `readAsset(path)` (the source's `readFile`). Audience and reader mode pass it to `hydrateEmbeds(root, { readAsset })`, which passes it on to the kind's `hydrate(el, live, { readAsset })`. A map with local tiles (`data-map-tiles-local`, the template as written) then uses a Leaflet tile layer whose `createTile` reads each tile through `readAsset` and shows it as an object URL (freed once drawn). Shows loaded by URL have no `readAsset` and keep loading tiles by URL. The editor preview reads tiles like the show's other files (`editor/js/io/show-files.js`: session files, folder, zip, URL).
- **Single-file export**: `packShow()` takes an optional `listFiles(dir)`. For each local tile template the show uses (`localTileTemplates()`), it lists the template's folder (`tileFolder()`) and packs every file the template names (`tilePattern()`: `{z}`, `{x}`, `{y}` numbers, `{s}` a letter, `{r}` `@2x` or nothing). `npm run export` lists with Node's `readdir`; the editor's **Export…** walks the folder handle. A show the editor opened by URL cannot be listed: its tiles are left out, with a warning.
- **Zip export** (editor, I-092) already copies every file of a folder or zip show, tiles included.
- Fixture `shows/fixtures/local-tiles/` (21 plain tiles, zoom 0 to 2); tests in `shared/test/local-tiles.test.js`. Verified in Claude's browser pane: the single-file export (16 tiles from the file, no requests), `viewer/?zip=` and `viewer/?folder=` in audience and reader mode, the editor preview of a folder show, and the editor's Export… of a folder show (21 tiles packed).

A large tile set makes a large export (every tile is embedded): keep offline tile sets to the zoom levels and area the talk needs.

## Map editor (E-021, 2026-10-14)

Lucas's decisions: places are set on an **interactive mini map in the form** (not on the slide preview), with a **snapshot** button for the fallback image, and the full scope (places, steps, layers with a file picker, tiles, present, load, caption, fallback, and Map as a reader block type). Modules: `editor/js/map-values.js` (DOM-free value helpers, tested) and `editor/js/ui/map-fields.js` (shared by the `map` slot editor and the Map block editor). The mini map uses the same Leaflet loader, pins and local tile layer as the viewer (`loadLeaflet()`, `pinSvg()`, `localTileLayer()` exported from `shared/embeds/map.js`); its tiles from servers load with `crossOrigin` so a snapshot can draw them. The snapshot draws the loaded tiles, the vector layers and pins (serialized SVG) and the attribution text into a canvas; a server without CORS taints it, which is reported. New places get an id from their title (steps need ids); renaming an id updates the steps, removing a place removes its steps.

## Out of scope

- Rendering a snapshot of the map as the fallback image at authoring time.
- Marker clusters, custom icons per marker, popups with images, steps that fit a layer or a group of markers.
