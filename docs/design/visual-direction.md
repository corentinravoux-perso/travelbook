# Visual direction: A, "Gris neutre"

Chosen by Corentin on 2026-11-15 from three sketches (`sketches/`, see their README). This file
turns sketch A (`sketches/a-gris-neutre.html`) into rules. The tokens live in
`apps/desktop/src/renderer/theme/tokens.css`; the values below are the same and are copied from
the sketch unchanged. Every editor task uses these tokens and adds no colour, size or spacing of
its own. If a task needs a value that is missing, add it here and in `tokens.css` first.

## Idea

The workspace is a booth for judging colour. The page sits on a neutral mid-grey surround, as
in ISO 3664 viewing conditions, and the chrome has no hue at all. A photo is never seen next to
a coloured button that shifts how its colours read. Active states invert contrast instead of
taking an accent colour. The only colours in the interface are the three resolution states.
Panels are docked and separated by hairlines, which leaves the most room for the page.

Refinement (2026-11-15, branch `ui-refresh`): the idea is unchanged, still no hue in the chrome.
What changed is finish. A book face carries the titles. The page and the album covers sit as
paper with a soft shadow. Hairlines are lighter, and controls are slightly rounder and lifted.
Segmented controls become a sunken track with an inverted chip, and the active rail entry
inverts its icon chip only. The values below are the current ones; `tokens.css` is the source.

## Type

IBM Plex Sans (SIL OFL 1.1), bundled from `@fontsource/ibm-plex-sans`, latin subset (which covers
French), weights 400, 500 and 600. Fallback: Noto Sans, DejaVu Sans, system-ui. Figures are
tabular everywhere (`font-variant-numeric: tabular-nums`), so values in fields do not jitter.
Line height 1.35. Sentence case for every label; no all-caps.

Major-second scale around a 13 px base:

| Token     | Size    | Use                                         |
| --------- | ------- | ------------------------------------------- |
| `--t-xl`  | 16 px   | key values (the resolution in ppp), dialogs |
| `--t-lg`  | 14.5 px | panel titles                                |
| `--t-md`  | 13 px   | body text, the app name and book title      |
| `--t-sm`  | 12 px   | fields, buttons, tabs, empty states         |
| `--t-xs`  | 11 px   | captions, counts, the spreads strip numbers |
| `--t-xxs` | 10.5 px | rail labels, badges on photos, meter scales |

Weights: 400 for text, 500 for active tabs and buttons, 600 for section titles.

Display face: Source Serif 4 (SIL OFL 1.1), bundled from `@fontsource/source-serif-4`, latin
400 and 600 (`--f-display`). It sets the app name (17 px, 600), the book title in the top bar
(15 px, 400), the home heading (`--t-display` 30 px), dialog titles (`--t-title` 20 px), panel,
inspector and overview titles (`--t-panel` 17 px), album titles on the home screen (16 px) and
the group titles of the dialogs (`--t-lg`). Controls, fields, labels and values stay in Plex.

The book's own text on the page uses the book's fonts, never the UI face.

## Spacing and radii

4 px base: `--s1` 2, `--s2` 4, `--s3` 6, `--s4` 8, `--s5` 12, `--s6` 16, `--s7` 24, `--s8` 32 px.
Controls are 28 px high (`--control-h`), 26 px in dense rows of the inspector.

Radii: `--r1` 4 px for controls, `--r2` 6 px for cards inside panels and floating panels,
`--r3` 10 px for dialogs. Paper, photos and covers stay square.

## Colour roles

| Token                                         | Role                                         | Light                           | Dark      |
| --------------------------------------------- | -------------------------------------------- | ------------------------------- | --------- |
| `--ground`                                    | workspace surround, around the page          | `#9b9b9b`                       | `#474747` |
| `--chrome`                                    | top bar, rail, panel, inspector, strip       | `#f0f0f0`                       | `#222222` |
| `--surface`                                   | fields, cards, dialogs, floating panels      | `#fafafa`                       | `#2c2c2c` |
| `--sunken`                                    | tracks of segmented controls, hover fill     | `#e6e6e6`                       | `#1a1a1a` |
| `--line`                                      | hairlines between regions                    | `#dcdcdc`                       | `#333333` |
| `--line-strong`                               | borders of fields and buttons                | `#c4c4c4`                       | `#474747` |
| `--ink`                                       | primary text, focus ring                     | `#1a1a1a`                       | `#ececec` |
| `--ink-2`                                     | secondary text, idle icons, empty states     | `#585858`                       | `#a6a6a6` |
| `--ink-3`                                     | tertiary text: counts, units, placeholders   | `#868686`                       | `#7a7a7a` |
| `--invert-bg`                                 | active and primary fill (= `--ink`)          | `#1a1a1a`                       | `#ececec` |
| `--invert-fg`                                 | text on `--invert-bg`                        | `#fafafa`                       | `#1a1a1a` |
| `--halo`                                      | soft ring round a focused field              | ink at 12 %                     | ink 16 %  |
| `--good`                                      | resolution good (>= 250 ppp)                 | `#3f7f52`                       | `#6fb283` |
| `--fair`                                      | resolution acceptable (150 to 250 ppp)       | `#a8741a`                       | `#d6a24a` |
| `--low`                                       | resolution low (< 150 ppp)                   | `#b0413e`                       | `#e07a76` |
| `--paper`                                     | blank paper of a page                        | `#ffffff`                       | `#ffffff` |
| `--sel-inner`                                 | inner line of the selection outline          | `#ffffff`                       | `#ffffff` |
| `--sel-outer`                                 | outer line of the selection outline          | `#000000`                       | `#000000` |
| `--badge-bg`                                  | chip over a photo: resolution badge, count   | `rgba(20,20,20,.82)`            | same      |
| `--badge-fg`                                  | text on that chip                            | `#f2f2f2`                       | same      |
| `--badge-ring`                                | white ring round a count chip on a thumbnail | `rgba(255,255,255,.7)`          | same      |
| `--badge-good`, `--badge-fair`, `--badge-low` | dot of the resolution badge                  | `#6fb283`, `#d6a24a`, `#e07a76` | same      |

