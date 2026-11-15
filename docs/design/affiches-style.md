# Affiches: illustration style guide

The poster illustrations (`apps/desktop/resources/posters/illustrations/`) are one family, drawn
for travelbook. Style name: **papier découpé**: each drawing looks cut from a few sheets of
coloured paper and laid flat. Fixed by the pilot (torii, acacia, château), 2026-11-15; the
owner's bar: as worked as the torii, never an enlarged icon.
The checker `scripts/posters/lint-illustration.ts` and `presets.test.ts` enforce the hard rules;
the rest is judged on the contact sheet (`render-sheet.ts`).

## Two families

- **Découpé** (default): the rules below; recolourable through `tb-main` / `tb-shade`; at most
  five colours. Torii, Fuji, château.
- **Pixory** (`<svg data-tb-style="pixory">`): the subject in its natural colours, up to eight,
  more detail, a darker tone per colour allowed; no colour role required (not recoloured).
  Maneki-neko, ramen, safari 4×4. Inspired by the level of craft and the palettes of the
  Pixory covers, never by their drawings.
- Each destination gets several drawings, one or two of them in the pixory family.

## File

- `<destination>-<object>.svg`, ASCII kebab case. One subject per file: an object, a building,
  or a small scene around one subject (an acacia with a browsing giraffe, a castle on its loch).
  Not only animals: monuments, objects, plants and landscapes first.
- Root `<svg xmlns viewBox>` only: no `width`, `height`, `transform` on the root, no `<g>`
  needed. Whole numbers. The longer side of the viewBox is 700 to 1200 units, the other side the
  subject's natural proportion, cropped to the drawing (torii 1200 × 1000, acacia 1200 × 670,
  château 1200 × 764). The viewBox may start above 0 (`0 330 1200 670`).
- The object stands on the **bottom edge** of the viewBox and touches both nothing else and no
  other edge: leave about 3 % free at the top and sides.
- One comment per group of shapes is welcome (`<!-- Near legs -->`).

## Shapes

- Flat fills, no outline. No stroke, except for a thin line (a cable, a string) that cannot be
  drawn as a fill; a tail or a stem is a thin filled shape, so it takes a colour role.
- Elements: `path`, `rect`, `circle`, `ellipse`, `polygon`. Organic masses (a canopy, a cloud of
  leaves) are built from overlapping flat ellipses, their shadow layer the same ellipses shifted
  down in `tb-shade` and drawn first.
- Straight cuts and simple curves (`q`, `c`, arcs). Corners stay sharp; curves only where the
  object is curved. No texture, no gradient, no transparency.
- 30 to 90 shapes. Detail is spent where the eye reads the subject: the silhouette (the
  turned-up lintel, battlements, turrets), then the telling details (windows, nests, a flag, a
  reflection on the water). A drawing with fewer than 20 shapes is a sketch, not an affiche.
- Repeated details (battlements, windows, roof tiles, reflections) come from a small script so
  they stay regular; the script is not committed, the SVG is.
- Smallest feature: 2.5 % of the drawing's width (0.6 mm when the drawing prints 25 mm wide).
  Eyes: a circle of radius ≥ 1 % of the width.
- Animals in profile; a silhouette in ink reads better than a coloured animal beside a coloured
  subject.

## Light and colour roles

- Light from the left. One darker tone, never two. The shade is the main colour 35 % darker in
  lightness (`shadeOf`).
- `class="tb-main"`: the object's dominant mass (body, pillars, coat), at least half of the
  coloured area. The dialog's "Même couleur que le titre" paints it in the title colour.
- `class="tb-shade"`: the same hue, darker (the default is about 18 HSL points darker). It
  marks the shadow side (right side of a volume, underside of a beam or a canopy), the parts
  behind, reflections, and the object's own darker markings.
- Every role shape keeps its own default `fill`, so the file is right as a plain sticker.
- Fixed colours, the same in every drawing that needs them, never recoloured:
  - ink `#2b2723`: feet, windows, roofs, silhouettes, the black lintel of a torii;
  - moss `#6f7f3e`: ground, grass, hills;
  - bone `#e8dcc4`: horns, tusks, pale stone.
    Add an object colour of its own only when the object is not itself without it (a panda's
    black and white). Five colours at most, roles included.
- The drawing must still read when recoloured to the blue of the contact sheet: no fixed
  colour that only works beside the default main colour.

## Ground

- The subject stands on the bottom edge: on its own feet or base, on a ground, or above its
  reflection in water. A ground hillock is optional.
- Nothing may be cut by the sides or the top of the viewBox (a hill comes down before the edge).
- The bottom 3 % may be trimmed by the cover bleed: nothing essential there.

## Review

1. `node apps/desktop/scripts/posters/render-sheet.ts <destination> <dir>`.
2. On the sheet: the 400 px drawing reads at a glance; the recoloured one is still the object;
   the 100 px one keeps its silhouette.
3. Two redraws at most, then replace the object by another of the same destination.
