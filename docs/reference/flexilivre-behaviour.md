# flexilivre editor — observed behaviour

Phase 0 of travelbook. Observed on 2026-11-14 by Opus, in flexilivre's online editor
(`/app/create/1/`, "album photo" product), in guest mode, without an account and without logging
in. A throwaway album was used: A4 portrait ("Grand Portrait", 21 × 29.7 cm), soft cover first,
then switched to hard cover. Its auto-composed title was `capture-test`. Six plain coloured test
JPEGs were generated locally and imported; no personal photo was used.

This file describes behaviour and ideas in our own words. It holds no screenshot, no flexilivre
asset, no code, no CSS and no template geometry. Counts are a person's estimates from the visible
tiles and the panel scrollbar, unless marked "exact".

## Terms of use

Read on 2026-11-14 at https://www.flexilivre.com/cgu/ ("Conditions générales de vente et
d'utilisation"), https://www.flexilivre.com/mentions-legales/ and
https://www.flexilivre.com/robots.txt. Neither legal page shows a "last updated" date.

- **CGV/CGU** (`/cgu/`, no "last updated" date; read 2026-11-14).
  - Art. 1: the terms cover every visit to the site. They may change at any time; the version
    in force on the day of an order applies.
  - Art. 3: breaching the terms may lead to legal action and a claim for damages.
  - Art. 4 (intellectual property): the site's software, technical developments, images, icons
    and texts belong to Flexilivre. Any partial or total reproduction of the content, by any
    means and on any medium, is forbidden. Photos uploaded by the user stay the user's.
- **Mentions légales** (`/mentions-legales/`, read 2026-11-14). §3 says the site and every
  element of it are Flexilivre's exclusive property. Users get a personal use right and a
  strictly private copy right. Extraction, reproduction or representation of the site without
  written permission is counterfeiting.
- **No clause** addresses automated access, scraping or reverse engineering. No clause
  restricts use of the editor without an account or without ordering. robots.txt disallows
  `/editor/`, `/EditBook/`, `/api/` and similar paths for crawlers, but not `/app/`.

**Verdict.** The terms do not forbid using the editor as a person and writing down what it
does. They do forbid copying flexilivre's content. This document therefore copies nothing: ideas
and functional behaviour only, in our words. Screenshots are private copies, kept outside the
repository, to be deleted after the gate.

## 1. Window layout

- **Start screen.** A size-choice step: two portrait sizes on this product page,
  15 × 21 cm and 21 × 29.7 cm, each with a starting price. Choosing a size opens the editor at
  once, with a soft cover and 24 pages. Other formats (landscape, square) are separate products
  on the site.
- **Top centre.** A pencil button and the album summary (format, cover type). The pencil opens
  "album details": size, cover finish, page count, extra pages and price, and links to change
  the size or the cover.
- **Left: a rail of five tabs**, rendered as a floating card: Photos (with a counter badge),
  Modèles, Textes, Fonds, Stickers. Below it is a panel about 340 px wide whose content
  depends on the tab.
- **Centre: one vertical scroll of spreads.** The cover spread (back, spine, front) comes first.
  Then come the interior spreads, each drawn as a double page. Every spread has its own
  controls underneath:
  - the page number(s);
  - a "random layout" button per page;
  - a trash button for the spread;
  - a "+" line between spreads that inserts 2 pages.
- **Right column.** "Commander" (a cart button that shows the price on hover), "Sauver &
  Quitter", and "Annuler" (undo). "Refaire" (redo) appears once something has been undone.
- **Bottom right.** An eye button that expands a small view menu: "Zoomer", "Vue globale", and
  the eye itself.
- **Selection model.** Clicking an element shows a floating toolbar under it. The toolbar's
  tools depend on the element type. The page that holds the selection gets a coloured outline.
- **Coaching.** First-use tips appear: an arrow-bubble next to Undo that tells the user a
  mistake can be reversed there, and modals at milestones. Examples: a "+2 pages" notice and a
  timed nudge in guest mode that urges creating an account to keep the work.

