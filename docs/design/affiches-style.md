# Affiches: illustration style guide

The poster illustrations (`apps/desktop/resources/posters/illustrations/`) are one family, drawn
for travelbook. Style name: **papier découpé**: each drawing looks cut from a few sheets of
coloured paper and laid flat. Fixed by the pilot (torii, girafe, vache highland), 2026-11-15.
The checker `scripts/posters/lint-illustration.ts` and `presets.test.ts` enforce the hard rules;
the rest is judged on the contact sheet (`render-sheet.ts`).

## File

- `<destination>-<object>.svg`, ASCII kebab case, one object per file.
- Root `<svg xmlns viewBox>` only: no `width`, `height`, `transform` on the root, no `<g>`
  needed. Whole numbers. The longer side of the viewBox is 700 to 1200 units, the other side the
  object's natural proportion (torii 1200 × 1000, girafe 720 × 1000, vache 1000 × 780).
- The object stands on the **bottom edge** of the viewBox and touches both nothing else and no
  other edge: leave about 3 % free at the top and sides.
- One comment per group of shapes is welcome (`<!-- Near legs -->`).

## Shapes

- Flat fills, no outline. No stroke, except for a thin line (a cable, a string) that cannot be
  drawn as a fill; a tail or a stem is a thin filled shape, so it takes a colour role.
- Straight cuts and simple curves (`q`, `c`, arcs). Corners stay sharp; curves only where the
  object is curved. No texture, no gradient, no transparency.
- 15 to 40 shapes. Detail is spent on the silhouette (horns, ears, the turned-up lintel), not on
  the inside.
- Smallest feature: 2.5 % of the drawing's width (0.6 mm when the drawing prints 25 mm wide).
  Eyes: a circle of radius ≥ 1 % of the width.
- Animals in profile, facing left, standing.

## Light and colour roles

- Light from the left. One darker tone, never two.
- `class="tb-main"`: the object's dominant mass (body, pillars, coat), at least half of the
  coloured area. The dialog's "Même couleur que le titre" paints it in the title colour.
- `class="tb-shade"`: the same hue, darker (the default is about 18 HSL points darker). It
  marks the shadow side (right side of a volume, underside of a beam), the parts behind (the far
  legs) and the object's own darker markings (giraffe patches, fringe, mane, locks of a coat).
- Every role shape keeps its own default `fill`, so the file is right as a plain sticker.
- Fixed colours, the same in every drawing that needs them, never recoloured:
  - ink `#2b2723`: feet, hooves, eyes, nostrils, the black lintel of a torii;
  - moss `#6f7f3e`: the ground hillock;
  - bone `#e8dcc4`: horns, tusks, pale stone.
    Add an object colour of its own only when the object is not itself without it (a panda's
    black and white). Five colours at most, roles included.
- The drawing must still read when recoloured to the blue of the contact sheet: no fixed
  colour that only works beside the default main colour.

## Ground

- Animals, people and plants stand on a moss hillock, 6 to 8 % of the height, 60 to 90 % of the
  width, its top a gentle curve. Feet stand on it, not in it.
- Buildings and objects stand directly on the bottom edge, on a dark base (ink feet, a plinth).
- The bottom 3 % may be trimmed by the cover bleed: nothing essential there.

## Review

1. `node apps/desktop/scripts/posters/render-sheet.ts <destination> <dir>`.
2. On the sheet: the 400 px drawing reads at a glance; the recoloured one is still the object;
   the 100 px one keeps its silhouette.
3. Two redraws at most, then replace the object by another of the same destination.
