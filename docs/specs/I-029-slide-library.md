# I-029: Slide library

Status: **done** · 2026-10-14 · Editor only; no show or template format change. Verified in Claude's browser pane: an empty library, **Copy to library…** from the show grid with two selected slides (tags, a new collection; the files and the glossary term they use were stored once each), the library opened from another show (the Conclusion demo) with thumbnails drawn in that show's template and badges for a layout switch and content kept aside, search (text inside a map's places), the collections dialog, **Insert** of both slides after the current slide (selected afterwards, a notice listing what changed), and one **Undo** removing both. Export, import, update from slide, reordering and removal are covered by tests (`editor/test/library.test.js`); a real drag and the save dialog are for Lucas to try

## Goal

Reuse slides across shows: copy one or more slides into a personal library, find them again later (browse, search, filter), and insert them into the show you are working on, usually a different show, maybe with a different template. Manage the library: tags, notes, collections, order, updates, removal, and a zip to back it up or move it to another browser.

## Lucas's decisions (2026-10-14)

1. **Another template**: keep the slide's layout when the show's template has a layout with that id; otherwise switch to the layout whose slots take most of the content (same slot name, same type when known), the way the layout picker switches (slots kept by name; the rest goes to `_orphaned`, and comes back when a layout with those slots is chosen). Say so in a notice; the library marks such entries before you insert.
2. **References**: links between slides inserted together follow their new ids. Links to slides that are not in the show are removed from structured fields (`reader.related`; a `slide-ref` block becomes a text block with its label, or goes when it has none; graph node and map marker `slide` links are dropped). Markdown `#slide` links stay (the validator warns). Profiles in a block's `for` that the show lacks are removed (a block left without one shows to everyone). Inserted slides join the chapter of the slide they follow.
3. **Glossary**: terms the show lacks are added; when the show defines the same id differently, the show's term wins and the notice names it.
4. **Scope**: tags, note, rename, remove; export and import as a zip; collections (a slide is in at most one; drag or ▲ ▼ to reorder within it); update an entry from the current slide (entries are otherwise frozen snapshots).

## Storage

IndexedDB database `slipr-library` (browser only, nothing leaves it, D-010), three object stores:

| Store | Key | Holds |
|---|---|---|
| `entries` | `id` | One library slide (below) |
| `collections` | `id` | `{ id, name, order }` |
| `files` | `hash` | `{ hash, blob, type }`: file bytes, once per content (SHA-256, 32 hex characters) |

An entry: `id`, `title`, `tags` (lower case), `note`, `collection` (id or null), `order` (within its collection), `createdAt`, `updatedAt`, `source` (`showId`, `showTitle`, `slideId`, `template { id, name, version }`), `slide` (a copy, without `chapter`), `layoutDef` (its layout in the source template, for slot types), `glossary` (the terms its Markdown references as `[[id]]`), `files` (`{ path, hash, type, size }`: images, overlays, fallbacks, PDFs, graph data, map layers, backgrounds and local pages, from `showFiles()`). Removing entries removes files no entry uses any more. Without IndexedDB the library lives in memory until the tab closes.

**Zip** (Export… / Import…): `library.json` (`{ format: "slipr-library", version: 1, exportedAt, collections, entries }`) and `files/<hash>.<ext>`. Export saves the selected entries, or all. Import adds new entries, replaces entries it has an older copy of (`updatedAt`), skips the rest, and adds collections it does not know; file hashes that are not hex are ignored.

## Copying

From the show grid's selection bar (**Copy to library…**, one or more slides) or the library's **Copy current slide…**: a title (one slide), tags, a note and a collection (or a new one). Files are read from where the show lives: files added in this session, the show folder, the zip it was opened from, or its URL. A file that cannot be found is reported and left out.

## Inserting

**📚 Library** in the toolbar opens the library. Thumbnails show each slide **as it would be inserted here** (layout switched, drawn with this show's template and the entry's own files). Badges: *‹template› template* for another template, *Becomes: ‹layout›* and *Kept aside: ‹slots›*. Filters: search (title, tags, note, source show, slide text), tags, collection, template and source show (when there is more than one), sort (my order, newest, title). Click cards to select them; **Insert N slides after “…”** inserts them, in library order, after the editor's current slide:

1. Each file is written into the show (folder, or this session's files for shows without one) unless the show has the same file at that path; when it has a different file there, the copy gets the content hash in its name (`images/b-1a2b3c4d.png`) and the slide follows.
2. `prepareInsert()` (DOM-free): new slide ids, layout, references, chapter, glossary (decisions above), plus notices.
3. One `insertSlides` action: one undo step. The first inserted slide is selected; the notices appear in a banner.

## Modules

| Module | Role |
|---|---|
| `editor/js/library/library-model.js` | DOM-free: entries, `bestLayout()`, `landing()`, `prepareInsert()`, search / filter / sort, reorder, zip manifest and import plan |
| `editor/js/library/library-store.js` | IndexedDB (or memory) adapter, `SlideLibrary`: add, save, update, remove (with file clean-up), collections, `exportZip()`, `importZip()` |
| `editor/js/library/library-io.js` | Between the open show and the library: read the show's files, copy, update from a slide, insert (write files, dispatch) |
| `editor/js/ui/library-dialog.js` | The library dialog, the copy dialog, the collections dialog |
| `editor/js/actions.js` `insertSlides` | The store action |

## Notes and limits

- When no layout in the target template has slots with the same names (e.g. *Two columns* in the default template → the Conclusion template), the columns are kept aside, not mapped onto other slots: the decision keeps slots by name, like the layout picker.
- A show opened by URL (not a folder) gets the files in memory for this session, like pictures added to it; they are only kept by saving to a folder (Export Zip… includes them).
- A local web page's own files (scripts or pictures it loads) are not copied, only the page itself.
- Block ids stay as they were (they are unique within a slide); slide ids are new.

## Out of scope

- Sharing a library between people or devices (only by exporting a zip).
- Live links: an inserted slide does not follow later changes in the library, and the library entry does not follow the show.
- Mapping slots by type when names differ.
