# Visual direction: B, "Carnet de route"

Chosen on 2026-11-16 (branch `feat/ui-redesign`) to replace direction A, "Gris neutre", which
the owner found too austere for a holiday album. The brief was a friendlier, more inviting
editor in the spirit of consumer photo-book apps. The tokens live in
`apps/desktop/src/renderer/theme/tokens.css`. Every editor task uses these tokens and adds no
colour, size or spacing of its own. If a task needs a value that is missing, add it here and in
`tokens.css` first. Direction A stays on record in `sketches/a-gris-neutre.html`.

## Idea

A travel notebook. The pages of the interface (top bar, rail, panel, inspector, strip) are
white and docked round a desk, a pale sky-mist ground with the dot grid of a notebook, on which
the album's page lies as paper. The ink is navy, not black. One hue marks what can be done: a
lagoon teal, taken from the passport of the app's own Bohème drawings. It fills the primary
action of a view (a pill) and tints the open tool and the selected choice (a soft lagoon chip
with deep lagoon text). The coral and sand of the same drawings are for decoration only, never
for text. The app signs in a hand (Caveat), the one playful note of the chrome; the empty home
screen lays four of the Bohème drawings round an open blank book.

## Type

Nunito (SIL OFL 1.1), bundled from `@fontsource/nunito`, latin subset (which covers French),
weights 400, 600, 700 and 800. Rounded terminals keep it friendly; it stays open at 11 px and
its figures are tabular by default, so values in fields do not jitter. Fallback: Noto Sans,
DejaVu Sans, system-ui. Line height 1.4. Sentence case for every label; no all-caps.

| Token     | Size    | Use                                         |
| --------- | ------- | ------------------------------------------- |
| `--t-xl`  | 16 px   | key values (the resolution in ppp), dialogs |
| `--t-lg`  | 15 px   | album titles, group titles of the dialogs   |
| `--t-md`  | 13.5 px | body text                                   |
| `--t-sm`  | 12.5 px | fields, buttons, tabs, empty states         |
| `--t-xs`  | 11.5 px | captions, counts, rail labels, strip labels |
| `--t-xxs` | 10.5 px | badges on photos, meter scales              |

Weights: 400 for text, 600 (`--w-medium`) for buttons and labels, 700 (`--w-semibold`) for
selected entries and the days of the photo tray, 800 (`--w-heavy`) for titles: panel,
inspector, dialog (`--t-title` 20 px) and overview titles, album titles on the home screen.
`--f-display` is the same face as `--f-ui`; titles differ by weight only.

The hand, Caveat 700 (`--f-hand`, OFL 1.1, `@fontsource/caveat`), sets the app name in the bars
(27 px, deep lagoon) and the home heading (46 px, ink), nothing else.

The book's own text on the page uses the book's fonts, never the UI face.

## Spacing and radii

4 px base: `--s1` 2, `--s2` 4, `--s3` 6, `--s4` 8, `--s5` 12, `--s6` 16, `--s7` 24, `--s8` 32 px.
Controls are 30 px high (`--control-h`); the photo panel's import button and the home actions
are 36 to 38 px.

Radii by rank: `--r1` 7 px for controls and tiles, `--r2` 10 px for cards, spread tiles and
floating panels, `--r3` 16 px for dialogs, `--pill` for the primary action, the rail chips, the
page labels under the canvas and the count chips. Paper, photos and covers stay square (photo
thumbnails 4 px).

## Colour roles

