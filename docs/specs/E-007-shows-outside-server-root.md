# E-007: Present and Read for a show folder outside the server root

Status: **accepted** by Lucas on 2026-10-10: **C** (shared folder handle) and **T1** (root-relative refs plus fallback by name). Recorded as D-012. Built in E-002 (loader) and E-007 (viewer `?folder=`, Present / Read) · 2026-10-10
Affects: E-007 (Present / Read) and, directly, E-002 (open and new-from-template). Open question in `editor/ARCHITECTURE.md`.

---

## 1. The problem

The editor opens a show folder with `showDirectoryPicker()` (D-007). The viewer loads a show by URL (`viewer/?show=<path>`) from the dev server. Two things break when the folder is not under the server root (for example `D:\Talks\2026-ai`):

1. **The viewer has no URL for the show or its images.** A directory handle has no path and no URL.
2. **The template can't be found.** This affects E-002 too, not only Present. `template.ref` is relative to `show.json` (`../../templates/default`), but the handle only gives access *inside* the picked folder. For new-from-template, the editor also can't work out which relative ref to write, because it doesn't know where the folder is.

What helps: the editor and the viewer are served from the **same origin** (`localhost:8080`), and directory handles can be stored in IndexedDB and read by another tab of that origin. `shared/load.js` already accepts an injected `fetch`.

## 2. Options for Present / Read

| | A. Folder under server root only | B. Snapshot hand-off | C. Shared folder handle (**recommended**) |
|---|---|---|---|
| How | Status quo: the viewer opens `?show=<path>` | The editor opens `viewer/?from=editor`, and the viewer asks the editor tab (BroadcastChannel) for the show JSON and image blobs | The editor saves, stores the folder handle in IndexedDB under a key, and opens `viewer/?folder=<key>`. The viewer reads `show.json` and images through the handle |
| Out-of-tree folders | ✖ | ✔ | ✔ |
| Unsaved changes | Saves first | Presents the draft as-is | Saves first, as `editor/ARCHITECTURE.md` already plans |
| Viewer tab reload | ✔ | Only while the editor tab is open | ✔ The viewer may need one click to grant read access again (no prompts on page load) |
| Viewer works without the editor | ✔ | ✖ | ✔ A "Open folder…" entry on the viewer's help page, which is useful on its own |
| New code | none | protocol, both sides | `shared/folder-source.js` (also needed by E-002), plus a small viewer branch |
| Browser | any | Chromium | Chromium for `?folder=` only; `?show=` URLs keep working everywhere |

**Recommendation: C.** E-002 needs a "read a show from a directory handle" module anyway, and C reuses it in the viewer. There is no messaging protocol to maintain, a reload survives, and the viewer gains "open a local folder" on its own. B's only advantage is presenting unsaved changes. Present already saves first, so we don't need B. It can still be added later on top of the same loader.

How it works (C):
- `shared/folder-source.js`: `{ readText(path), readBlob(path) }` over a directory handle, relative to `show.json`, with no access above the folder. It is tested in Node with a fake handle.
- `loadShow()` gets a source option instead of a URL. Images referenced by the show (`collectImagePaths`) are read once into `blob:` URLs, so `resolveAsset()` stays synchronous and the renderers don't change.
- Reader state stays keyed by `show.id` (D-010), so it's the same whether a show is opened by URL or by folder.

## 3. Template resolution (blocks E-002)

| | Option | Notes |
|---|---|---|
| T1 (**recommended**) | **Root-relative refs for new shows + fallback by name.** New shows get `"ref": "/templates/default"`. That is still a valid "path or URL relative to `show.json`", so there's no format change, and it resolves on the dev server and on any host that serves Slipr at its root. For a folder source, a ref that leaves the folder resolves against Slipr's own `templates/<last segment>/`, with a notice in the editor ("Using template *default* from Slipr's templates"). | Existing shows (`../../templates/default`) keep working by URL, and work by folder thanks to the fallback. Needs a paragraph in `docs/show-format.md` (when refs are resolved by name). |
| T2 | Copy the template into the show folder (`ref: "./template"`) | Fully self-contained and portable, but each show has its own copy, which drifts from template fixes |
| T3 | Also ask the user to pick the Slipr folder | No guessing, but an extra picker step every session, and still no way to compute a relative ref |

## 4. Decisions needed

1. Present / Read: **C** (shared handle, saves first), or B, or A?
2. Template refs: **T1** (root-relative for new shows plus fallback by name), or T2, or T3?

If both recommendations are accepted, E-002 builds `shared/folder-source.js` and the loader change. E-007 then only adds the handle hand-off and the viewer's `?folder=` branch. The decision gets an entry in `docs/decisions.md` (D-011 is reserved for the embed architecture in I-070, so this one would be D-012).
