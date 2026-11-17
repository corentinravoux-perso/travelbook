# Drawn stickers: style guide

The sets of `apps/desktop/resources/stickers-src/` are drawn for travelbook (MIT, no
attribution). With the `affiches` set they make the "travelbook" tab, the first tab of the
Stickers panel (manifest group `travelbook`). The `affiches` set id and its drawing ids must
not change: the poster presets load the drawings by URL (`tb://sticker/affiches/<id>.svg`). The look
follows the kinds of stickers a photo-book editor offers (reference: the owner's screenshot of
2026-11-15). Every drawing is ours, drawn from scratch: nothing is traced or copied
(`CLEANROOM.md`).

## Pipeline

- Each drawing is a TypeScript description in `apps/desktop/scripts/stickers/draw/`. Geometry
  is written by hand, repeated parts (petals, stripes, leaves) come from loops.
- `npm run draw-stickers -w @travelbook/desktop [set]` writes `stickers-src/<set>/<id>.svg` and
  `meta.json` (name, order, category labels, French keywords). It also lists the files in
  `resources/LICENCES.json`. The SVG files are committed.
- The hand-drawn wobble comes from `roughjs`, seeded per drawing from its id, so a run gives
  the same files. The test `local-sets.test.ts` fails when a committed file differs from its
  generator.
- `npm run stickers` packs these sets before the Iconify sets.
- The "Bibliothèque" tab opens on "Recommandés": the open-pack stickers listed in
  `resources/stickers/recommended.json` (`<set>/<id>`, in order, checked at build time). Each
  keeps the licence of its own set.
- Review: `node apps/desktop/scripts/stickers/render-sheet.ts <set> <outDir> [filter]` writes a
  contact sheet. Each sticker is shown at 220 px and at 70 px (about 18 mm printed) on a
  coloured tile.

## Croquis (`croquis`)

- Bold black ink (`#1d1b1a`, about 9–11 units for a 300–420 unit drawing) with round caps.
  The fill is white, so the sticker reads on a coloured page.
- A second, thin, rougher line over the outline, as when a doodle is gone over twice (`ink`).
- Shadow side: rough parallel hatching (`hatch`). A few short accent strokes around the object.
- Solid black for small masses (a heart on a mug, sunglass lenses, an arrow), with a white
  highlight stroke.

## Bohème (`boheme`)

- **Ligne et couleur:** thin clean black line art (stroke about 3, low roughness) over one
  soft organic colour blob (`blob`), in peach, apricot, mustard, terracotta, sage or sand.
  Small four-point sparkles and dots around.
- **Fleurs, brins, tropiques:** flat colour shapes, no outline, no white. Layered petals (an
  outer and an inner ring, a darker centre, dots), sprigs with small hearts or berries, sage
  leaves, hibiscus with monstera lobes and palm fronds.

## Déco (`deco`)

Generated families, each crossed with a few palettes: washi tape (torn ends, nine motifs),
labels and tags (blank, so a text block goes on top), round and rectangular travel stamps
(text on a circle), postage stamps with a small flat scene, hand-drawn arrows (including a
dashed flight path with a plane), speech bubbles in the croquis line, photo corners, doodle
frames and underlines, confetti, and French hand lettering. The lettering is converted to
paths from the bundled OFL fonts, so no font is needed to display it.

The labels (`etiquette-*`, `draw/deco-etiquettes.ts` for most of them) come in about fifty
shapes, from flat geometric ones (oval, pill, hexagon, diamond, star, heart, cloud, arch,
shield, pennant) through paper-craft ones (scalloped jam label, school label, index tab,
torn paper, raffle ticket, envelope) to drawn objects (pinned note, paper clip, taped
sheet, scroll, rosette, wax seal, chalkboard, stitched leather tag, airport luggage tag,
gift tag with a bow). Each shape gets the palettes that suit it, dark ones (rouge, marine,
noir, forêt) for a light text. They stay blank: the middle is left free for the text block.

Torn-paper labels (`draw/deco-etiquettes-papier.ts`) are plain rectangles with no printed
border, torn on one side, two opposite sides, a corner or all four, in five tear styles:
`fin` (small irregular steps), `gros` (chunky), `dents` (sharp teeth), `vague` (soft wave)
and `fibre` (a pale paper core showing along the tear). Where two torn sides meet they share
one corner point, so no spike shows. Notebook pages (Seyès, squared, lined) are torn from a
pad the same way, their ruling clipped to the paper.

## Rules for a new drawing

- Id `<category>-<object>`, ASCII kebab case; the category prefix must be in the set's
  `categories`. Give French `kw` (search words).
- Whole numbers where possible. Leave a small margin, and crop the viewBox to the drawing.
- No `<text>`, `<image>`, external reference or script: the test refuses them.
- Check the contact sheet at 70 px: the subject must still read.
