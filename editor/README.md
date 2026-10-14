# Slipr Editor

The **Slipr Editor** is a browser application for creating and editing Slipr shows. You never have to touch JSON by hand: you pick layouts, fill in content fields, add images, write the interactive reader layer, and see the result immediately in a live preview rendered exactly as the viewer displays it.

> **Status:** Phase 5 (Editor MVP) done (2026-10-11): every part of a show can be made and changed in the editor. Since then (Phase 6): the show grid, Export…, a light / dark theme, extra images and text elements placed freely on a slide, picture styles and opacity, other names for glossary terms, the dedicated glossary editor, and draft autosave with crash recovery (I-020). See [CHANGELOG.md](CHANGELOG.md) for what changed when.

## User manual

The full, step-by-step guide is **[help.html](help.html)**, built into the editor:

- click **? Help** in the toolbar,
- press `F1` (it opens at the section for the tab you are in), or
- open <http://localhost:8080/editor/help.html> while `npm run serve` runs.

It covers every part of the editor, with a Markdown reference, all keyboard shortcuts and troubleshooting. This README is only an overview.

## Quick start

1. Run `npm run serve` in the repository root.
2. Open <http://localhost:8080/editor/> in **Chrome** or **Edge**.
3. Choose **Open show folder…** for a show on your disk, **New show…** to start one from a template, or open the demo: <http://localhost:8080/editor/?show=../shows/demo/show.json>

## What you can do

| Area | In short | Manual |
|---|---|---|
| Show folders | Open, create from a template and save show folders anywhere on disk; recent shows; clean `show.json` diffs | [Open, create and save](help.html#files) |
| Slide list | Go to slide, add (in a chosen layout), duplicate, delete, reorder by dragging, hide from the audience | [The slide list](help.html#slides) |
| Show grid | All slides as thumbnails, grouped by chapter: select several, drag to move or regroup, duplicate, hide, delete; add, rename, move and delete chapters | [Show grid](help.html#grid) |
| Slide library | Copy slides into a library in your browser and insert them into other shows (another template, links, glossary and files handled); tags, collections, export / import as zip | [Slide library](help.html#library) |
| Slide tab | A form generated from the layout; a layout picker with live previews; text, Markdown, images, quotes, code, cards and diagrams (Mermaid); notes, chapter, tags, builds and transitions | [Slide tab](help.html#slide-tab) |
| Images | Choose, drop or paste; copied into `images/` once; alt text | [Images](help.html#images) |
| Extra images | Put more pictures on a slide, anywhere: move and resize them on the preview, let them appear one by one | [Extra images](help.html#extra-images) |
| Text elements | Put a badge, label or callout anywhere on a slide, with its own font, size, colors, fill and border (the template's first) | [Text elements](help.html#text-elements) |
| Graphs | Show a network of nodes and links, built up click by click: a mini graph to add and link nodes, a data file option, snapshot as fallback | [Graphs](help.html#graphs) |
| Maps | Show places on an interactive map, toured click by click: a mini map to click and drag places, layers, background, snapshot as fallback | [Maps](help.html#maps) |
| Picture styles | Shadow, soft edges, rounded corners or a frame from the template, and an opacity, on any picture | [Picture styles](help.html#picture-styles) |
| Reader tab | Summary and blocks (text, panels, callouts, tabs, images with hotspots, embeds, slide links, diagrams) per profile and depth; related slides | [Reader tab](help.html#reader-tab) |
| Diagrams | Flowcharts, sequence diagrams and architectures rendered client-side with Mermaid; theme-matched and searchable | [Diagrams (Mermaid)](help.html#diagrams) |
| Show settings | Metadata, presentation settings, chapters, profiles, glossary, reading routes | [Show settings](help.html#settings) |
| Glossary | Terms with definitions that readers open in a popup; insert them with the toolbar; deletes that keep the words | [Glossary](help.html#glossary) |
| Preview | Audience or reader view, as any profile at any depth, with the slide's errors and warnings | [Live preview](help.html#preview) |
| Find and replace | Across slides, notes, reader blocks and settings; one undo step | [Find and replace](help.html#find) |
| Present and Read | Save, then open the viewer at the selected slide | [Present and Read](help.html#present) |
| Export | One HTML file with show, template and viewer that presents offline (unsaved changes included) | [Export as one file](help.html#export) |

The editor has a **light and a dark theme**: choose ☀ Light, ☾ Dark or ◐ System (follows your computer) at the end of the toolbar; the choice is remembered in your browser. Everything can be undone (`Ctrl+Z`). The most used keys: `Ctrl+S` save, `Ctrl+F` find, `Ctrl+Enter` new slide, `F5` present, `F1` help. The full list is under [Keyboard shortcuts](help.html#shortcuts).

## Browser requirements

The editor runs in any modern browser using native ES modules, and opening a show by URL (`?show=…`) works everywhere. Opening, creating and saving show folders, adding images, and presenting shows from a folder use the File System Access API, so they need a Chromium-based browser: **Google Chrome** or **Microsoft Edge**.

## For developers

How the editor is built: [ARCHITECTURE.md](ARCHITECTURE.md). Rules, pitfalls and the smoke-test checklist for AI agents (and humans): [CLAUDE.md](CLAUDE.md). A user-visible change updates [help.html](help.html) and, if the overview above changes, this README.
