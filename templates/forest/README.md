# Slipr Forest

A forest atmosphere for Slipr shows: deep forest greens on warm parchment, ochre accents, a moonlit pine forest on the title slide and a tree line along the bottom of section slides, and classic serif type.

Based on **Slipr Default 1.7.0**: the same 12 layouts and slots, the same picture styles, so a show can switch between `default` and `forest` without changes (`"template": { "ref": "/templates/forest" }`, or `../../templates/forest` inside this repository).

## Style guide

| Token | Colour | Use |
|---|---|---|
| `--slipr-color-primary` | `#1E3A2A` forest green | title slide, headings, links, table header |
| `--slipr-color-accent` | `#8C6A1C` ochre | kickers, bullets, rules |
| `--slipr-color-text` | `#24261F` bark | body text |
| `--slipr-color-muted` | `#575C4C` moss grey | captions |
| `--slipr-color-bg` | `#F7F4EA` parchment | slide background |
| `--slipr-color-surface` | `#E9EDE0` lichen | panels, section slides |

Graph colours: forest, bark, fern, ochre, mist blue, autumn rust. Every colour pair the template editor checks passes WCAG AA.

**Fonts**: headings in Palatino (`"Palatino Linotype", "Book Antiqua", Palatino, "URW Palladio L", P052, Georgia, serif`), body text in Georgia (`Georgia, "Iowan Old Style", "Times New Roman", Times, serif`). They are installed on Windows, macOS and most Linux systems (URW Palladio / P052 there), so the template has no font files and presents offline.

## Assets

- `assets/illustrations/forest.svg`: pine layers and a low moon, on the right of the title slide.
- `assets/illustrations/ridge.svg`: a tree line along the bottom of section slides (set in `theme.css`).
- `assets/logos/logo.svg`: the Slipr logo in the forest colours.

The illustrations were drawn for this template (generated pine shapes, no external artwork).

## Changing it

Open <http://localhost:8080/template-editor/>, *Open a template folder…* on `templates/forest`, or start a copy from it.