## 2. Photo import

- **Source.** "Ajouter des photos" opens the system file picker. No cloud source (Google
  Photos, Instagram…) was visible. The hidden file input accepts `.jpeg .jpg .png .heic`,
  several files at once.
- **What the editor does.** Six JPEGs of 4000 × 3000 px and smaller appeared in the tray
  within about a second. No progress bar, size message or quality message appeared at import.
  The photo counter on the tab became 6.
- **Tray.** Photos are grouped under a date heading (the day the file was taken, here
  "Saturday 14 November 2026"). Each group has a checkbox that selects the whole day.
  Thumbnails form a justified mosaic that keeps each photo's aspect ratio.
- **Sort/filter menu.** Order of addition, or chronological order. A toggle "hide used photos"
  is on by default: a photo leaves the tray as soon as it is placed. When it is replaced in a
  frame, it comes back to the tray.
- **Placing.** Drag a tray photo onto a frame: the photo fills the frame, centred and cropped
  ("cover" fit). Dropping onto a frame that already holds a photo replaces it. An empty frame
  shows a "+" and a short hint inviting a click to add a photo. That click was not tried, because it may open
  the system file picker.
- **Limits.** No maximum number or file size was shown. None was tested.

## 3. Templates ("Modèles")

The panel follows the spread in view. With the cover in view it shows a heading about album covers.
With an interior spread in view it shows a heading about page templates. Both views have two tabs,
**Thématique** and **Classique**.

**Classique** = plain layouts of empty frames on a white page, filtered by a photo-count chip
row: 1, 2, 3, 4, 5+. Thumbnails show a neutral placeholder picture in each frame.

Counts per photo count. The descriptions are a summary of the kinds of arrangement seen; they
are not layouts.

| photos      | interior page templates                                                                                                            | cover templates (front)                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1           | 7 (exact): full page, with a white margin, smaller photo on white, band                                                            | 7 (exact), the same kinds                                                 |
| 2           | 7 (exact): stacked, side by side, one big + one small                                                                              | ~7                                                                        |
| 3           | 10 (exact): one big + two small, three bands; with and without margin                                                              | ~10                                                                       |
| 4           | ~12: regular grids, staggered columns, one big + three small                                                                       | ~11                                                                       |
| 5           | ~5: mixed grids, one big + four small                                                                                              | ~15 for the whole "5+" chip (not split: only its first screen was viewed) |
| 6           | ~3: regular grids                                                                                                                  | (in "5+")                                                                 |
| 7–9         | ~2: rows of different heights, a 3 × 3 grid                                                                                        | (in "5+")                                                                 |
| 10 and more | ~5, up to about 20–25 photos: large regular grids, a mosaic, shaped collages (heart, circle), a scattered collage of tilted photos | (in "5+")                                                                 |

- The UI offers only one "5+" chip. The split of the interior "5+" set into 5 / 6 / 7–9 / 10+
  is my own count from its thumbnails (≈ 15 in all). The cover "5+" set was not scrolled
  through, so it stays merged.
- Total classic interior templates ≈ 51. Some are full bleed, some have a white margin. Some
  leave deliberate white bands. There is no margin or gap slider: spacing is fixed per
  template.
- **Thématique, interior pages**: one group, labelled as white-background templates, ≈ 24 templates.
  Their thumbnails are filled with sample photos (beach, family). They mix 1 to ~5 photos in
  freer arrangements.
- **Thématique, covers**: ≈ 50 designed covers: decorative backgrounds (floral, oriental print,
  neon), title lettering in several styles, polaroid-like frames, a circle crop, a chalkboard
  look.
- **Applying** a template means clicking a tile. The current page (or cover) takes the layout.
  Photos already on the page move into the new frames in order. Unfilled frames show "+". The
  test page went from 1 photo to a 3-photo template: the photo went to the first (largest)
  frame, two empty frames appeared.
- **"Mise en page aléatoire"** (shuffle button under each page) picks another template with
  the same number of photos and re-places the same photos.
- No "save as template" was found.

