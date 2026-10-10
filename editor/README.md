# Slipr Editor

The **Slipr Editor** is a browser application for creating and editing Slipr shows. You never have to touch JSON by hand: you pick layouts, fill in content fields, add images, configure the interactive reader layer, and see the result immediately in a live preview rendered exactly as the viewer displays it.

> **Status:** Phase 5 (Editor MVP) in progress. Done: the 3-pane shell, store, undo/redo, slide and reader inspectors, live preview and keyboard shortcuts (E-001); opening, saving and creating show folders (E-002); Present and Read for shows anywhere on disk (E-007); images and hotspots (E-006); global find & replace (I-025); and the fixes E-010 to E-013. Also done: editors for cards, quotes and code (I-035). Not yet: a layout picker with previews (E-004), editors for tabs, embed and slide-ref blocks (I-036), and draft autosave (I-020).
>
> **Quick Start:** Run `npm run serve` in the repository root, then open <http://localhost:8080/editor/>. Choose **Open show folder…** for a show on your disk, **New show…** to start one from a template, or open the demo by URL: <http://localhost:8080/editor/?show=../shows/demo/show.json>

---

## Screen Layout

The editor uses a responsive 3-column layout:

```
┌──────────────┬──────────────────────────┬──────────────────────────────┐
│ Slides       │ Slide                    │ Preview                      │
│ [Go to slide]│ Layout: [Title+bullets▾] │                              │
│ 1 ▣ Title    │ [Slide] [Reader]         │ (Audience | Reader▾ as Dev ▾)│
│ 2 ▣ Why      │ Title  [____________]    │   ┌──────────────────────┐   │
│ 3 ▣ Demo     │ Body   [- item       ]   │   │  rendered slide      │   │
│ + Add slide  │        [- item       ]   │   └──────────────────────┘   │
│              │ Notes  [____________]    │   ⚠ 1 warning                │
│ ⚙ Show       │                          │                              │
└──────────────┴──────────────────────────┴──────────────────────────────┘
 [Open] [New] [Save]                              [Present ▶] [Read 📖]
```

1. **Left pane: Slides** — ordered list of all slides in the show, with a "Go to slide" box.
2. **Center pane: Inspector** — tabs to edit the slide visual, interactive reader layer, and show settings.
3. **Right pane: Live Preview** — instant rendering in Audience or Reader mode with profile/depth simulation.
4. **Top toolbar** — show title, unsaved changes indicator, undo/redo, file operations, and launch buttons. In a narrow window it wraps onto two lines.

Notices (for example "Saved", or that a template was found by name) appear in a bar under the toolbar.

---

## User Guide

### 1. Opening, Creating and Saving Shows

A show is a folder with `show.json` and an `images/` folder. It can live anywhere on your disk; it does not need to be inside the Slipr folder.

* **Start screen:** Opening the editor without a show shows **Open show folder…**, **New show…**, your **recent shows**, and a link to the demo.
* **Open a show folder:** Click **Open…** (or **Open show folder…**) and pick the folder that contains `show.json`. The editor reopens as `editor/?folder=<key>`, a link that works in this browser: bookmark it or reload it freely. After a browser restart, the browser may ask once more: click **Allow access**.
* **New show:** Click **New…**, enter a title, choose a template (from `templates/index.json`), then pick an **empty** folder. The editor writes `show.json` (with one title slide) and an empty `images/` folder. New shows refer to their template as `/templates/<name>`.
* **Templates for shows outside the Slipr folder:** If a show's template reference points outside its folder (as in `../../templates/default`), the template with that name from Slipr's `templates/` folder is used, and a notice says so.
* **Save:** Press **Ctrl+S** or click **Save**. The editor writes `show.json` with 2-space indentation and a fixed key order (the same as the PowerPoint converter), so changes show up as small diffs in git. A hand-formatted `show.json` is reformatted once, on its first save.
* **Shows opened by URL** (`?show=…`, like the demo): the first Save asks you to choose the show's folder on disk, and checks that it holds the same show.
* **Unsaved changes:** a yellow dot (`●`) appears next to the show title, and the browser warns before you close the tab.

### 2. Managing Slides (Left Pane)

* **Select a slide:** Click any slide in the list to open it in the inspector and preview. The list scrolls, and keeps its place while you edit.
* **Go to slide:** Type in the box above the list: a slide number (`12`), words from the title (`ai act`), a layout name or a chapter. Press `Enter` to jump to the first match, `Esc` to clear the box.
* **Move through slides with the keyboard:** In the list, `↑` / `↓` move one slide, `PageUp` / `PageDown` five, `Home` / `End` to the first or last slide. Outside text fields, `PageUp` / `PageDown` go to the previous or next slide.
* **Add a slide:** Click the **+ Add** button at the top of the sidebar (or press `Ctrl+Enter`). The new slide is inserted immediately after the currently selected slide. It gets the same layout as the current slide; after a title or section slide it gets the template's plain content layout (`bullets` in the default template, `text` in the Conclusion template).
* **Reorder slides:** Click the **▲** (move up) or **▼** (move down) buttons on a slide (or press `Alt+↑` / `Alt+↓`).
* **Duplicate a slide:** Click the **⎘** button (or press `Ctrl+D`). The slide and all its reader blocks are duplicated with fresh unique IDs and inserted after the original.
* **Delete a slide:** Click the **🗑** button. Deleting a slide automatically removes its ID from any curated paths (`paths`) and related slide lists (`related`) so references stay valid.
* **Open Show Settings:** Click the **⚙ Show** button in the sidebar header to configure show-level settings.

