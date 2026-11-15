import {
  layoutTemplate,
  type Background,
  type LayoutParams,
  type Mm,
  type Template,
  type TextRole,
} from '@travelbook/core';

// What a template tile draws. The slots come from `layoutTemplate`, the same function the editor
// lays a template out with, so a tile shows the frames the page will get, for the book's own
// format and the margin and gap in the sliders. No image is involved.

/** A rectangle in mm of the target box, turned by `rotation` degrees about its centre. */
interface Box {
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
  rotation: number;
}

export interface ThumbSlot extends Box {
  kind: 'photo' | 'text';
  textRole?: TextRole;
  /** Photo frames cut to an oval, a circle or a similar round shape. */
  round: boolean;
  /** Y of each line of text drawn in a text frame (mm). */
  lines: number[];
}

export interface ThumbDecoration extends Box {
  shape: 'rect' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'star';
  fill: string | null;
  stroke: { width: Mm; color: string } | null;
  opacity: number;
  points: number;
}

export interface Thumb {
  /** The box the template is laid out in: a page, or a spread. */
  w: Mm;
  h: Mm;
  background: Background | null;
  decorations: ThumbDecoration[];
  slots: ThumbSlot[];
}

/** Presets that read as a round frame in a drawing this small. */
const ROUND_PRESETS = new Set(['circle', 'blob', 'heart', 'hexagon', 'star', 'diamond']);

/** Lines of text a frame of height `h` shows: more for a tall frame, one for a title. */
function textLines(slot: { y: Mm; h: Mm }, role: TextRole | undefined): number[] {
  if (role === 'title') return [slot.y + slot.h / 2];
  const count = Math.max(1, Math.min(6, Math.floor(slot.h / 6)));
  return Array.from({ length: count }, (_, i) => slot.y + ((i + 0.5) * slot.h) / count);
}

/**
 * The drawing of `template` in a box of `box` mm (the format of one page, or of two for a spread
 * template), with the bleed of that part of the book and the spacing of the sliders.
 */
export function thumbOf(
  template: Template,
  box: { w: Mm; h: Mm },
  bleed: Mm,
  params: LayoutParams,
): Thumb {
  const slots = layoutTemplate(template, { x: 0, y: 0, ...box }, bleed, params).map(
    (s): ThumbSlot => ({
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      rotation: s.rotation,
      kind: s.kind,
      ...(s.textRole ? { textRole: s.textRole } : {}),
      round:
        s.kind === 'photo' &&
        (s.mask?.kind === 'ellipse' ||
          (s.mask?.kind === 'preset' && ROUND_PRESETS.has(s.mask.preset ?? ''))),
      lines: s.kind === 'text' ? textLines(s, s.textRole) : [],
    }),
  );
  const decorations = (template.free?.decorations ?? []).flatMap((d): ThumbDecoration[] =>
    d.type === 'shape'
      ? [
          {
            x: d.x * box.w,
            y: d.y * box.h,
            w: d.w * box.w,
            h: d.h * box.h,
            rotation: d.rotation,
            shape: d.shape,
            fill: d.fill,
            stroke: d.stroke,
            opacity: d.opacity,
            points: d.points,
          },
        ]
      : [],
  );
  return { ...box, background: template.background ?? null, decorations, slots };
}

/** Corners of a regular polygon or star in the ellipse of a box, tip up (as `ShapeView` draws them). */
export function polygonPoints(
  d: Pick<ThumbDecoration, 'x' | 'y' | 'w' | 'h' | 'points' | 'shape'>,
): string {
  const star = d.shape === 'star';
  const total = star ? 2 * d.points : d.points;
  const cx = d.x + d.w / 2;
  const cy = d.y + d.h / 2;
  return Array.from({ length: total }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / total;
    const k = star && i % 2 === 1 ? 0.5 : 1;
    const px = cx + k * (d.w / 2) * Math.cos(angle);
    const py = cy + k * (d.h / 2) * Math.sin(angle);
    return `${Math.round(px * 100) / 100},${Math.round(py * 100) / 100}`;
  }).join(' ');
}