## 4. Free editing

- **Photo frame.** Selecting it shows four corner handles, four side handles, a rotation handle
  above, and a round "move" handle in the centre.
  - Dragging the body moves the frame freely.
  - The centre handle pans the picture inside the frame, limited so that the frame stays
    covered.
  - Side handles change the frame's proportions.
  - The rotation handle tilts the frame.
  - An element is clipped to its own page: it cannot cross the gutter, and a frame dragged
    over the edge is cut there.
- **Photo toolbar:** Zoom −, Zoom + (picture inside its frame); Rotation (turns the picture 90°
  inside the frame, the frame stays); Bord (border thickness slider + colour); Forme; Effet;
  Gommer; Réglages; Descendre / Remonter (stack order); Supprimer.
  - **Forme (masks, ~16):** square, rounded square, circle, starburst seal, hexagon, star,
    concave square, heart, triangle, octagon, diamond, ink splash, hand-drawn circle,
    soft-edged (feathered) oval, arch, rough-edged rectangle.
  - **Effet (11 presets, exact):** normal, light, contrast, colour boost, sharpness, aged,
    black and white, sepia, focus (vignette-like), vintage, vintage 2.
  - **Réglages:** three sliders, brightness, contrast, saturation, and a reset button.
  - **Gommer ("magic eraser"):** a full-screen mode with a short tutorial. You draw a closed
    outline around an unwanted object, then press "erase the zone". This is AI object removal.
    It was opened and closed, not run.
- **Snapping.** While dragging, a fine square grid appears over the page. A guide line appears
  when an edge lines up with another element. No align/distribute buttons were found.
- **Keyboard.** Delete removes the selected element. A photo frame is removed whole: no empty
  slot stays. Ctrl+Z undoes; Ctrl+C / Ctrl+V duplicates with a small offset. Arrow keys did
  **not** move the selection. Right-click shows a small menu with "Coller" (paste).
- **Undo/redo:** buttons on the right edge, plus Ctrl+Z. No limit was seen.

## 5. Text

- **Creation:** "Ajouter du texte" puts a text box on the current page, with a placeholder.
  Double-click to type. The box height follows its content.
- **Text presets:** ≈ 12 ready-made decorative quotes (French sayings). Each mixes 2–4 fonts,
  sizes and weights on several lines. They are inserted as text blocks.
- **Text toolbar:** a size stepper (up/down, shows the size in points, default 12), a font
  menu, Gras, Italic, Couleur, Fond (box fill), Bord (box border), alignment left / centre /
  right, Descendre / Remonter, Supprimer. Rotation and resize handles as for photos.
- **Rich text:** bold applied to a selected word only, so formatting is per run. No underline,
  line spacing, letter spacing, vertical alignment, lists, outline or shadow was found.
- **Colours:** 72 swatches (12 hues × 6 tints/shades), a custom colour wheel, and "none".
- **Fonts (39, names read from the list, as shown):** Arial, Times, PoiretOne, SixCaps,
  Courier, Fredoka One, AbrilFatface, Alfa Slab One, Aclonica, Righteous, Audiowide,
  BlackOpsOne, BerkshireSwash, Chewy, Allura, DancingScript, Great Vibes, Kaushan Script,
  Niconne, Tangerine, Shadows Into Light, Knewave, Mystery Quest, Kranky, Vast Shadow,
  Fredericka (the Great), Akronim, Bangers, Sigmar One, CaesarDressing, Codystar, FasterOne,
  Frijole, Monoton, Ribeye Marrow, Ewert, Creepster, Special Elite, UnifrakturCook. Most
  are Google Fonts families. The list was read in the spine editor; the text box's font menu
  looked the same.

## 6. Stickers and backgrounds

**Stickers ("Stickers" tab)**

- Top row: 6 basic shapes (square, triangle, hexagon, star, circle, heart). Dropped on a page,
  a shape gets a toolbar with Bord (outline), Couleur (fill), stack order, delete.
