/**
 * The small vocabulary the template generators are written in: layout nodes, template builders,
 * free slots and vector decorations. Everything here is plain data (no runtime import of
 * `@travelbook/core`, so the generators also run under Node alone). Every layout in the
 * generators is our own.
 */
import type {
  Background,
  Element,
  FreeSlot,
  LayoutNode,
  PhotoElement,
  Template,
  TextRole,
} from '@travelbook/core';

export type Category = Template['category'];

/** What a template needs besides its layout. `id` is written without the `b-` prefix. */
export interface Meta {
  id: string;
  name: string;
  category?: Category;
  scope?: Template['scope'];
  themeId?: string;
  background?: Background;
}

// ---------------------------------------------------------------- grid layout nodes

export const P: LayoutNode = { slot: 'photo' };
export const T = (role: TextRole): LayoutNode => ({ slot: 'text', textRole: role });

const same = (n: number): number[] => Array.from({ length: n }, () => 1);

/** Children side by side, `weights` wide. */
export const row = (weights: number[], children: LayoutNode[]): LayoutNode => ({
  split: 'row',
  weights,
  children,
});
/** Children stacked, `weights` high. */
export const col = (weights: number[], children: LayoutNode[]): LayoutNode => ({
  split: 'col',
  weights,
  children,
});

/** `n` equal photos side by side. */
export const rowOf = (n: number): LayoutNode =>
  n === 1
    ? P
    : row(
        same(n),
        Array.from({ length: n }, () => P),
      );
/** `n` equal photos stacked. */
export const colOf = (n: number): LayoutNode =>
  n === 1
    ? P
    : col(
        same(n),
        Array.from({ length: n }, () => P),
      );
/** Rows of `counts[i]` equal photos, `heights` high (equal by default). */
export const grid = (counts: number[], heights: number[] = same(counts.length)): LayoutNode =>
  col(heights, counts.map(rowOf));
/** Columns of `counts[i]` equal photos stacked, `widths` wide (equal by default). */
export const columns = (counts: number[], widths: number[] = same(counts.length)): LayoutNode =>
  row(widths, counts.map(colOf));

export function countPhotos(node: LayoutNode): number {
  if ('slot' in node) return node.slot === 'photo' ? 1 : 0;
  return node.children.reduce((n, child) => n + countPhotos(child), 0);
}

// ---------------------------------------------------------------- template builders

const round = (v: number, places = 4): number => {
  const k = 10 ** places;
  return Math.round(v * k) / k;
};

function head(meta: Meta, photoCount: number): Omit<Template, 'grid' | 'free'> {
  return {
    id: `b-${meta.id}`,
    name: meta.name,
    category: meta.category ?? 'photos',
    scope: meta.scope ?? 'page',
    photoCount,
    origin: 'bundled',
    ...(meta.themeId ? { themeId: meta.themeId } : {}),
    ...(meta.background ? { background: meta.background } : {}),
  };
}

export function gridTemplate(meta: Meta, root: LayoutNode, fullBleed = false): Template {
  return { ...head(meta, countPhotos(root)), grid: { root, fullBleed } };
}

export function freeTemplate(meta: Meta, slots: FreeSlot[], decorations: Element[] = []): Template {
  const photoCount = slots.filter((s) => s.kind === 'photo').length;
  return {
    ...head(meta, photoCount),
    free: { slots, decorations: decorations.map((d, i) => ({ ...d, id: `d${i + 1}` })) },
  };
}

// ---------------------------------------------------------------- free slots (0..1 of the box)

export function photoSlot(
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { rotation?: number; mask?: PhotoElement['mask'] } = {},
): FreeSlot {
  return {
    kind: 'photo',
    x: round(x),
    y: round(y),
    w: round(w),
    h: round(h),
    rotation: opts.rotation ?? 0,
    ...(opts.mask ? { mask: opts.mask } : {}),
  };
}

export function textSlot(
  role: TextRole,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation = 0,
): FreeSlot {
  return {
    kind: 'text',
    x: round(x),
    y: round(y),
    w: round(w),
    h: round(h),
    rotation,
    textRole: role,
  };
}

export const ROUND: PhotoElement['mask'] = { kind: 'ellipse' };
export const preset = (name: string): PhotoElement['mask'] => ({ kind: 'preset', preset: name });

// ---------------------------------------------------------------- decorations (0..1 of the box)

export interface DecoOpts {
  fill?: string | null;
  stroke?: { width: number; color: string } | null;
  radius?: number;
  rotation?: number;
  opacity?: number;
  points?: number;
}

type ShapeKind = 'rect' | 'ellipse' | 'line' | 'polygon' | 'star';

export function deco(
  shape: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: DecoOpts = {},
): Element {
  return {
    id: 'd',
    type: 'shape',
    x: round(x),
    y: round(y),
    w: round(w),
    h: round(h),
    rotation: opts.rotation ?? 0,
    opacity: opts.opacity ?? 1,
    locked: false,
    hidden: false,
    shape,
    fill: opts.fill ?? null,
    stroke: opts.stroke ?? null,
    radius: opts.radius ?? 0,
    points: opts.points ?? 5,
  };
}

/** A horizontal line across `w` at height `y`. */
export const hline = (x: number, y: number, w: number, color: string, width = 0.4): Element =>
  deco('line', x, y, w, 0, { stroke: { width, color } });

// ---------------------------------------------------------------- geometry helpers

/** The page the free layouts are drawn for (A4 portrait); fractions of it keep their proportions. */
export const PAGE = { w: 210, h: 297 } as const;

export interface Frac {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A rectangle given in the local 0..1 units of `card`, as it ends up when the card is rotated by
 * `rotation` degrees about its centre: the position is rotated with the card, the size is kept.
 * The returned `rotation` is the card's, so a photo on a tilted card tilts with it.
 */
export function onCard(
  card: Frac,
  rotation: number,
  local: Frac,
  page: { w: number; h: number } = PAGE,
): Frac & { rotation: number } {
  const cw = card.w * page.w;
  const ch = card.h * page.h;
  const ccx = (card.x + card.w / 2) * page.w;
  const ccy = (card.y + card.h / 2) * page.h;
  const dx = (local.x + local.w / 2 - 0.5) * cw;
  const dy = (local.y + local.h / 2 - 0.5) * ch;
  const a = (rotation * Math.PI) / 180;
  const cx = ccx + dx * Math.cos(a) - dy * Math.sin(a);
  const cy = ccy + dx * Math.sin(a) + dy * Math.cos(a);
  const w = local.w * cw;
  const h = local.h * ch;
  return {
    x: (cx - w / 2) / page.w,
    y: (cy - h / 2) / page.h,
    w: w / page.w,
    h: h / page.h,
    rotation,
  };
}

/** A square of `side` (fraction of the page width) as fractions of the page: x, w, h. */
export function squareW(
  side: number,
  page: { w: number; h: number } = PAGE,
): { w: number; h: number } {
  return { w: side, h: (side * page.w) / page.h };
}

/** A small deterministic random generator (mulberry32): the same seed always gives the same layout. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
