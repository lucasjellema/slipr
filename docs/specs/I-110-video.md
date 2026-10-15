# I-110: Video

Status: **done** 2026-10-15 · Builds on I-070 · Decision: D-011 (refined)

## Lucas's decisions (2026-10-15)

1. **Sources**: a video file in the show folder (MP4, WebM), YouTube and Vimeo links (any form, turned into their privacy-friendly embed address), and a direct `https:` link to a video file. Other video sites keep using the Embedded Page block.
2. **Single-file export**: local videos up to **25 MB** go inside the HTML file. Larger ones are left out with a warning; the export then shows the poster (or a card) with a note that the video is missing.
3. **Existing `embed` blocks** with a YouTube or Vimeo address keep working as they are (no migration). The editor shows a hint offering *Turn into a video block*.
4. **Chapters and a transcript are part of I-110**: a chapter list (time + title) that seeks the video, and a Markdown transcript, both in reader search; chapters can also be audience steps.

## The value

One shape for the `video` slot type and the `video` reader block (block: plus `id`, `type`, `for`, `depth`). The file is in a **`video`** key, not `src`, so a video value is never taken for an image value (the same reason as `pdf`, I-072).

| Field | |
|---|---|
| `video`, `title` | Required. A path relative to `show.json` (`media/clip.mp4`), a YouTube or Vimeo link, or an `https:` link to a video file. `title` names the video for screen readers, cards and search |
| `start`, `end` | Seconds (numbers ≥ 0). Play from `start`, stop at `end`. A YouTube link's own `t=` is used when `start` is not set. Vimeo has no end time (it plays on) |
| `muted`, `loop` | Booleans, default false |
| `controls` | Boolean, default true. Without controls the reader can still play or pause with a click, Space or Enter on the video |
| `captions` | `{ "src": "media/clip.en.vtt", "label"?: "English", "lang"?: "en" }`: a WebVTT file in the show folder, shown by default. For video files only (YouTube and Vimeo bring their own) |
| `chapters` | `[{ "time": 0, "title": "Introduction" }, …]`, times in seconds. Reader blocks list them (a click seeks); reader slots get a chapter menu; search finds them |
| `transcript` | Markdown. Reader blocks show it in a *Transcript* panel; reader slots behind a *Transcript* button; search finds it |
| `play` | Audience mode (slots): `"click"` (default: the presenter presses play), `"slide"` (plays when the slide appears) or `"step"` (plays on the next click, a Reveal fragment) |
| `chapterSteps` | Audience mode (slots): `true` makes every further chapter a step, so each click jumps to the next chapter (after the play step, when `play` is `"step"`) |
| `present` | Audience mode: `"live"` (default) or `"static"` (the poster or card only; never contacts another server), as for web pages (I-071) |
| `load` | Reader mode, a video on another server (YouTube, Vimeo, an https file): `"click"` (default, click-to-load naming the site) or `"auto"` (D-011) |
| `fallback` | Image value: the **poster** (shown before playing, in print, thumbnails, static presenting, and while a YouTube / Vimeo video waits for **Load**) |

## Behaviour