- A search field and a "recommended stickers" grid of ≈ 35 colour illustrations: speech
  bubbles, thumbs up, hearts, sparkles, drinks, smiling fruit, emoji-like faces.
- No category list. Search is the only way to browse: "voyage" gave ≈ 55 results. Many are
  single-colour silhouettes (map pin, flip-flops, camper van, surfer, ribbons, compass arrows,
  sun rays). The rest are colour drawings.
- Adding a sticker: drag it onto a page (a click did nothing). Its toolbar: Inverser (mirror),
  Descendre, Remonter, Supprimer. Resize and rotate handles. **No recolouring** of stickers.

**Backgrounds ("Fonds" tab)**

- A search field, a "Couleur" button (same 72-swatch palette + custom + none), and
  ≈ 30 "recommended backgrounds": patterns, gradients, textures, a few photos.
- Search "mer" gave ≈ 50 results, loosely matched: plain colours, stripes, florals.
- Clicking a tile applies it to the **selected page only**, including the bleed area. No
  double-page background and no opacity/blur/tint setting was found.

## 7. Pages

- A new album has 24 pages. The first interior spread shows the inside of the front cover,
  labelled "non printable", on the left, and page 1 on the right. Then come spreads 2–3, 4–5…
- **Adding:** the "+" between two spreads inserts 2 empty pages there. A modal then says that
  an album is made by multiples of 4 pages, and that blank pages are added at production
  otherwise. Price rose from 24.90 € to 26.60 € for +2 pages (0.85 €/page).
- **Deleting:** the trash under a spread. At 24 pages it is disabled, with a tooltip stating that
  the album cannot go below 24 pages.
- **Page-count limits by finish:** soft cover 24–400, spiral 10–200, hard cover 24–252,
  hard cover lay-flat 24–120.
- **New pages** carry one empty full-page frame each. After the automatic composition, unused
  pages were blank, with no frame.
- **Reordering:** "Vue globale" shows the cover and all spreads as a grid of thumbnails, with
  "+" insert points between them. Dragging a spread to another place moves it. After an undo,
  the overview showed the spreads in an odd order with old labels: undo in this view looked
  unreliable.
- No duplicate-spread and no swap-pages command was found.

## 8. Cover and opening pages

- **The cover is one spread:** back cover (left), spine (middle), front cover (right). The
  bleed/wrap margin is visible as a grey band. It is wider for the hard cover.
- **Back cover** always carries flexilivre's logo and a QR/product code in the bottom right.
  The user cannot remove them.
- **Spine:** clicking it opens a popover with:
  - one line of text;
  - a font menu (the 39 fonts above);
  - text colour and spine background colour;
  - a button that turns the text direction.

  The spine is very thin on the 24-page soft cover and wider on the hard cover; its width
  follows the finish and page count, it is not set by hand. The typed spine text did not show
  on the spine before the popover closed; perhaps a confirmation is needed (not resolved).

- **Cover templates:** see §3 (≈ 50 themed + ≈ 50 classic by photo count). Cover templates
  hold photo frames and title text. The auto-composed cover was a polaroid-style frame with
  the album title and the date under it, on a tinted background.
- **Changing the finish** (pencil → change cover) offers soft, spiral or hard. Hard cover then
  asks for "normal opening" or "lay-flat opening" (+13.28 €). The album keeps its content.
- **Opening/chapter pages:** no dedicated category. Text-only and title pages come from the
  themed templates and the text presets.

## 9. Automatic fill, warnings, preview, shortcuts, undo

- **Automatic composition** (a magic-wand button in the Photos panel, labelled as automatic
  photo placement):
  1. An intro screen promises chronological order, every page editable, ready in seconds, and
     warns that the album content will be replaced.
  2. A title step offers four suggestions built from the photo dates (for example a
     title naming the month) or free input.
  3. The album is rebuilt: a cover with one photo, title and date; one photo per page, in date
     order; remaining pages left blank.
- **Low resolution:** a placed photo too small for its frame gets a red "!" badge in the
  middle. Its tooltip says the quality is not enough and suggests making it smaller or
  replacing it. There is one level only. A 400 × 300 px photo on a full A4 page triggered it;
  4000 × 3000 px photos did not.