| Token                       | Role                                           | Light       | Dark           |
| --------------------------- | ---------------------------------------------- | ----------- | -------------- |
| `--ground`                  | the desk round the page, the home screen       | `#e6eef1`   | `#141d24`      |
| `--ground-dot`              | the dot grid on the desk                       | ink at 11 % | ink at 7 %     |
| `--chrome`                  | top bar, rail, panel, inspector, strip         | `#ffffff`   | `#1d2730`      |
| `--surface`                 | fields, cards, dialogs, floating panels        | `#ffffff`   | `#24303a`      |
| `--sunken`                  | tracks of segmented controls, hover fill, well | `#eff4f6`   | `#182129`      |
| `--line`                    | hairlines between regions                      | `#e1e8eb`   | `#2b3843`      |
| `--line-strong`             | borders of fields and buttons                  | `#cbd5da`   | `#3b4a56`      |
| `--ink`                     | primary text                                   | `#1e2b37`   | `#e8eef1`      |
| `--ink-2`                   | secondary text, idle icons, empty states       | `#4e5c68`   | `#a9b6bf`      |
| `--ink-3`                   | tertiary text: counts, units, placeholders     | `#7d8a95`   | `#7b8994`      |
| `--accent`                  | primary fill, focus ring, selected outline     | `#1f6f78`   | `#5fb7be`      |
| `--accent-hover`            | primary fill on hover                          | `#185a62`   | `#7cc7cd`      |
| `--accent-soft`             | the open tool, the selected choice             | `#e0f0f0`   | lagoon at 16 % |
| `--accent-ink`              | text and icons on `--accent-soft`, the brand   | `#155961`   | `#94d6db`      |
| `--on-accent`               | text on `--accent`                             | `#ffffff`   | `#0f1a20`      |
| `--coral`, `--sand`         | decoration only, never text                    | `#f2a488`…  | `#c9826a`…     |
| `--invert-bg`/`--invert-fg` | selected fill and text (= soft and ink lagoon) | aliases     | aliases        |
| `--halo`                    | soft ring round a focused field                | lagoon 16 % | lagoon 22 %    |
| `--good`, `--fair`, `--low` | the three resolution states                    | `#2f7d4f`…  | `#6fb283`…     |
| `--paper`                   | blank paper of a page                          | `#ffffff`   | `#ffffff`      |
| `--sel-inner`/`--sel-outer` | selection outline on the canvas                | white/black | same           |
| `--badge-*`                 | chips over a photo (resolution badge)          | navy 80 %   | same           |

`--ink-3` is for short secondary text only (a count next to a title, a unit after a number).
Sentences such as empty states use `--ink-2`. White on `--accent` is 5.8:1; `--accent-ink` on
`--accent-soft` is 6.8:1.

Elevation is tinted with the ink: `--shadow-1` lifts buttons and chips, `--shadow-2` floats
menus and notices over the canvas, `--shadow-3` carries dialogs, `--shadow-paper` puts the
page, the preview and the album covers on the desk as paper.

Themes: light is the base on `:root`, dark is `:root[data-theme='dark']`. `data-theme` is always
set on `<html>` before the first render (`theme/theme.ts`). The user's choice is kept in renderer
`localStorage`; without one, the theme follows `prefers-color-scheme`, live.

## States

- **Hover:** a `--sunken` fill (icon buttons, tiles) or a lagoon border and text (buttons); the
  icon or text goes from `--ink-2` to `--accent-ink`.
- **Press:** buttons and icon buttons move down 1 px.
- **Primary:** one per view, a `--accent` pill with `--on-accent` text and a soft lagoon glow
  (Exporter, Importer des photos, Nouveau livre, the confirm button of a dialog).
- **Open tool / selected choice:** `--accent-soft` fill, `--accent-ink` text, weight 700 (the
  chip of the open rail entry, a selected format, a pressed toggle, the current spread tile).
- **Segmented control, grid of tabs:** a `--sunken` track, 3 px padding; the pressed entry is a
  white chip lifted out of it, `--accent-ink` text.
- **Selected tab:** `--accent-ink` text, weight 700, a 2 px `--accent` underline.
- **Selected thumbnail:** a 2 px `--accent` outline, 1 px offset. A photo used in the book
  carries a lagoon count chip.
- **Disabled:** 40 to 45 % opacity, default cursor.
- **Focus:** `:focus-visible` draws a 2 px `--accent` outline, 2 px offset; a focused field also
  gets a 4 px `--halo`.

## Canvas

- The canvas region is the desk: `--ground` with a dot grid of `--ground-dot` every 20 px; the
  page is `--paper` with `--shadow-paper`, as a printed sheet lying on the desk. The ground is a
  pale, low-chroma sky (light) or night blue (dark), quiet enough not to shift how a photo reads.
- **Selection:** a white-and-black double outline that reads on any photo, light or dark:
  `outline: 1px solid var(--sel-inner); box-shadow: 0 0 0 2px var(--sel-outer)`. Handles are
  8 × 8 px squares, `--sel-inner` fill with a 1 px `--sel-outer` border, centred on the corners
  and edge midpoints. The rotation handle is a 10 px circle in the same colours, 22 px above
  the top edge, joined to it by a 1 px `--sel-outer` line.
- **Guides** (bleed, safe margin, gutter) are drawn in white at 70 to 80 % opacity with
  `mix-blend-mode: difference`, so they show on any photo without a hue: bleed dashed, safe
  margin dotted, gutter solid, all 1 px.
