# I-091: Morph transition for images between slides

Status: **done** · 2026-10-13 · Phase 6 · Builds on I-090 (cropping) and Reveal.js auto-animate. Verified in Claude's browser pane: going from "AI help, kept in its cage" to its new detail slide, Reveal's generated stylesheet animates the photo's crop (`inset(6% 12% 18%)` → `inset(22% 36% 38%)`, 0.7 s) without a scale transform; the editor's Morph name field (cleaned, stored, undone). The pane runs no animation frames, so the motion itself, Safari / Firefox and reduced motion are for Lucas to watch

## Goal

Like PowerPoint's Morph: when the same picture is on two consecutive slides, it moves and changes smoothly from one to the next. Its position and size, its crop (I-090), its focus and its opacity. Zoom into a detail of a photo, move a picture from full screen to a corner next to the bullets, bring it back.

## Spike: what Reveal.js 6 auto-animate already does

- Slides with `data-auto-animate` (Slipr: `audience.autoAnimate` on both slides) pair elements with the same `data-id` (Slipr gives every slot one: `slot-<name>`), then headings and list items with the same text, then **images with the same `src`**. So the same picture is already matched, also between an image slot and an extra image.
- A pair is animated FLIP-style: the new element starts at the old one's place with `transform: translate() scale()` and transitions to its own. A non-uniform scale distorts a photo halfway when its frame changes shape.
- Besides the transform, only a fixed list of styles is animated (`opacity`, `color`, `padding`, `border-radius`, …): not `object-view-box` (the crop) or `object-position` (the focus), which jump.
- The `autoAnimateMatcher` setting replaces the pairing, and a pair may carry options: `scale: false`, its own `styles` (also `{ property, from, to }`), and a `measure` function. Reveal already uses this for code blocks (animating `width` / `height` instead of scaling).

So Slipr keeps Reveal's auto-animate and gives image pairs better options.

## Decisions (Lucas, 2026-10-13)

1. **Matching**: automatic for the **same picture file** on both slides (slot or extra image), plus an optional **`morphId`** on a picture to pair two different files (a detail shot) or to say which of two copies morphs. Only between slides that both have auto-animate on, as today.
2. **Editor**: a **Morph name** field under every picture, next to Crop…; the auto-animate switch stays in the slide's audience options.

## Format (show format 0.2)

An optional field of every image value:

```json
"image": { "src": "images/robot.jpg", "alt": "…", "crop": { "x": 0.35, "y": 0.2, "w": 0.3, "h": 0.3 }, "morphId": "robot" }
```

| Field | Meaning |
|---|---|
| `morphId` | A name (letters, digits, `-`, `_`; up to 60) that pairs this picture with the picture of the same name on the next or previous slide, whatever their files. Without it, pictures pair by file |

Validation: `morphId` in a 0.1 show is an error; the same `morphId` twice on one slide is a warning (only one of them can morph).

## Viewer (`viewer/audience/morph.js`)

- `picture.js` writes `data-morph-id` on the `<img>`.
- **Pairing** (`imagePairs()`, DOM-free and tested): first by `morphId`, then by the original file (`data-crop-src` or `src`, so a picture cropped by the canvas fallback still pairs), then by slot (`data-id`, as before). Each picture is used once. Reveal's own pairs for everything else (text, slots that are not pictures) are kept.
- **Animating** an image pair: no scale (no distortion); instead `width` and `height` animate, together with the position (measured on screen, so a picture can move between a slot and an extra image), `opacity`, `object-position`, `border-radius` and the crop (`object-view-box`, from the whole picture `inset(0%)` when one side has no crop). Duration and easing are the show's auto-animate ones (0.7 s).
- Browsers without `object-view-box` (Safari, Firefox): the picture moves and resizes; the crop changes at the end (it is a bitmap there).
- **Reduced motion** (`prefers-reduced-motion: reduce`): auto-animate is off, slides change as usual.
- Reader mode and the editor preview have no transitions.

## Editor

- **Morph name** under every picture (image slot, card image, reader image, extra image; next to Crop…), cleaned to the allowed characters as you type; empty removes it. The help text says that the next slide needs the same picture or name and auto-animate on both slides.

## Demo

"AI help, kept in its cage" and the new slide after it, "Up close" (`s-ai-detail`), have auto-animate on: the photo zooms from its crop into the robot.

## Out of scope

- Morphing text elements (I-089) and other slots by content (Reveal already matches equal headings and list items).
- Morphing picture styles (a shadow appears at the end), and cross-fading two different files (the new one moves in, the old one fades out, as Reveal does).
