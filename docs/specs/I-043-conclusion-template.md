# I-043: Slipr template from the Conclusion PowerPoint template: analysis and proposal

Status: **analysis, awaiting Lucas's decisions** (see the end of this document) · 2026-10-10

Source: `ConclusionTemplatePresentation.pptx` (12 MB, kept out of git). Analysed with python-pptx, slides exported to PNG via PowerPoint, and cross-checked with the house-style rules in the `conclusion-slides` skill (`brand.json`, `layouts.md`). Those rules were measured on the Conclusion Intelligence variant of the same template, which has an identical structure.

---

## 1. Verdict

A faithful Slipr template is feasible. The house style is a clear, consistent *system* (a fixed grid, three fonts, magenta plus a six-colour canvas, a fixed logo spot, a theme bar, a footer band and wave graphics), and that translates well to CSS.

Three things need a decision before building:

1. **Brand rule versus Slipr.** The house-style guidance says slides must never be rebuilt in HTML, only duplicated from the official template. A Slipr show is HTML by nature. We can make it *very* close by using only the original assets (logo, waves, footer) and the exact grid and fonts. Even so, using it in front of clients should get the brand team's OK. → Decision 1.
2. **The converter needs to know placeholder *roles*** for this template. Many decorative or structural elements are "body" placeholders (kicker, footer, theme bar, image overlays), which the current converter would treat as content. → a small template-format addition (0.2). Decision 4.
3. **Several layouts repeat a card** (4 columns, 9 numbered boxes, 6 facts, 8 image cards, 2 people). Slipr slots are fixed names today. → Fixed slots for now, or a new `cards` slot type. Decision 5.

## 2. What is in the file

| Aspect | Finding |
|---|---|
| Slide size | 33.87 × 19.05 cm (13.333 × 7.5 in), **16:9** |
| Theme | "Conclusion 2025 (magenta)", colour scheme "Conclusion2024" |
| Layouts | **20**, one master. The 20 example slides each demonstrate one layout, so the file is also a catalogue |
| Theme fonts | headings **Arial Black**, body **Arial** |
| Other fonts | **Source Serif 4** (italic kickers, quotes, speaker name). Calibri / Segoe UI appear as unused defaults in placeholders (known template issue, see the skill) |
| Embedded fonts | 10 files (Arial Black, Source Serif 4 48pt / SemiBold, Segoe UI, Segoe UI Light). They are PowerPoint-obfuscated, **not usable on the web** |
| Logo | `image8.png`, about 1700 px wide, white wordmark on a black block with a 7-stripe rainbow mark. Placed **per slide** in picture placeholder idx 91 (idx 92 on Facts & figures). There is **no vector (SVG) logo** in the file |
| Other graphics | `image1.svg` the rainbow stripe mark (master); `image3.svg` the **footer band** (black, mark + "BUSINESS DONE DIFFERENTLY"); `image4.svg` / `image5.svg` the **magenta wave line art** (stroke `#BC448C`); `image6.png` a wave raster; the title slides' wave is drawn as about 45 freeform shapes in the layout |
| Photography | about 40 photos from the brand library (example content in the layouts and slides) |

### Colours

| Role | Hex | Use |
|---|---|---|
| Black | `#000000` | dominant background (14 of 20 layouts are dark) |
| White | `#FFFFFF` | text on dark; background of the light layouts |
| **Magenta** | `#BC448C` | titles, bullets, numbers, theme bar, waves, quote box. **Reserved for Conclusion itself.** Business units use their own primary colour (Intelligence: red `#E63232`), never magenta |
| Magenta 10 % | `#F8ECF3` | light tint (computed, to be verified with marketing) |
| Canvas | red `#E63232` · cyan `#00AACB` · blue `#1369AF` · yellow `#F1CA13` · green `#529F45` · purple `#5A3F8C` | the rainbow mark, charts, accents |
| Light grey | `#F2F2F2` | theme `lt2` |

### Typography

| Element | Style |
|---|---|
| Title | Arial Black, **UPPERCASE**, magenta, 1 line on content slides (max ~46 characters) |
| Kicker ("Subtitel" above the title) | Source Serif 4 **italic**, white/black |
| Title slide title | Arial Black uppercase, magenta, very large, max 2 lines of ~26 characters |
| Body | Arial. Bullets are magenta squares, up to 4 levels |
| Body styles (outline levels 4–8) | intro line · **bold uppercase subheading** · plain line · letter list A. B. · numbered list 1. 2. |
| Quotes | Source Serif 4 italic, white. Either in a **magenta box** or directly over a photo |
| Sizes | 10.13 / 12 / 14 / 16 / 18 / 36 pt only |

### The grid (from `brand.json`, as % of the slide)

