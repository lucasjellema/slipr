# Converter: architecture

## Overview

The converter is a pipeline of pure stages. The **core** (`src/`) has no filesystem access: it takes the bytes of a `.pptx` and returns a result object. The **CLI** (`bin/`) handles files and arguments. This split lets the same core run in the browser later (import a PPTX inside the editor, backlog I-023).

```
 deck.pptx (bytes)
      │
      ▼
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │ pptx-reader  │──►│   extract    │──►│     map      │──►│    emit      │
 │ unzip + XML  │   │ → neutral    │   │ → Slipr      │   │ show.json +  │
 │ parse, rels  │   │   slide model│   │   layouts    │   │ assets+report│
 └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
                                              ▲                   │
                                     template.json            shared/validate.js
```

## Planned file structure

```
converter/
├── package.json          dependencies: jszip, fast-xml-parser
├── bin/
│   └── pptx2slipr.js     CLI: parse args, read file, call convert(), write output
├── src/
│   ├── index.js          convert(bytes, template, options) → { show, assets, report }
│   ├── pptx-reader.js    zip → { presentation, slides[], layouts, masters, notes, media, rels }
│   ├── extract.js        OOXML → intermediate model (IM), one object per slide
│   ├── text.js           DrawingML text runs/paragraphs → Markdown (levels, bold, italic, links)
│   ├── map.js            IM slide → Slipr slide (layout choice + slot filling)
│   ├── emit.js           assemble show.json, asset list, conversion report
│   └── report.js         collects decisions and warnings during all stages
└── test/
    ├── fixtures/*.pptx   small hand-made decks, one feature each
    └── *.test.js         node --test
```

## Stages

### 1. `pptx-reader.js`: reading OOXML
- Unzips with `jszip` and parses XML with `fast-xml-parser` (attributes preserved, namespaces kept as prefixes).
- `ppt/presentation.xml` → slide order via `p:sldIdLst` + `ppt/_rels/presentation.xml.rels`.
- For each slide: `ppt/slides/slideN.xml`, its `.rels` (→ layout, images, notes), the layout XML (→ layout name `p:cSld/@name`, placeholder types).
- `docProps/core.xml` → title, author, date.
- PowerPoint sections (`p14:sectionLst` in the `p:extLst` of `presentation.xml`) → Slipr `chapters`.

### 2. `extract.js`: intermediate model
For each slide it produces a neutral model, independent of both PowerPoint and Slipr:

```js
{
  index: 3, hidden: false,
  pptxLayoutName: "Title and Content",
  title: "Why Slipr?",
  subtitle: null,
  bodies: [ { markdown: "- one\n  - nested", placeholderType: "body" } ],
  images: [ { mediaPath: "ppt/media/image4.png", alt: "…", bbox: {x,y,w,h} } ],
  notes: "…",
  unsupported: [ "chart", "smartArt" ],
  hasBuildAnimations: true
}
```

Placeholder types (`title`, `ctrTitle`, `subTitle`, `body`, `pic`, `obj`) decide what goes where. Non-placeholder text boxes are added to `bodies` in reading order (top-to-bottom, left-to-right by bounding box).

### 3. `map.js`: choosing the layout
1. **Explicit mapping**: CLI `--mapping`, then the template's `pptxMapping`, keyed by PowerPoint layout name.
2. **Heuristics** when no mapping applies:
   - title + subtitle, no body → `title`
   - title only, slide index > 0 → `section`
   - one image, little or no text → `image-full`
   - two bodies, or body + image → `two-column`
   - otherwise → `bullets`
3. Slot filling matches IM fields to the chosen layout's slots by name and type. Anything left over is appended to `notes` with a marker, so no content is silently lost, and is recorded in the report.

### 4. `emit.js`: output
- Builds `show.json` per `docs/show-format.md` with slide ids `s-01`, `s-02`, ...
- Assets: `[{ from: "ppt/media/image4.png", to: "images/slide03-1.png", bytes }]`. Duplicate images (same hash) are written once.
- Validates the result with `shared/validate.js`, and any warnings go into the report.
- Report: Markdown, one section per slide: chosen layout + reason, skipped elements, warnings.

## Error handling

- A corrupt zip or missing `presentation.xml` is a fatal error with a clear message.
- Anything slide-level is never fatal: the slide falls back to `bullets` with whatever text was found, plus a report entry.

## Testing

Each fixture deck covers one feature (bullet levels, notes, images, hidden slide, two-content layout, unsupported chart). The tests assert on the intermediate model and on the final `show.json`, not on the internals.