`--ink-3` is for short secondary text only (a count next to a title, a unit after a number): it
is below 4.5:1 on `--chrome`. Sentences such as empty states use `--ink-2`.

Elevation is neutral black only: `--shadow-1` lifts buttons and pressed chips, `--shadow-2`
floats menus and notices over the canvas, `--shadow-3` carries dialogs, `--shadow-paper` puts
the page, the preview and the album covers on the grey as paper.

Themes: light is the base on `:root`, dark is `:root[data-theme='dark']`. `data-theme` is always
set on `<html>` before the first render (`theme/theme.ts`). The user's choice is kept in renderer
`localStorage`; without one, the theme follows `prefers-color-scheme`, live.

## States

- **Hover:** a `--sunken` fill (icon buttons, tiles) or a brighter fill and a darker border
  (buttons), the icon or text goes from `--ink-2` to `--ink`.
- **Press:** buttons and icon buttons move down 1 px.
- **Active / pressed / primary:** contrast inverts: `--invert-bg` fill, `--invert-fg` text (the
  icon chip of the active rail entry, the chip of a pressed segment, the Exporter button). No
  accent hue. A segmented control or a grid of tabs is a `--sunken` track, 2 px padding.
- **Selected tab:** `--ink` text, weight 500, a 2 px `--ink` underline.
- **Selected thumbnail or spread:** a 2 px `--ink` outline, 1 px offset.
- **Disabled:** 40 % opacity, default cursor.
- **Focus:** `:focus-visible` draws a 2 px `--ink` outline, 2 px offset; a focused field also
  gets a 4 px `--halo`.

## Canvas

- The canvas region is `--ground`; the page is `--paper` with `--shadow-paper`, a soft neutral
  drop shadow, as a printed sheet lying on the grey.
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

## Icons

Tabler Icons (MIT), outline style, from `@iconify-json/tabler`. The SVG bodies the UI uses are
copied at build time into `renderer/theme/icons.ts` by `apps/desktop/scripts/generate-icons.ts`
(add a name there, run `npm run icons -w @travelbook/desktop`); a unit test fails while the file
is out of date. The `Icon` component draws them inline in `currentColor`, 18 px (`--icon`),
15 px (`--icon-sm`) inside small toolbars, and redraws Tabler's stroke 2 at 1.5
(`--icon-stroke`). Icons are decorative: the button carries the French accessible name.

Current choices: Photos `photo`, Modèles `layout`, Stickers `sticker`, Fonds `background`,
Texte `letter-t`, Formes `triangle-square-circle`, Annuler `arrow-back-up`, Rétablir
`arrow-forward-up`, theme `moon` / `sun`, Recadrer `crop`, Retourner `flip-horizontal` /
`flip-vertical`, Retirer du cadre `photo-off`.

## Motion

- 120 ms (`--fast`) for hover and press feedback, 180 ms (`--swap`) for swaps, tab underlines,
  album covers and dialogs, all on `--ease` (a short ease-out).
- Motion only answers the user: a dialog settles in once when it opens (6 px, 98.5 % to 100 %);
  an album cover lifts 2 px on hover; a photo thumbnail zooms 3 % inside its frame. Nothing
  moves by itself.
- `prefers-reduced-motion: reduce` sets both durations to 0 ms and drops the dialog animation.

## Layout (spec §8)

```
+------------------------------------------------------------------------------+
| top bar 44 px: travelbook | title            undo redo | ... | theme          |
+------+-----------+-------------------------------------------+---------------+
| rail | panel     | canvas (--ground)                         | inspector     |
| 60px | 200-440px |                                           | 220-400 px    |
|      | (272)     |                                           | (264)         |
+------+-----------+-------------------------------------------+---------------+
| spreads strip 96 px                                                          |
+------------------------------------------------------------------------------+
```

Regions are separated by 1 px `--line` hairlines, not gaps or shadows (shadows are for what
floats: menus, notices, dialogs, paper). The panel and the
inspector have a drag handle on their inner edge (a 7 px hit zone over the hairline that turns
into a 2 px `--ink` line on hover, drag or focus; arrow keys move it by 8 px, Shift by 32 px,
Home and End go to the bounds). Their widths are kept in renderer `localStorage` and clamped to
the bounds above.

Accessible names (`strings/fr.ts`): top bar "Barre du haut" (banner), rail "Outils"
(navigation), panel "Panneau <nom>" (region), canvas "Plan de travail" (main), inspector
"Inspecteur" (complementary), strip "Doubles pages" (navigation).

## Trade-off to watch

It is the most austere of the three directions and can feel like work software for a holiday
album; the black active states are heavy in the light theme. Keep the inverted fills to the
one active item per group so they stay rare.
