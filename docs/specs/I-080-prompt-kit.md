# I-080: Prompt kit (let any AI chatbot write a Slipr show)

Status: **done** · 2026-10-15 · Verified in Claude's browser pane: the Create with AI page (both templates, both lengths, the brief filled in, no console errors, no sideways scrolling at 375 px), the start-page link, and Copy fix-up prompt on `shows/fixtures/broken/` (clipboard stubbed: the hidden pane cannot copy). A show written from the Conclusion prompt rendered in reader mode. Related: I-027 (AI assist in the editor), I-018 ("Ask this show"), I-022 (Markdown outline view).

## Goal

A ready-made instruction that a user copies or downloads, adds a content brief to, and pastes into Claude, ChatGPT, Copilot or a similar chatbot. The chatbot answers with a valid `show.json` for the chosen template. When the answer has errors, the viewer's error page gives the user a fix-up message to send back to the same chatbot.

## Lucas's decisions (2026-10-15)

1. **Scope of this pass**: the generator (`npm run prompt`, *full* and *compact* variants, both templates), its tests, a **Create with AI** page in the viewer (linked from the viewer's start page and its manual), and a **Copy fix-up prompt** button on the viewer's validation-error page. The editor button comes later.
2. **Format**: the prompt asks for `slipr: "0.2"` but teaches only the **core**: layouts and slots, reader blocks (`text`, `details`, `callout`, `tabs`, `image` with hotspots, `slide-ref`, `diagram`, and inline `table` / `tag-cloud`), profiles, depth, paths, chapters, glossary and the Markdown subset. Left out, to keep the prompt short and errors rare: overlays and text elements, picture styles, crops and morphs, web pages, PDFs, graphs, maps, embeds, and CSV `data` files.
3. **Output**: the prompts are generated into `docs/ai/prompts/<template>-full.md` and `<template>-compact.md` and committed. A test fails when they are out of date. The viewer page fetches these files, so it stays offline and needs no generator in the browser.
4. **Acceptance**: `docs/ai/prompt-kit-results.md` holds three content briefs and a results table. Claude tests the prompt by writing shows from it and validating them; Lucas adds the ChatGPT and Copilot tries later.

## Generator

`shared/prompt-kit.js` (`// @ts-check`, no Node APIs, so the viewer could use it later) builds the prompt text from the template manifest and the show schema; `tools/prompt-kit.js` writes the files.

```
npm run prompt                                   # all templates in templates/index.json, both variants
npm run prompt -- --template templates/default   # one template
npm run prompt -- --check                        # exit 1 when a committed file is out of date
```

What comes from where, so nothing drifts:

| Part of the prompt | Source |
|---|---|
| Layouts, their slots, types, required, `maxLength`, `maxItems`, card fields | `template.json` |
| `template.ref` (`/templates/<id>`, as the editor writes for new shows, D-012) and `version` (`^major.minor` for 0.x templates, `^major.0` otherwise) | `template.json` |
| Block types, callout variants, transitions, aspect ratios, depth range, table column formats, tag cloud orders | enums in `show.schema.json` (filtered to the core set of decision 2) |
| Worked example | built per template from its layouts and checked by the tests |
| Explanations, writing guidelines, output rules, self-check list | text in `shared/prompt-kit.js` (it is guidance, not format) |

Layouts whose required slot is a left-out type (`web`, `pdf`, `graph`, `map`) are listed under **Do not use** with a one-line reason, so every layout is mentioned and the chatbot never picks one it cannot fill. `table` and `tag-cloud` layouts are allowed with inline data.

## Contents of the prompt

1. What Slipr is; the two layers (concise audience layer, depth in the reader layer).
2. Output rules: one ```json code block and nothing else after it; `slipr: "0.2"`; the exact `template` object; kebab-case ids that never change.
3. The show structure: top-level fields, slide fields, reader layer and blocks (condensed).
4. The template's layouts with their slots and limits, then the **Do not use** list.
5. Markdown subset, `[[glossary-id]]`, `[[id|text]]`, `^[popup]`, slide links `[text](#slide-id)`.
6. Images: chatbots cannot supply image files, so every image is a placeholder `images/<descriptive-name>.png` whose `alt` text describes the wanted picture in detail. The validator's "image not found" warnings then form the user's to-do list.
7. Writing guidelines: few words per slide, depth in reader blocks, `summary` on every slide, a glossary for jargon, every image with alt text.
8. A worked example (2–3 slides).
9. A self-check list.
10. **## Your content**: the user's brief (topic, audience, number of slides, reader layer yes/no, profiles, source material).

*Compact* keeps 1, 2, 4, 6, 9 and 10 and condenses 3, 5 and 7 to a few lines, without the example; it targets roughly 12 000 characters, for tools with small prompt limits. Both variants say: when this text is too long to paste, attach the `.md` file instead.

## Create with AI page (`viewer/create-with-ai.html`)

Pick a template (from `templates/index.json`) and a variant; fill in the brief (topic, audience, number of slides, reader layer yes/no, profiles, source material); **Copy** or **Download .md**. The page fetches the generated file and fills its *Your content* section. Then: save the answer as `show.json` in a folder, open it with the viewer's **Open a show folder…** (or put it under `shows/<name>/`).

## Fix-up prompt

The viewer's "This show can't be shown yet" page gets **Copy fix-up prompt**: a message for the same chatbot that lists the errors and warnings (path and message) and asks for the full corrected `show.json` in one code block, without "image not found" warnings (those are the user's to-do list). Built by `fixUpPrompt()` in `shared/prompt-kit.js`.

## Tests

- Every layout id of each template appears in its prompts.
- The worked example validates against its template without errors or warnings.
- The committed files equal the generator's output (`--check`).
- `fixUpPrompt()` lists every issue and leaves out missing-image warnings.
- The compact variant stays under its size budget.

## Out of scope (Ideas)

The editor button (I-027 territory), the 0.2 extras of decision 2, a prompt that also writes CSV data files, and trying the kit in chatbots on Lucas's behalf.