- **Pre-flight before ordering:** a screen reporting that the album was checked, with a 100 % completion ring,
  a "page check" tick, and a notice that a sheet will be added at the end (page count not a
  multiple of 4). It did **not** flag the low-resolution photo or the blank pages.
- **Preview:** reached from "Commander". A realistic book lies on a wooden table. Arrows turn
  the pages one spread at a time, with "Cover" or "Page n" between them. A toggle switches
  between "front view" and "perspective view". The bleed is trimmed off in the preview.
  "Back to editor" returns to editing.
- **Zoom:** "Zoomer" enlarges the canvas. A minimap shows the spread with the visible area
  framed, plus − / + buttons with the percentage (125 % seen) and "close".
- **Shortcuts:** see §4. Ctrl+Z, Ctrl+C/V and Delete work; arrows do not.
- **Saving (guest):** nothing asks for an account until the user saves or orders. A timed modal
  invites saving, promising that the account is free and keeps the album indefinitely. "Save & quit" and ordering lead to the
  account screen.

## 10. Order flow (observed up to the account step, nothing submitted)

1. "Commander" → pre-flight check screen (§9) → "Commander".
2. Book preview with a modal saying the book is ready and should be checked before ordering → "Commander · price".
3. Upsell: a prompt offering to upgrade the album. It offers the lay-flat hard cover for an extra
   charge. A "skip" link is provided.
4. **Account wall:** a screen asking to create an account to save the work. The user must give an email and password, or continue
   with Google or Apple. **The observation stopped here.** No data was entered. Address,
   shipping and payment steps were not reached.

## Not observed, and why

- Clicking an empty frame's "+": not tried. It may open the native file dialog, which cannot be
  driven or closed from the automation.
- Dragging files from the desktop into the editor, and import limits: not testable this way.
- Whether a themed cover changes the themed page templates offered (theme coupling): not tested.
- The text size range, and the exact choices of the text Fond and Bord tools: not opened.
- The bottom-right eye button's own action: clicking it only toggled the view menu. No
  separate preview opened.
- Spiral binding layout; landscape and square products (other product pages).
- Anything after the account step: addresses, shipping, payment.

## Gap list

Legend: **C** = design.md covers it; **CD** = design.md covers it differently; **O** = design.md
omits it. Recommendation in the last column.