- **Resolution badge** on a photo: 18 px high, 2 px radius, `rgba(20,20,20,.82)` fill,
  `#f2f2f2` text at `--t-xxs` weight 500, with a 7 px dot in `--good`, `--fair` or `--low`.
  It sits over the photo, so it keeps the same colours in both themes.

## Rulers and guides

- Two 24 px rulers (`--ruler`) along the top and the left of the canvas, with a `mm` corner. They
  are drawn on a canvas in the tokens: `--sunken` outside the pages, the pages in `--chrome`
  with their safe margins tinted (as a word processor shows its margins), `--ink-3` ticks and
  `--ink-2` numbers in Nunito 600 at 9.5 px, a number every 10 to 500 mm depending on the zoom.
  The left ruler's numbers are turned a quarter left.
- The selection is a `--accent-soft` band ended by two `--accent` lines. The pointer is an
  `--accent` line with a pill giving its position ("123,5 mm") in `--on-accent`.
- Ruler guides are 1 px `--accent` lines with a half-pixel white edge, so they read on any
  photo, in a 7 px band to grab; a guide being laid or leaving is at 55 % opacity. A guide shows
  on its ruler as a small `--accent` wedge.

## Icons

Tabler Icons (MIT), outline style, from `@iconify-json/tabler`. The SVG bodies the UI uses are
copied at build time into `renderer/theme/icons.ts` by `apps/desktop/scripts/generate-icons.ts`
(add a name there, run `npm run icons -w @travelbook/desktop`); a unit test fails while the file
is out of date. The `Icon` component draws them inline in `currentColor`, 18 px (`--icon`),
15 px (`--icon-sm`) inside small toolbars and buttons, and redraws Tabler's stroke 2 at 1.6
(`--icon-stroke`). Icons are decorative: the button carries the French accessible name.

Current choices: Photos `photo`, Modèles `layout`, Stickers `sticker`, Fonds `background`,
Texte `letter-t`, Formes `triangle-square-circle`, Annuler `arrow-back-up`, Rétablir
`arrow-forward-up`, theme `moon` / `sun`, Recadrer `crop`, Retourner `flip-horizontal` /
`flip-vertical`, Retirer du cadre `photo-off`, Importer des photos `photo-plus`, Exporter
`file-export`.

## Motion

- 120 ms (`--fast`) for hover and press feedback, 180 ms (`--swap`) for swaps, tab underlines,
  album covers and dialogs, all on `--ease` (a short ease-out).
- Motion only answers the user: a dialog settles in once when it opens (6 px, 98.5 % to 100 %);
  an album cover lifts 3 px on hover; a photo thumbnail zooms 3 % inside its frame. Nothing
  moves by itself.
- `prefers-reduced-motion: reduce` sets both durations to 0 ms and drops the dialog animation.

## Layout (spec §8)

```
+------------------------------------------------------------------------------+
| top bar 52 px: travelbook | title            undo redo | ... | theme          |
+------+-----------+-------------------------------------------+---------------+
| rail | panel     | canvas (the desk: --ground, dot grid)     | inspector     |
| 72px | 200-440px |                                           | 220-400 px    |
|      | (272)     |                                           | (264)         |
+------+-----------+-------------------------------------------+---------------+
| spreads strip 104 px                                                         |
+------------------------------------------------------------------------------+
```

Regions are separated by 1 px `--line` hairlines, not gaps or shadows (shadows are for what
floats: menus, notices, dialogs, paper). The panel and the
inspector have a drag handle on their inner edge (a 7 px hit zone over the hairline that turns
into a 2 px `--accent` line on hover, drag or focus; arrow keys move it by 8 px, Shift by 32 px,
Home and End go to the bounds). Their widths are kept in renderer `localStorage` and clamped to
the bounds above.

Accessible names (`strings/fr.ts`): top bar "Barre du haut" (banner), rail "Outils"
(navigation), panel "Panneau <nom>" (region), canvas "Plan de travail" (main), inspector
"Inspecteur" (complementary), strip "Doubles pages" (navigation).

## Trade-off to watch

The ground is no longer the ISO 3664 grey: it is a pale, low-chroma sky, and the dark ground a
night blue. Both are far enough from saturated colour not to shift how a photo reads, but the
Aperçu (preview) remains the place to judge colour. Keep the lagoon to one primary action per
view and to the selected item of each group, so it keeps meaning "this one".
