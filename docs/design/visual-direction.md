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

Weights: 400 for text, 500 for the book title, active tabs and buttons, 600 for panel titles,
section titles and the app name.

The book's own text on the page uses the book's fonts, never the UI face.

## Spacing and radii

4 px base: `--s1` 2, `--s2` 4, `--s3` 6, `--s4` 8, `--s5` 12, `--s6` 16, `--s7` 24, `--s8` 32 px.
Controls are 28 px high (`--control-h`), 26 px in dense rows of the inspector.

Radii: `--r1` 2 px for controls, `--r2` 4 px for cards inside panels and floating panels.
Nothing is rounder.

## Colour roles

| Token                                         | Role                                         | Light                           | Dark      |
| --------------------------------------------- | -------------------------------------------- | ------------------------------- | --------- |
| `--ground`                                    | workspace surround, around the page          | `#9b9b9b`                       | `#474747` |
| `--chrome`                                    | top bar, rail, panel, inspector, strip       | `#ececec`                       | `#262626` |
| `--surface`                                   | fields, cards, hover fill                    | `#f7f7f7`                       | `#2f2f2f` |
| `--line`                                      | hairlines between regions and around fields  | `#cfcfcf`                       | `#3a3a3a` |
| `--ink`                                       | primary text, focus ring                     | `#1f1f1f`                       | `#e8e8e8` |
| `--ink-2`                                     | secondary text, idle icons, empty states     | `#5c5c5c`                       | `#a3a3a3` |
| `--ink-3`                                     | tertiary text: counts, units, placeholders   | `#8a8a8a`                       | `#767676` |
| `--invert-bg`                                 | active and primary fill (= `--ink`)          | `#1f1f1f`                       | `#e8e8e8` |
| `--invert-fg`                                 | text on `--invert-bg`                        | `#f7f7f7`                       | `#1f1f1f` |
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

Themes: light is the base on `:root`, dark is `:root[data-theme='dark']`. `data-theme` is always
set on `<html>` before the first render (`theme/theme.ts`). The user's choice is kept in renderer
`localStorage`; without one, the theme follows `prefers-color-scheme`, live.

## States

- **Hover:** `--surface` fill, the icon or text goes from `--ink-2` to `--ink`.
- **Active / pressed / primary:** contrast inverts: `--invert-bg` fill, `--invert-fg` text (the
  active rail entry, a pressed segment, the Exporter button). No accent hue.
- **Selected tab:** `--ink` text, weight 500, a 2 px `--ink` underline.
- **Selected thumbnail or spread:** a 2 px `--ink` outline, 1 px offset.
- **Disabled:** 40 % opacity, default cursor.
- **Focus:** `:focus-visible` draws a 2 px `--ink` outline, 1 px offset.

## Canvas

- The canvas region is `--ground`; the page is `--paper` with a 1 px shadow line
  (`0 1px 0 rgba(0,0,0,.25)`), no soft drop shadow.
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

- 80 ms (`--fast`) for hover and press feedback, 120 ms (`--swap`) linear for swapping a panel.
- No easing flourishes, nothing that moves by itself, no entrance animations.
- `prefers-reduced-motion: reduce` sets both to 0 ms.

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

Regions are separated by 1 px `--line` hairlines, not gaps or shadows. The panel and the
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