| #   | flexilivre capability                                                                                  | design.md                                                                                                                                  | recommendation                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Format chosen first, from 2 fixed portrait sizes per product                                           | CD (§7.2 free size + presets)                                                                                                              | Keep.                                                                                                                                                                                                                                                           |
| 2   | Finish choice (soft / spiral / hard / lay-flat), each with its own page-count range                    | CD (§7.2 page-count hint rule)                                                                                                             | Add named page-rule presets ("souple 24–400 ×4", "rigide 24–252 ×4"…) to book settings.                                                                                                                                                                         |
| 3   | Price, cart, upsell, account, ordering                                                                 | O (non-goal)                                                                                                                               | Keep omitted.                                                                                                                                                                                                                                                   |
| 4   | Guest editing with save nudges and an account wall                                                     | CD (§7.1 local autosave)                                                                                                                   | Keep.                                                                                                                                                                                                                                                           |
| 5   | Rail of five tabs: Photos, Modèles, Textes, Fonds, Stickers; shapes inside Stickers                    | C (§8, plus a Formes tab)                                                                                                                  | Keep.                                                                                                                                                                                                                                                           |
| 6   | Template panel follows context: cover templates when the cover is in view, page templates otherwise    | O (§7.4 defines template scopes, but no panel behaviour)                                                                                   | Filter the Modèles panel by the target automatically (cover / page / spread).                                                                                                                                                                                   |
| 7   | Photo-count filter chips 1 / 2 / 3 / 4 / 5+                                                            | O (§7.4 counts templates by 1–6 photos, but the panel has no filter)                                                                       | Add photo-count chips (1 … 6, 7+).                                                                                                                                                                                                                              |
| 8   | Templates with 7–25 photos (big grids, mosaics, heart and rosette collages, scattered tilted collage)  | O (§7.4 stops at 6)                                                                                                                        | Add ~10 templates for 7–16 photos (grids, mosaics) and 2–3 free collages; let the grid engine take any N.                                                                                                                                                       |
| 9   | ≈ 51 classic + ≈ 24 themed page templates, so ≈ 75 for photo pages                                     | CD (§7.4: 80 is the total, incl. text-only, spreads, ≥ 12 covers, ≥ 10 openings; this leaves ≈ 50 photo-page templates, short by about 25) | Raise the photo-page set to ≥ 75, per photo count: 1 ≥ 9, 2 ≥ 9, 3 ≥ 12, 4 ≥ 15, 5–6 ≥ 14, 7 and more ≥ 16 (sum 9+9+12+15+14+16 = 75; each is ≥ the observed count in §3). Covers (≥ 30, #11) and openings (≥ 10, design.md §7.4) come on top, so ≥ 115 in all. |
| 10  | "Thématique" vs "Classique": designed templates with decorations, backgrounds and title lettering      | CD (§7.4 free templates with decorations)                                                                                                  | Add a "theme" grouping (cover + pages + backgrounds + fonts that go together) and a Thématique/Classique split in the panel.                                                                                                                                    |
| 11  | ≈ 50 themed + ≈ 50 classic cover templates                                                             | CD (§7.4 ≥ 12 covers)                                                                                                                      | Raise to ≥ 30 covers, or let every page template be applied to the front cover.                                                                                                                                                                                 |
| 12  | Fixed margin and gap per template, no slider                                                           | C, better (§7.4 sliders)                                                                                                                   | Keep the sliders.                                                                                                                                                                                                                                               |
| 13  | Applying a template moves existing photos into the new frames in order                                 | C (§7.4)                                                                                                                                   | Keep.                                                                                                                                                                                                                                                           |
| 14  | "Mise en page aléatoire": shuffle to another template with the same photo count                        | O                                                                                                                                          | Add: one button per page, cheap with the template index by photo count.                                                                                                                                                                                         |
| 15  | Automatic composition: date order, suggested title, auto cover with title + date                       | O (§15 later)                                                                                                                              | Keep for later; note the title-suggestion and auto-cover ideas for that phase.                                                                                                                                                                                  |
| 16  | Import from file picker only; JPEG, PNG, HEIC                                                          | CD (§9.1 JPEG/PNG/WebP, dialog, drag-drop, folder; HEIC non-goal)                                                                          | Keep. HEIC stays out unless Corentin's camera produces it.                                                                                                                                                                                                      |
| 17  | Tray grouped by day, with a select-the-day checkbox                                                    | O (§9.1 sort by date or name)                                                                                                              | Add day grouping (from EXIF date) and multi-select per day.                                                                                                                                                                                                     |
| 18  | "Hide used photos" toggle, on by default; replaced photos return                                       | C (§8 usage marks and count, §9.1 used/unused filter)                                                                                      | Keep; note that flexilivre hides used photos by default, so consider "unused" as the default filter.                                                                                                                                                            |
| 19  | Drop on a filled frame replaces its photo; the old photo returns to the tray                           | CD (§8 drop on a slot to fill it, drag slot onto slot to swap; replacing is not stated)                                                    | State it: a drop on a filled slot replaces the photo; the old one becomes unused again.                                                                                                                                                                         |
| 20  | Picture zoom/pan inside the frame; 90° picture rotation inside the frame                               | CD (§7.3 crop, flip)                                                                                                                       | Add a "rotate picture 90°" command separate from frame rotation.                                                                                                                                                                                                |
| 21  | Frame border: thickness + colour                                                                       | C (§7.3)                                                                                                                                   | Keep.                                                                                                                                                                                                                                                           |
| 22  | ≈ 16 masks, incl. soft-edged oval, ink splash, brush circle, rough rectangle                           | CD (§7.3 rect, rounded, ellipse, preset shapes)                                                                                            | Add a feathered-edge option and 3–4 irregular masks drawn by us.                                                                                                                                                                                                |
| 23  | 11 one-click effect presets (vintage, aged, focus/vignette, sharpen…)                                  | CD (§7.3 adjustments only)                                                                                                                 | Add 6–10 presets built from our own adjustments, plus a vignette adjustment.                                                                                                                                                                                    |
| 24  | Brightness, contrast, saturation sliders + reset                                                       | C (§7.3)                                                                                                                                   | Keep.                                                                                                                                                                                                                                                           |
| 25  | AI "magic eraser" (lasso object removal)                                                               | O (non-goal: retouching)                                                                                                                   | Keep omitted.                                                                                                                                                                                                                                                   |
| 26  | Free move/resize/rotate; elements clipped to their page, none can cross the gutter                     | C, better (§7.2 spread coordinates)                                                                                                        | Keep.                                                                                                                                                                                                                                                           |
| 27  | Grid overlay and edge-alignment guides while dragging; no align/distribute buttons                     | C, better (§8)                                                                                                                             | Keep.                                                                                                                                                                                                                                                           |
| 28  | Stack order via Descendre/Remonter                                                                     | C (§7.3, Calques panel)                                                                                                                    | Keep.                                                                                                                                                                                                                                                           |
| 29  | Delete, Ctrl+Z, Ctrl+C/V; right-click paste; arrow keys do nothing                                     | C, better (§8, §14)                                                                                                                        | Keep arrow-key nudge. Add a right-click menu.                                                                                                                                                                                                                   |
| 30  | Undo/redo buttons on the canvas edge                                                                   | C (§8)                                                                                                                                     | Keep.                                                                                                                                                                                                                                                           |
| 31  | Text box with per-run bold/italic, colour, fill, a box border, 3 alignments                            | CD (§7.3 richer text, box fill and padding, text outline and shadow; no box border)                                                        | Add a box border (thickness, colour).                                                                                                                                                                                                                           |
| 32  | ≈ 12 decorative text presets (multi-font quotes)                                                       | O                                                                                                                                          | Add 10–15 title/caption style presets of our own (no flexilivre wording).                                                                                                                                                                                       |
| 33  | 39 fonts, mostly Google Fonts display and script families                                              | C (§9.4 ~40 bundled + add on demand)                                                                                                       | Keep. The bundled list should include script, slab, stencil-like and typewriter faces, chosen by us.                                                                                                                                                            |
| 34  | 72-swatch palette + custom wheel + "none"                                                              | C (§9.3 picker, photo palette)                                                                                                             | Keep, plus a few fixed swatches.                                                                                                                                                                                                                                |
| 35  | Backgrounds per page only; search; ≈ 30 recommended                                                    | C, better (§9.3 per page or spread, gradients, image with blur/tint)                                                                       | Keep. Show a "recommended" set first.                                                                                                                                                                                                                           |
| 36  | ≈ 35 recommended stickers, search only, no categories, no recolour                                     | C, better (§9.2)                                                                                                                           | Keep. Add a "Recommandés" strip in the Bibliothèque tab.                                                                                                                                                                                                        |
| 37  | Basic shapes include a heart                                                                           | CD (§7.3 rect, ellipse, line, arrow, polygon, star)                                                                                        | Add heart to the shape list.                                                                                                                                                                                                                                    |
| 38  | Sticker mirror (Inverser)                                                                              | C (§7.3 flip)                                                                                                                              | Keep.                                                                                                                                                                                                                                                           |
| 39  | "+" between any two spreads inserts 2 pages there                                                      | CD (§8 "+ double page" in the strip)                                                                                                       | Put insert points between spreads in the strip and in the overview.                                                                                                                                                                                             |
| 40  | Minimum 24 pages: deletion below it is blocked (trash disabled, with the reason); multiple-of-4 notice | CD (§7.2 hints that never block)                                                                                                           | Keep non-blocking hints; show the reason in the hint as flexilivre does.                                                                                                                                                                                        |
| 41  | "Vue globale": a grid of all spreads, drag to reorder                                                  | CD (§8 spreads strip)                                                                                                                      | Add a full-screen overview grid, reusing the strip's drag logic.                                                                                                                                                                                                |
| 42  | Inside front cover shown as "non printable" left of page 1                                             | C (§7.2 first spread has only a right page)                                                                                                | Draw the empty left half with that label.                                                                                                                                                                                                                       |
| 43  | Cover = back + spine + front; spine text with font, text colour, spine background colour, direction    | CD (§7.2 spine width, rotated text; font, colours and background unspecified)                                                              | Add spine text font, text colour, spine background and text direction.                                                                                                                                                                                          |
| 44  | Spine width follows finish and page count automatically                                                | CD (§7.2 spine width set by hand)                                                                                                          | Keep manual; optionally a formula per page-rule preset.                                                                                                                                                                                                         |
| 45  | Mandatory publisher logo/code on the back cover                                                        | O (not wanted)                                                                                                                             | Keep omitted.                                                                                                                                                                                                                                                   |
| 46  | Low-resolution badge, one level, with advice                                                           | C, better (§8, three levels)                                                                                                               | Keep; reuse the advice to shrink the photo or replace it, in our own words.                                                                                                                                                                                     |
| 47  | Pre-flight check before ordering (pages, multiple of 4); misses low-res and blanks                     | C, better (§10 pre-flight)                                                                                                                 | Keep; also list blank pages.                                                                                                                                                                                                                                    |
| 48  | Book preview: page turn spread by spread, bleed trimmed; front and perspective views                   | C (§8 flipping double pages without chrome)                                                                                                | Keep; a perspective view is optional.                                                                                                                                                                                                                           |
| 49  | Zoom with a minimap navigator and a percentage                                                         | CD (§8 zoom and pan)                                                                                                                       | Add a minimap when zoomed in.                                                                                                                                                                                                                                   |
| 50  | First-use tips and milestone modals (undo tip, +2 pages, save nudge)                                   | O                                                                                                                                          | Add a few dismissible first-use tips (undo, slot drag, export). No nudges.                                                                                                                                                                                      |
| 51  | Click an empty frame to add a photo                                                                    | CD (§8 drag only)                                                                                                                          | Add: click on an empty slot opens a photo picker over the tray.                                                                                                                                                                                                 |

51 items: 20 C, 20 CD, 11 O. Gate decisions by Corentin go below.

## Priorities for v1

The five gaps that matter most for v1, checked against the observations above:

1. **More templates.** Grids and mosaics for 7–16 photos, plus 2–3 free collages (shaped,
   scattered). The photo-page set should reach at least 75, split 9 / 9 / 12 / 15 / 14 / 16 for 1 / 2 / 3 / 4 / 5–6 / 7+ photos
   (gap #8, #9).
2. **Covers and themes.** A Thématique / Classique split, with themes that group a cover, pages,
   backgrounds and fonts. Any page template should also apply to the front cover (#10, #11).
3. **Modèles panel.** It shows what fits the target (cover, page, spread), has photo-count
   chips, and offers a "random layout" button per page (#6, #7, #14).
4. **Photo look.** 6–10 one-click effect presets built from our own adjustments, a vignette, a
   feathered edge, and a few irregular masks (#22, #23).
5. **Photo and page handling.** Group the tray by EXIF day. Add an overview grid of spreads
   with drag reordering. A click on an empty slot opens a photo picker (#17, #41, #51).

## Gate decisions

Decided by Corentin on 2026-11-15:

- All five "Priorities for v1" above are accepted. They are carried into `design.md` and
  `plan.md` (template counts and panels, themes and covers, photo-look presets, photo tray
  and spread overview).
- The capture method is accepted: guest editor, one input event at a time over CDP, test
  photos set on the file input, no account. The scripted catalogue loop was blocked and
  never ran.
- Gaps rated O and marked "Keep omitted" stay out of v1.
