# Slipr Editor

The editor is a browser application for creating and changing Slipr shows. You never have to touch JSON. You pick layouts, fill in their fields, drop in images, and see the result immediately, rendered exactly as the viewer will show it.

> Status: **in progress (Phase 5: Editor MVP)**. The 3-column shell, store, actions, undo/redo, slide inspector, reader inspector, live preview and keyboard shortcuts are implemented (E-001). Direct folder read/write via the File System Access API is next (E-002).
> Try it: run `npm run serve` and open <http://localhost:8080/editor/?show=../shows/demo/show.json>.
>
> **Not yet:** saving to disk (Save only clears the "unsaved" dot), opening or creating a show folder, image drop, hotspots, a layout picker with previews. Only text, rich-text and list fields have proper inputs. **Don't edit image, quote, code or card fields yet**: the current form replaces their value with plain text (bug E-010). The sections below describe the MVP as planned; the screen layout and shortcuts already work.

## Screen layout

```
┌──────────────┬──────────────────────────┬──────────────────────────────┐
│ Slides       │ Slide                    │ Preview                      │
│              │ Layout: [Title+bullets▾] │                              │
│ 1 ▣ Title    │ [Slide] [Reader]         │ (Audience|Reader▾ as Dev ▾)  │
│ 2 ▣ Why      │ Title  [____________]    │   ┌──────────────────────┐   │
│ 3 ▣ Demo     │ Body   [- item       ]   │   │  rendered slide      │   │
│ + Add slide  │        [- item       ]   │   └──────────────────────┘   │
│              │ Notes  [____________]    │   ⚠ 1 warning                │
│ ⚙ Show       │                          │                              │
└──────────────┴──────────────────────────┴──────────────────────────────┘
 [Open] [New] [Save]                              [Present ▶] [Read 📖]
```

## What you can do *(planned, MVP)*

- **Create a new show** from a template: choose the template, give it a title, and choose a folder.
- **Open an existing show folder** and **save** it back (`Ctrl+S`).
- **Manage slides**: add, duplicate, delete, reorder (drag and drop), hide from audience or reader mode.
- **Edit a slide**: choose a layout, then fill in the fields that layout offers. Changing the layout keeps the content of fields with matching names.
- **Rich text and lists** use simple Markdown: `**bold**`, `*italic*`, `- bullet`.
- **Images**: drop or paste an image onto an image field. It is copied into the show's `images/` folder, and you are asked for alt text.
- **Speaker notes** per slide.
- **Reader layer** per slide, in a separate *Reader* tab next to the *Slide* tab:
  - a one-line summary
  - a list of reader blocks (text, collapsible panel, callout, tabs, image with hotspots, embed, link to another slide) that you can add, reorder and remove
  - per block: which profiles see it and its depth (essential / standard / deep dive)
  - related slides
- **Show settings**: chapters, glossary terms, reader profiles and paths. Paths are built by picking slides in order.
- **Preview in either mode**: audience slide, or the reader view of the slide *as a chosen profile at a chosen depth*.
- **Undo / redo** (`Ctrl+Z` / `Ctrl+Y`).
- **Warnings** appear for things like a missing title, missing alt text or too many bullets.
- **Present** or **Read** opens the viewer on your show.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl+S` | Save |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+Enter` | New slide after the current one |
| `Ctrl+D` | Duplicate slide |
| `Alt+↑` / `Alt+↓` | Move slide up / down |
| `F5` | Present from the current slide |