| Element | Position / size |
|---|---|
| Margins left / right | 0.96 in = **7.2 %** of the width |
| Content area | top 1.19 in (**15.9 %**) to bottom 6.31 in (**84.1 %**) |
| Kicker | top 4.9 % · title top 8.2 %, width 63 % |
| Logo, content slides | x 79.8 %, y 4.9 %, 13 % × 7.4 % |
| Logo, title / client-case slides | top left (title) or right (client case), larger: 2.65 × 0.85 in |
| **Theme bar** | left edge, 1 % wide (0.13 in), from 15.9 % to 84.1 % height, magenta. Never a full-width header or footer bar |
| Footer band | bottom 3.4 %, full width: mark + tagline left, slide number right |
| Columns | 4 columns: x 7.2 / 29.3 / 51.2 / 73.3 %, width 19.5 %. 3 columns: width 26.7 % |

### Hard rules that matter for a web template

- **Square corners** everywhere. No rounded corners.
- **Left-aligned** text, except quotes.
- **No decorative accent lines under titles.** Note: the Slipr default template has one, and the Conclusion template must not.
- Bullets come from the layout. Never type a "•" yourself.
- **Only the original logo and waves**, never a regenerated or redrawn version.
- **Real photography** from the brand library, no AI-generated images.
- One main message per slide. Calm, business-like, plenty of whitespace.

## 3. Layout inventory and proposal

| # | PowerPoint layout | Proposed Slipr layout | Slots | Priority |
|---|---|---|---|---|
| L01 | Title slide (wave) magenta | `title-wave` | title, byline (speaker) | **MVP** |
| L00 | Title slide (image) | `title-image` | title, byline, image (full-bleed) | **MVP** |
| L03 | Text | `text` (light) | kicker, title, body | **MVP** |
| L04 | Text (zwart) | `text-dark` | kicker, title, body | **MVP** |
| L17 | Text + image | `text-image` | kicker, title, body, image (background) | **MVP** |
| L07 | Text, quote & image | `text-quote-image` | kicker, title, body, quote, image | **MVP** |
| L05 | Quote in textbox | `quote-box` | kicker, title, quote, image | **MVP** |
| L06 | Quote with image | `quote-image` | kicker, title, quote, image | **MVP** |
| L19 | Client intermediate #2 | `section-wave` | kicker, title | **MVP** (section divider) |
| L18 | Client intermediate #1 | `section-image` | kicker, title, image | **MVP** |
| L02 | Agenda (8x) | `agenda` | kicker, title, items (≤ 8), intro, image | **MVP**, and used for Slipr's *generated* agenda slides (see §5) |
| L10 | Alleen titel | `title-only` | kicker, title, image (free illustration) | **MVP**, the general fallback |
| L14 | Textbox 4x | `columns-4` | kicker, title, 4 × (heading, text) | phase 2 (cards) |
| L13 | Textbox 9x | `boxes-9` | kicker, title, 9 × (heading, text) | phase 2 (cards) |
| L08 | Facts & figures | `facts` | kicker, title, 6 × (value, label), image | phase 2 (cards + icons) |
| L11 | Onze markten | `image-cards-8` | kicker, title, 8 × (image, title) | phase 2 (cards) |
| L09 | Introduction | `people-2` | kicker, title, 2 × (portrait, name, function, text) | phase 2 (cards) |
| L12 | 3 images + logo's | — | | **skip** (manual in PowerPoint, per house style) |
| L15 / L16 | Logo's 30x / 36x | — | | **skip** (same) |

Notes:
- No new layouts are invented. Designing layouts is the brand team's job. A generic `two-column` or `image-full` therefore doesn't exist in this template. The converter's best-fit logic is template-agnostic and puts leftovers in the reader layer, so that's not a problem.
- Light and dark versions of the same layout are separate layout ids (`text` / `text-dark`), as in PowerPoint. Slides stay free of styling.

### Reader mode
PowerPoint has nothing to copy here, so this is the one part that needs design, within the house style:
- a white page with Arial body text
- headings in Arial Black uppercase magenta, kickers in Source Serif 4 italic
- callouts with square corners on the magenta 10 % tint, and quote blocks in Source Serif 4 italic with a magenta rule on the left
- popovers in black and white, square

The slide visuals themselves keep their dark or light design, and reflow on phones as in the default template.

## 4. Assets

