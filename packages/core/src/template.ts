import { z } from 'zod';
import { ElementSchema, type Element, type Mm, type PhotoElement, type Rect } from './schema';

export type TextRole = 'title' | 'caption' | 'body';

export type LayoutNode =
  | { slot: 'photo' | 'text'; textRole?: TextRole }
  | { split: 'row' | 'col'; weights: number[]; children: LayoutNode[] };

/** Frame in 0..1 units relative to the template box. */
export interface FreeSlot {
  kind: 'photo' | 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  textRole?: TextRole;
  mask?: PhotoElement['mask'];
}

export interface Template {
  id: string;
  /** French display name. */
  name: string;
  category: 'photos' | 'texte' | 'double' | 'couverture' | 'ouverture';
  scope: 'page' | 'spread';
  photoCount: number;
  origin: 'bundled' | 'user';
  grid?: { root: LayoutNode; fullBleed: boolean };
  /** Decorations are in 0..1 units relative to the template box. */
  free?: { slots: FreeSlot[]; decorations: Element[] };
}

export interface SlotRect extends Rect {
  kind: 'photo' | 'text';
  rotation: number;
  textRole?: TextRole;
  mask?: PhotoElement['mask'];
}

export interface LayoutParams {
  margin: Mm;
  gap: Mm;
}

const textRole = z.enum(['title', 'caption', 'body']);

const LayoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.union([
    z.object({ slot: z.enum(['photo', 'text']), textRole: textRole.optional() }),
    z
      .object({
        split: z.enum(['row', 'col']),
        weights: z.array(z.number().positive().finite()).min(1),
        children: z.array(LayoutNodeSchema).min(1),
      })
      .refine((n) => n.weights.length === n.children.length, {
        message: 'weights and children must have the same length',
      }),
  ]),
);

const FreeSlotSchema = z.object({
  kind: z.enum(['photo', 'text']),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().positive(),
  h: z.number().finite().positive(),
  rotation: z.number().finite(),
  textRole: textRole.optional(),
  mask: z
    .object({
      kind: z.enum(['rect', 'rounded', 'ellipse', 'preset']),
      radius: z.number().min(0).finite().optional(),
      preset: z.string().optional(),
    })
    .optional(),
});

export const TemplateSchema: z.ZodType<Template> = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(['photos', 'texte', 'double', 'couverture', 'ouverture']),
    scope: z.enum(['page', 'spread']),
    photoCount: z.number().int().min(0),
    origin: z.enum(['bundled', 'user']),
    grid: z.object({ root: LayoutNodeSchema, fullBleed: z.boolean() }).optional(),
    free: z
      .object({ slots: z.array(FreeSlotSchema), decorations: z.array(ElementSchema) })
      .optional(),
  })
  .refine((t) => (t.grid === undefined) !== (t.free === undefined), {
    message: 'a template needs exactly one of grid or free',
  });

function layoutNode(node: LayoutNode, box: Rect, gap: Mm, out: SlotRect[]): void {
  if ('slot' in node) {
    out.push({
      ...box,
      kind: node.slot,
      rotation: 0,
      ...(node.textRole ? { textRole: node.textRole } : {}),
    });
    return;
  }
  const n = node.children.length;
  const row = node.split === 'row';
  const total = node.weights.reduce((a, b) => a + b, 0);
  const avail = (row ? box.w : box.h) - gap * (n - 1);
  let pos = row ? box.x : box.y;
  node.children.forEach((child, i) => {
    const size = (avail * node.weights[i]!) / total;
    const childBox: Rect = row
      ? { x: pos, y: box.y, w: size, h: box.h }
      : { x: box.x, y: pos, w: box.w, h: size };
    layoutNode(child, childBox, gap, out);
    pos += size + gap;
  });
}

/** Float noise from weighted splits can make two slots of one visual row differ in y by ~1e-14 mm. */
const ROW_TOLERANCE_MM = 0.5;

/** Top to bottom; slots whose y is within 0.5 mm of the row's first slot sort left to right. */
function readingOrder(slots: SlotRect[]): SlotRect[] {
  const byY = [...slots].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: SlotRect[] = [];
  let i = 0;
  while (i < byY.length) {
    const rowY = byY[i]!.y;
    const row: SlotRect[] = [];
    while (i < byY.length && byY[i]!.y - rowY <= ROW_TOLERANCE_MM) row.push(byY[i++]!);
    out.push(...row.sort((a, b) => a.x - b.x));
  }
  return out;
}

/**
 * Resolve a template into slot rectangles in mm, in reading order.
 * Grid: outer box is `box` shrunk by `p.margin`, or, when full bleed, grown by `bleed`.
 * For a spread-scope template the caller passes the spread box.
 */
export function layoutTemplate(t: Template, box: Rect, bleed: Mm, p: LayoutParams): SlotRect[] {
  const out: SlotRect[] = [];
  if (t.grid) {
    const m = t.grid.fullBleed ? -bleed : p.margin;
    const outer: Rect = { x: box.x + m, y: box.y + m, w: box.w - 2 * m, h: box.h - 2 * m };
    layoutNode(t.grid.root, outer, p.gap, out);
  } else if (t.free) {
    for (const s of t.free.slots) {
      out.push({
        x: box.x + s.x * box.w,
        y: box.y + s.y * box.h,
        w: s.w * box.w,
        h: s.h * box.h,
        kind: s.kind,
        rotation: s.rotation,
        ...(s.textRole ? { textRole: s.textRole } : {}),
        ...(s.mask ? { mask: s.mask } : {}),
      });
    }
  }
  return readingOrder(out);
}
