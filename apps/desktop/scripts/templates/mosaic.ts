/**
 * Mosaic layouts: a page cut again and again into unequal boxes until every box is one photo.
 * The cuts come from a seeded generator, so the same call always gives the same layout; seeds
 * that would make a very thin or very uneven frame are skipped.
 */
import { P, col, row, seeded } from './dsl.ts';
import type { LayoutNode } from '@travelbook/core';

/** The box the shape of a mosaic is judged in: an A4 page with a 10 mm margin (mm). */
const BOX = { w: 190, h: 277 };
const GAP = 4;

interface Judged {
  node: LayoutNode;
  /** Width and height of each photo, mm. */
  sizes: { w: number; h: number }[];
}

function cut(count: number, w: number, h: number, rand: () => number): Judged {
  if (count === 1) return { node: P, sizes: [{ w, h }] };
  // Cut across the longer side, now and then across the other one.
  const alongRow = w >= h !== rand() < 0.2;
  const first = Math.min(count - 1, Math.max(1, Math.round(count * (0.35 + 0.3 * rand()))));
  const share = (first / count) * (0.85 + 0.3 * rand());
  const a = Math.min(8, Math.max(2, Math.round(share * 10)));
  const weights = [a, 10 - a];
  const room = (alongRow ? w : h) - GAP;
  const sizes = weights.map((k) => (room * k) / 10);
  const parts = [first, count - first].map((c, i) =>
    cut(c, alongRow ? (sizes[i] as number) : w, alongRow ? h : (sizes[i] as number), rand),
  );
  const children = parts.map((p) => p.node);
  return {
    node: alongRow ? row(weights, children) : col(weights, children),
    sizes: parts.flatMap((p) => p.sizes),
  };
}

/** True when no frame is a thin sliver or much bigger or smaller than the others. */
function even(sizes: { w: number; h: number }[]): boolean {
  const areas = sizes.map((s) => s.w * s.h);
  const mean = areas.reduce((a, b) => a + b, 0) / areas.length;
  return sizes.every((s) => {
    const aspect = s.w / s.h;
    const area = s.w * s.h;
    return aspect >= 0.45 && aspect <= 2.2 && area >= 0.55 * mean && area <= 1.8 * mean;
  });
}

/** A mosaic of `count` photos; the first acceptable cut from `seed` on. */
export function mosaic(count: number, seed: number): LayoutNode {
  for (let attempt = 0; attempt < 5000; attempt++) {
    const judged = cut(count, BOX.w, BOX.h, seeded(seed + attempt));
    if (even(judged.sizes)) return judged.node;
  }
  throw new Error(`No even mosaic of ${count} photos from seed ${seed}`);
}