| Asset | Source | Plan |
|---|---|---|
| Logo | `image8.png` (raster) | Use as-is for now. **Ask the brand team for the vector logo** (SVG), for crisp rendering on large screens. Never redraw it |
| Rainbow mark, footer band | `image1.svg`, `image3.svg` | Use the original SVGs unchanged |
| Waves | `image4.svg`, `image5.svg`; title-slide wave = freeforms | Use the SVGs. For the title wave, have PowerPoint export the layout as SVG (`Slide.Export(…, "SVG")`) and keep only the wave group. That way it's the original geometry, not a regenerated wave |
| Fonts | — | **Source Serif 4** is open source (SIL OFL): put woff2 files in `templates/conclusion/assets/fonts/` (offline, D-002). **Arial / Arial Black** are licensed system fonts: use `local()` in `@font-face`, with fallbacks. Windows and macOS have both. Linux/Android have neither: Arimo (metric-compatible with Arial, OFL) covers body text, but there is **no good Arial Black substitute**, so headings would fall back there |
| Photos | brand library (in the file) | Only for local testing and previews, **not committed** unless you confirm the licence allows it. The template itself needs no photos: they're show content |

## 5. Changes needed in Slipr

| # | Change | Why | Size |
|---|---|---|---|
| a | **Template format 0.2: placeholder roles in `pptxMapping`.** Per PowerPoint layout: the Slipr layout id plus `idx → slot` (e.g. `35 → kicker`, `13 → body`, `14 → image`) and an ignore list (`15, 16, 34, 84, 85, 86, 87, 91, 92`) | Without it the converter turns kicker, footer and overlays into body text. With it, decks made with this template convert one-to-one | small (schema + spec + converter) |
| b | Converter: ignore auto-generated alt text ("… Door AI gegenereerde inhoud is mogelijk onjuist.") | The logo placeholder carries exactly such text | tiny |
| c | **Generated agenda uses the template's `agenda` layout** when it exists (currently built-in markup) | The house style has its own agenda slide | small (viewer) |
| d | Slide number position and colour styleable by the template (Reveal's `.slide-number`) | Footer: number bottom right in the band | tiny |
| e | Markdown: one way to write the body styles *subheading* and *letter list* | The template's text slides use them | **format decision**: e.g. a paragraph that is entirely bold = subheading (CSS can then style it), and `A.` lists |
| f | Later: a `cards` slot type (an array of objects) for the repeated-card layouts | Phase 2 layouts | medium (format 0.2/0.3) |
| g | Template variants per business unit (shared layouts, different primary colour) | Magenta is reserved for Conclusion | later. CSS tokens already make this cheap |
| h | Brand checks as validator warnings: title > 46 characters, kicker > 60, > 12 bullets, quote > 200 | Overflowing text is the most common fault | small (the template's `maxLength` / `maxItems` already exist) |

## 6. Proposed steps

1. **Extraction tool** (`slipr-template-from-pptx`, in the converter package) produces a *draft* `templates/conclusion/`:
   - theme tokens from the colour and font scheme
   - one layout skeleton per chosen PowerPoint layout, with placeholders converted to % positions
   - `pptxMapping` with placeholder roles
   - the original SVG and PNG assets
2. **Hand finishing:** the 12 MVP layouts in HTML/CSS on the exact grid, `theme.css` (fonts, square corners, no title underline), `reader.css`, and reflow rules for phones.
3. **Visual check:** render every Slipr layout at 1280 × 720 next to PowerPoint's own export of the same example slide, and compare side by side (scripted).
4. **Converter:** placeholder roles (5a, 5b). Test by converting the template's own 20 example slides locally. They are the perfect fixture, but they contain brand photos, so they're not committed.
5. **Demo:** `shows/conclusion-demo/` showing every layout, with placeholder text and no brand photos.

Estimate: 2 to 3 sessions for MVP steps 1–5, and one more for the phase 2 card layouts.

## 7. Decisions for Lucas

1. **Brand approval.** Internal use first, and ask the brand team before Slipr shows go in front of clients? Or do you already have the mandate? lucas: internal use first
2. **Which business units.** Only Conclusion (magenta), or also e.g. Conclusion  Intelligence (red) as a variant from the start? lucas: only Conclusion (magenta)
3. **What goes into git.** The logo, rainbow mark, footer and wave SVGs in `templates/conclusion/assets/`: OK to commit (private repo)? Photos: not committed (proposal). lucas: ok to commit, leave out photos
4. **Template format 0.2** with placeholder roles (5a): agreed? lucas: agreed
5. **Repeated cards:** fixed slots per card for now (simple, verbose), or the `cards` slot type first (cleaner, a format change)? Proposal: MVP without the card layouts, then `cards` in phase 2. lucas: proposal accepted
6. **Markdown for subheadings and letter lists** (5e): agree with "an entirely bold paragraph = subheading" and `A.` lists? lucas: agreed
7. **Vector logo:** can you get the SVG logo from the brand portal or marketing? lucas: only jpg and png available, no SVG