### 3. Editing the Slide (Center Pane: "Slide" Tab)

* **Choose a layout:** Select a layout from the **Layout** dropdown (e.g. `title`, `bullets`, `section`, `two-column`, `image-full`). The fields of the new layout appear at once.
  * *Smart slot retention:* When you switch layouts, fields with matching names are preserved. Content for slots not in the new layout is safely preserved in the background (`_orphaned`), so switching back restores your text.
* **Fill in slots:** The form automatically generates fields based on the selected layout's slot definitions:
  * **Text & headings:** Single-line inputs for titles, subtitles, or captions.
  * **Rich text & lists:** Multiline text areas supporting Markdown formatting (`**bold**`, `*italic*`, `` `code` ``) and bullet lists (`- item`).
  * **Images:** A preview, the image path and its alt text. See *Adding images* below.
  * **Quote:** The quote text and its source.
  * **Code:** The language (e.g. `js`) and the code. `Tab` indents; press `Esc`, then `Tab`, to leave the field.
  * **Cards** (layouts with repeated items, such as the Conclusion template's columns, numbered boxes, facts, image cards and people): one group of fields per card. A counter (`7 / 18`) shows how much room a field has and turns yellow when the text is too long. Move cards with **▲** / **▼**, remove one with **🗑**, and add one with **+ Add card**, up to the number the layout has room for. Image fields in cards work like any image field.
* **Speaker notes:** Add private presenter notes in the **Speaker Notes** box. These appear in Reveal's presenter view (`S` key in audience mode).
* **Chapter:** Assign the slide to a chapter to drive the agenda slide in audience mode and the table of contents in reader mode.
* **Audience visibility:** Check **Hide from audience mode** to make a slide reader-only (useful for backup slides or in-depth reference material).

#### Adding images

Image fields (on slides and in reader image blocks) accept an image in three ways:

* **Choose…** opens a file chooser.
* **Drop** an image file onto the field.
* **Paste** from the clipboard: press `Ctrl+V` while the image field has focus, or click **Paste**. `Ctrl+V` anywhere outside a text field also works: the image goes into the slide's first empty image field.

The image is copied into the show's `images/` folder (as `images/<name>-<hash>.<ext>`; a pasted image is named after the slide). If the same image is already in the folder, it is reused instead of copied again. Then a dialog asks for **alt text**, a short description for people who cannot see the image; you can also fill it in later. PNG, JPEG, GIF, WebP, AVIF and SVG are supported; images over 3 MB get a notice. Undo restores the previous image; image files are never deleted automatically.

Adding images needs the show's folder: a show opened by URL asks for its folder first.

### 4. Creating the Reader Layer (Center Pane: "Reader" Tab)

The Reader tab holds the detailed content for individuals reading the show interactively:

* **Reader Summary:** A concise one-sentence overview displayed at the top of the reader page for this slide.
* **Reader Blocks:**
  * Click **+ Add Block** to append an interactive block, then choose its type. Changing the type converts the block and keeps its text where the new type has room for it.
  * Block types:
    * **Text:** Markdown article content with popovers (`^[inline popup]`), glossary links (`[[term]]`), and `#slide` references.
    * **Collapsible Panel (Details):** Expandable section with a title and Markdown content.
    * **Callout Box:** Highlighted callout with a kind (**Info**, **Tip**, **Warning**, **Quote**), an optional title and Markdown content.
    * **Image with Hotspots:** An image (added like any image field), alt text, an optional caption, and hotspots. See below.
    * **Tabs**, **Embedded Page** and **Link to Slide:** Shown read-only for now, with a summary. Edit them in `show.json`.
* **Hotspots** (on an image block, once it has an image):
  * **Place:** click on the image. A numbered marker appears there and its title field gets focus, so you can type the title right away. Below it, write the popup text in Markdown.
  * **Move:** drag a marker. With a marker selected, the arrow keys nudge it (Shift: bigger steps).
  * **Remove:** press `Delete` on a selected marker, or click its **🗑**.
  * **Keyboard only:** **+ Add hotspot** places one in the middle of the image.
* **Target Audience & Depth per Block:**
  * **Detail Level:** Choose **Essential (1)**, **Standard (2)**, or **Deep dive (3)**. Readers select their preferred depth, and blocks adjust automatically.
  * **For:** Click **For: everyone** to choose which reader profiles see the block (one checkbox per profile defined in Show Settings). With none checked, every reader sees it.
  * Reorder blocks using **▲** / **▼**, or remove a block with **🗑**.
* **Writing reader text:** Above every Markdown field, a small toolbar inserts a **glossary term** (`[[term]]`; with words selected, `[[term|those words]]`), a **popup** (`^[…]` around the selected text, or an empty one to type into) and a **link to another slide** (`[text](#slide-id)`).
* **Related slides:** Under the blocks, add slides to offer readers as "see also"; reorder them with **▲** or remove them with **✕**.
* **Show the slide:** Uncheck **Show the slide above its reader blocks** for a reader-only text page.
* **Reader visibility:** Check **Hide this slide completely from reader mode** if a slide only makes sense during a live speech.

### 5. Show Settings (Center Pane: "Show Settings" Tab)

Click **⚙ Show** to access show-level configurations:

* **Metadata:** Edit show title, subtitle, author, and date.
* **Audience settings:** Choose aspect ratio (**16:9** widescreen or **4:3**) and slide transitions (**fade**, **slide**, or **none**).
* **Chapters:** Add, rename, or delete chapters that organize the presentation.

### 6. Live Preview (Right Pane)

The preview pane updates instantly as you type (debounced at 150 ms):

* **Audience Mode:** Shows the slide scaled responsively using CSS container queries (`cqw`), identical to how it renders on the big screen.
* **Reader Mode:** Shows the slide visual plus its tailored reader layer (summary and interactive blocks, including hotspots).
* **Profile & Depth Simulation:** When previewing Reader mode, use the toolbar dropdowns to simulate what different profiles (e.g. *Developer*, *Manager*) and detail depths (1, 2, or 3) will see.
* **Validation Diagnostics:** Problems with the current slide appear under the preview: errors in red (the show cannot be shown until they are fixed, for example an image block without an image), warnings in yellow (for example missing required slots, text too long for the layout, missing alt text).

### 7. History and Launching

* **Undo / Redo:** Use **↶ Undo** (`Ctrl+Z`) and **↷ Redo** (`Ctrl+Y` or `Ctrl+Shift+Z`). Typing bursts within a 1-second pause are coalesced into a single undo step; so is dragging a hotspot.
* **Present ▶ (F5):** Saves your changes, then opens audience mode in a new browser tab, starting at the selected slide.
* **Read 📖:** Saves your changes, then opens reader mode in a new browser tab at the selected slide.
* Both work for shows anywhere on disk: the viewer opens the same folder (`viewer/?folder=<key>`). A show opened by URL with unsaved changes first asks for its folder.

### 8. Find and Replace

Press **Ctrl+F** or **Ctrl+H** (or click **🔍 Find & Replace** in the toolbar) to open the Find & Replace modal dialog:
* **Search across the whole show:** Matches are searched across audience slide slot values (text and cards), speaker notes, reader summaries and blocks (text, details, callouts, image captions and hotspot text), and show settings (metadata, chapters, glossary).
* **Search options:** Toggle **Match case** (case-sensitive) and **Whole word**.
* **Preview & navigation:** A live list shows matching snippets with `<mark>` highlights and location badges. Clicking any match closes the dialog and immediately navigates to that slide.
* **Replace:** Click **Replace in Current Slide** to replace occurrences on the currently selected slide, or **Replace All** to replace occurrences throughout the entire show. All replacements are pure, immutable, and fully undoable with `Ctrl+Z`.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` / `Cmd+S` | Save show |
| `Ctrl+Z` / `Cmd+Z` | Undo last change |
| `Ctrl+Y` / `Cmd+Y` or `Ctrl+Shift+Z` | Redo last undone change |
| `Ctrl+F` / `Cmd+F` or `Ctrl+H` / `Cmd+H` | Open Find & Replace dialog |
| `Ctrl+Enter` | Add a new slide after the current one |
| `Ctrl+D` | Duplicate current slide |
| `Alt+↑` | Move current slide up |
| `Alt+↓` | Move current slide down |
| `PageUp` / `PageDown` | Previous / next slide (outside text fields) |
| `↑` `↓` `PageUp` `PageDown` `Home` `End` | Move through the slide list (when it has focus) |
| `Enter` / `Esc` in "Go to slide" | Jump to the first match / clear the box |
| `Ctrl+V` | Paste an image into the focused image field, or (outside text fields) into the slide's first empty image field |
| Arrow keys / `Shift`+arrows, `Delete` | Nudge / remove the selected hotspot marker |
| `F5` | Save, then launch the audience presentation from the current slide |

---

## Browser Requirements

The editor runs in any modern browser using native ES modules, and opening a show by URL (`?show=…`) works everywhere. Opening, creating and saving show folders, adding images, and presenting shows from a folder use the File System Access API, so they need a Chromium-based browser: **Google Chrome** or **Microsoft Edge**.
