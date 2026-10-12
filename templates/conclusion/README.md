# Conclusion template (magenta)

A Slipr template in the Conclusion house style, derived from the official Conclusion PowerPoint template (*Conclusion 2025, magenta*). The analysis, measurements and decisions are in [docs/specs/I-043-conclusion-template.md](../../docs/specs/I-043-conclusion-template.md).

> **Internal use.** Get the brand team's OK before Slipr shows in this template go in front of clients (decision 1 in the spec). Magenta is reserved for Conclusion itself. Business units need their own variant.

## Layouts

| Layout | For | Slots |
|---|---|---|
| `title-wave` | Opener without a photo | title (≤ 52, two lines of ~26), byline |
| `title-image` | Opener with a full-bleed photo | title, byline, image |
| `agenda` | Numbered agenda (≤ 8), photo right. Also used for **generated agenda slides** (`settings.agenda`) | kicker, title, items, intro, image |
| `text` / `text-dark` | Standard text slide on white / black | kicker, title (≤ 46), body |
| `text-image` | Text column, photo as background | kicker, title, body, image |
| `text-quote-image` | Text left, quote right, photo | kicker, title, body, quote (≤ 170), image |
| `quote-box` | Quote in a magenta box over a photo | kicker, title, quote (≤ 200), image |
| `quote-image` | Quote over a photo | kicker, title, quote (≤ 170), image |
| `section-wave` / `section-image` | Section divider (client case slide) | kicker (≤ 32), title, (image) |
| `title-only` | Title with a free illustration or diagram | kicker, title, image (shown in full) |
| `web` | Title with a live web page (or its screenshot) in the content area. Not in the PowerPoint template (I-071) | kicker, title, page (`web`) |
| `pdf` | Title with a page (or a range, one page per click) of a PDF in the content area. Not in the PowerPoint template (I-072) | kicker, title, document (`pdf`) |
| `columns-4` | Four white columns (Textbox 4x) | kicker, title, cards ≤ 4 × (title ≤ 18, text) |
| `boxes-9` | Nine numbered boxes (Textbox 9x) | kicker, title, cards ≤ 9 × (title ≤ 24, text ≤ 210) |
| `facts` | Key figures over a photo (Facts & figures); the right column is mirrored | kicker, title, cards ≤ 6 × (value ≤ 8, label ≤ 42, icon), image |
| `image-cards-8` | Photo cards with a caption (Onze markten) | kicker, title, cards ≤ 8 × (image, title ≤ 26) |
| `people-2` | Two people (Introduction) | kicker, title, cards ≤ 2 × (portrait, name, role, text) |

The last five are **card layouts**: their `cards` slot holds one object per card (see `docs/template-format.md`). The icons on `facts` are content in Slipr (a field per card), so each figure can have a fitting icon: use magenta brand icons on a transparent background. In PowerPoint they are fixed in the layout, so converted Facts slides have no icons until you add them. The demo show uses a neutral placeholder icon. The social-media icons on the PowerPoint Introduction slide are not carried over.

## Picture styles

`template.json` lists four picture styles (template format 0.3, D-014), defined at the end of `theme.css`: **shadow** (a soft neutral drop shadow), **soft** (edges that fade out), **rounded** (rounded corners) and **frame** (a white border with a thin magenta line, like a print). Authors choose one per picture in the editor, plus an opacity. They are a first proposal and part of the brand review (I-043d).

## Writing body text

The `body` slot supports the template's text styles through Slipr Markdown:

```
Intro line: a normal paragraph.

**Subheading in capitals**

- Bullet
  - Second level (up to four levels)

*A line in Source Serif italic*

A. Letter list
B. …

1. Numbered list
```

House-style rules to keep in mind: one main message per slide, left-aligned text, at most 12 bullets, real photography from the brand library (no AI-generated images), and never type "•" yourself.

## Converting decks made with this template

`template.json` contains a `pptxMapping` with **placeholder roles** for all 20 PowerPoint layouts, plus a `pptxIgnore` list (footer, slide number, theme bar, overlays, logo):

```
cd converter
slipr-convert "deck.pptx" --template ../templates/conclusion --out ../shows/my-deck --lang nl
```

The template's text styles (outline levels used as intro / subheading / serif / A. / 1.) are converted to the Markdown above.

## Assets (all original, from the PowerPoint template)

| File | Source | Notes |
|---|---|---|
| `assets/logos/conclusion-logo.png` | `ppt/media/image8.png` | The original logo. Only the transparent margins are trimmed. No vector version exists |
| `assets/logos/stripes.svg` | `image1.svg` | The rainbow stripe mark (master) |
| `assets/decor/footer-band.svg` | `image3.svg` | Footer band with mark and tagline |
| `assets/decor/wave-lines-a.svg`, `wave-lines-b.svg` | `image4.svg`, `image5.svg` | Wave line art over photos |
| `assets/decor/wave-section.png` | `image6.png` | Wave on the section divider |
| `assets/decor/wave-title.svg` | `slideLayout2.xml` freeforms | The title-slide wave, **converted losslessly** from the original DrawingML geometry. Hairlines are drawn 1 device pixel wide, as PowerPoint does |
| `assets/fonts/source-serif-4-*.woff2` | `@fontsource-variable/source-serif-4` 5.3.0 | SIL Open Font License (`SourceSerif4-OFL.txt`). Optical size 48 is used, as in the template |

**Fonts:** Arial and Arial Black are licensed system fonts, used from the reader's device. They're present on Windows and macOS. On Linux and Android, body text falls back to the metric-compatible Arimo / Liberation Sans, and headings fall back to a bold sans (there is no good Arial Black substitute).

The brand photography in the PowerPoint file is **not** part of this template, and is not committed to the repository.