- **Video files** play in the browser's own `<video>` element (`preload="metadata"`, `playsinline`), with captions as a `<track>`. Files in the show folder need no network, so they fit the offline rule; shows opened from a folder or zip and single-file exports get `blob:` addresses like images.
- **YouTube**: `https://www.youtube-nocookie.com/embed/<id>` with `rel=0`, `enablejsapi=1`, start / end, `mute`, `loop` (`playlist=<id>`), `controls=0`. **Vimeo**: `https://player.vimeo.com/video/<id>` with `dnt=1`, the unlisted hash `h=` when the link has one, `muted`, `loop`, `controls=0` and `#t=<start>s`. The frame has `allow="autoplay; encrypted-media; fullscreen; picture-in-picture"` and a sandbox with `allow-scripts allow-same-origin allow-presentation allow-popups` (both players need their own origin; they are on another server, so this cannot reach Slipr's storage). Referrer policy `strict-origin-when-cross-origin`: YouTube refuses embeds without a referrer.
- **Playing, pausing and seeking** use the native element, or the players' `postMessage` commands (YouTube's `playVideo` / `pauseVideo` / `seekTo`, Vimeo's `play` / `pause` / `setCurrentTime`), so no player library is loaded (D-001).
- **Audience mode**: a video pauses when its slide is left; `play: "slide"` starts when the slide appears (muted when the browser refuses sound). With `play: "step"` the slide carries a hidden fragment that starts the video; with `chapterSteps` one fragment per further chapter. Going back undoes the step (pause, previous chapter).
- **Reader mode**: click-to-load for other servers, local videos straight away. Blocks show the title, the video at the column width (16:9 for YouTube / Vimeo, the file's own ratio otherwise), the chapter list (buttons with time and title, the current chapter marked for video files) and the collapsible transcript. Slots get a compact bar below the video with a chapter menu and a *Transcript* button (a dialog).
- **Reader search** finds the video title, chapter titles and the transcript. A chapter result opens the video at that time.
- **Static content** (print, thumbnails, `present: "static"`, failures): the poster, or a card with the title, the source (*YouTube*, *Vimeo*, the host, or *File in this show*) and *Watch ↗*.
- **Export**: local video files, captions and the poster go into the single-file export; a video file over 25 MB is left out with a warning, and the export plays nothing for it (poster or card).

## Validation

- Errors: a `video` slot or block in a 0.1 show; an unsafe address (`javascript:`, `data:`, `vbscript:`); `captions` not a `.vtt` file in the show folder; a chapter without a numeric `time` or a `title`.
- Warnings: a video file or captions file not found (local, with a file check); an `https:` address that is neither YouTube nor Vimeo nor a video file (`.mp4`, `.webm`, `.ogv`, `.mov`, `.m4v`): use the Embedded Page block; `end` before `start`; chapters out of order; `captions` on a YouTube or Vimeo video (ignored); `present: "static"` without a fallback image; `chapterSteps` without chapters.

## Templates

A `video` layout in each template (default and forest 1.7.0 → 1.8.0 / 0.1.0 → 0.1.1, Conclusion 0.1.8 → 0.1.9): title, video and caption, modelled on the `pdf` layout. Existing slides look unchanged.

## Editor

- A **Video** field editor for `video` slots and a **Video** reader block, sharing `ui/video-fields.js`: *Choose video…* (copies the file to `media/`) or an address, with the recognised source shown (*YouTube video abc123*, *Vimeo video*, *video file*); title; start / end (accepting `1:23` or seconds); play (audience), muted, loop, controls; chapters (time + title rows, add / remove); transcript (Markdown); captions file; live / poster; click-to-load; poster (fallback) image.
- An Embedded Page block with a YouTube or Vimeo address shows *Turn into a video block*.
- Picking a video raises a 0.1 show to 0.2, like the other embeds.

## Out of scope

Converting PowerPoint videos (converter), other video sites as `video` (they stay Embedded Page blocks), picture-in-picture controls, chapter highlighting for YouTube / Vimeo (their players report progress only through their script APIs).

## Notes

- Demo clip: `shows/demo/media/slipr-clip.webm` (9 s, 160 KB) was drawn on a canvas and recorded with MediaRecorder; such files have no duration in their header, so it was added (Segment › Info › Duration) to make seeking work. Its captions are `slipr-clip.en.vtt`, its poster `slipr-clip-poster.png`.
- YouTube and Vimeo commands sent before the player is ready are queued and sent shortly after the frame's `load`; the players accept them without a handshake.
- Chapter highlighting works for video files only (YouTube and Vimeo report progress only to their script APIs).

## Not verified here

Claude's browser pane blocks sub-frames, so the YouTube and Vimeo players themselves (playing, `postMessage` seeking and pausing, the referrer rule) were not seen; their addresses, sandbox, `allow` and referrer policy were checked. Reveal navigation and real focus cannot be driven in the pane: steps were checked by toggling the fragments' `visible` class and the slide's `present` class, and typing in the editor with a stubbed `document.activeElement`. *Choose video…* (copying into a folder) was not tried; it follows *Choose PDF…*.
