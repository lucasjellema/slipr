# Slipr Converter (PPTX → Slipr)

The converter turns a PowerPoint file into a Slipr show folder. It keeps the **content** (titles, text, bullets, images, speaker notes) and maps every slide onto a **layout of a Slipr template**. The show then takes on the look of that template, not the look of the original deck.

> Status: **planned**. Requires Node.js 20 or newer.

## Usage *(planned)*

```
node converter/bin/pptx2slipr.js <deck.pptx> --template <template-folder> --out <show-folder> [options]
```

| Option | Meaning |
|---|---|
| `--template` | The Slipr template to map onto (required), e.g. `templates/default` |
| `--out` | Output folder. It is created if missing, and existing files are only overwritten with `--force` |
| `--mapping <file.json>` | Extra layout mapping (PowerPoint layout name → Slipr layout id), which overrides the template's `pptxMapping` |
| `--id <show-id>` | Show id (default: derived from the file name) |
| `--no-notes` | Skip speaker notes |
| `--notes-to-reader` | Also copy the speaker notes into a reader `text` block. This gives a quick first reader layer, which you then refine in the editor |
| `--force` | Overwrite an existing output folder |

Example:

```
node converter/bin/pptx2slipr.js "C:\talks\cloud-native.pptx" --template templates/default --out shows/cloud-native
```

## What gets converted

| PowerPoint element | Result in Slipr | MVP? |
|---|---|---|
| Slide order | `slides[]` order | ✅ |
| Hidden slides | `audience.hidden: true` | ✅ |
| Title placeholder | `title` slot | ✅ |
| Subtitle | `subtitle` slot | ✅ |
| Body text with bullet levels | `body` (Markdown list) | ✅ |
| Bold / italic / hyperlinks | Markdown | ✅ |
| Pictures | copied to `images/`, `image` slot. Alt text comes from the picture's description | ✅ |
| Speaker notes | `notes` | ✅ |
| Presentation title / author | `meta` | ✅ |
| PowerPoint sections | `chapters` + `slide.chapter` | ✅ |
| Tables | *(later)* `table` slot | ❌ |
| Charts, SmartArt, diagrams | *(later)* image fallback | ❌ |
| Animations, transitions | ignored. Bullet build-ins become `fragments: true` | partly |
| Colors, fonts, positions | ignored on purpose, because the template decides | n/a |

## The conversion report

Every run writes `conversion-report.md` into the output folder. It lists per slide which layout was chosen and why (mapping or heuristic), and what was **skipped**, so you know which slides to touch up in the editor.
