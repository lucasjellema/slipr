# I-086: Glossary terms clickable in slides (reader mode)

Status: **done** · 2026-10-12 · Phase 6 · Decision D-015. Verified in Claude's browser pane: terms and aliases linked on reader-mode slides (also inside bold text), popovers open, audience mode unchanged, pin mode places the pin over a term, the editor's Other names field

## Goal

In reader mode, the glossary terms that appear on a slide (titles, text, bullets, card fields) can be clicked, tapped or reached with the keyboard to open the same definition popover as `[[term]]` in reader text. Audience mode stays unchanged: plain text, no popovers.

## Decisions (Lucas, 2026-10-11/12)

- **Automatic detection**, always on (no show setting).
- **Pin mode keeps priority**: while placing a pin, a click on a term places the pin; otherwise it opens the definition.
- **Other names** (option b): an optional `aliases` list per glossary term, matched like the term itself.
- **Version**: `aliases` belongs to **show format 0.2** (with extra images and picture styles). A 0.1 show with aliases is an error; the editor sets 0.2 when the first alias is added.

## Matching (`shared/glossary.js`, DOM-free)

- Each glossary term contributes its `term` and its `aliases` as phrases.
- A phrase matches as **whole words**: the characters before and after are not letters or digits (Unicode).
- **Case-insensitive and accent-insensitive** (`café` matches `Cafe`), and any run of white space matches any other.
- **Longest phrase first** at a position: *layout picker* wins over *layout*. The longest match consumes its text even when that term is not linked again, so *layout* is never linked inside *layout picker*.
- **First occurrence per slide**: each term is linked once per slide visual. A term that the slide already references explicitly (`[[term]]` in a Markdown slot) counts as already linked.

## Linking (`shared/glossary.js`, browser)

`linkGlossaryTerms(element, glossary)` walks the text nodes of a rendered slide and wraps each first occurrence in the same element Markdown produces: `<button type="button" class="slipr-term" data-term="<id>">…</button>`, so the existing popover wiring (`viewer/reader/interactions.js`) and the template's `.slipr-term` style apply unchanged. It skips text inside links, buttons, existing terms, code, diagrams and the extra-image layer. Matching works per text node, so a term split by formatting (`**layout** picker`) is not found.

`shared/render.js` calls it for **reader mode** only (also `slipr-mode-reader-fixed`), so the viewer and the editor's reader preview agree. Audience mode is untouched.

## Format: `glossary.<id>.aliases` (show format 0.2)

```json
"glossary": {
  "ai": { "term": "artificial intelligence", "aliases": ["AI", "A.I."], "definition": "…" }
}
```

- `aliases`: array of non-empty strings, optional.
- Validation: aliases in a 0.1 show → error. The same name (term or alias, compared like the matching) on two terms → warning; the first term wins.
- Reader search indexes aliases with the glossary entry.

## Editor

Show settings → Glossary: an **Other names** field per term (comma-separated), stored as `aliases` (empty removes the key). The first alias sets the show to 0.2.

## Out of scope

Auto-linking inside reader blocks (I-031 stays an idea); per-slide opt-out; matching across formatting boundaries.
