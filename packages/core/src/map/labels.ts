export interface LabelBox {
  id: string;
  /** The point the label belongs to (the centre of its marker), in mm. */
  x: number;
  y: number;
  /** The size of the label's text box, in mm. */
  w: number;
  h: number;
  /** Placed in ascending order: the label with the lowest rank gets the first pick. */
  rank: number;
  /** An offset that the user chose: kept as given, and avoided by the others. */
  fixed?: { dx: number; dy: number };
  /** Free space between the point and the label's box, in mm (the marker's radius and a bit). */
  gap?: number;
}

/** A rectangle by its top-left corner, in mm. */
export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_GAP = 1.5;
/** Overlaps of less than this area (mm2) are none: boxes that only touch are clear. */
const NO_OVERLAP = 1e-9;

const finite = (n: number): number => (Number.isFinite(n) ? n : 0);

const overlapArea = (a: Obstacle, b: Obstacle): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * The offsets (mm, from the point to the centre of the label's box, the convention of
 * `MapPlace.labelOffset`) that put the labels near their points without overlapping each other or
 * the obstacles (markers, medallions).
 *
 * Greedy and deterministic: the fixed labels are set first; the others follow in ascending `rank`
 * (input order breaks ties), each taking the first of eight positions around its point, in the
 * order east, north-east, north, north-west, west, south-west, south, south-east (y points down),
 * that overlaps nothing placed so far, else the one with the least overlap. A label with no finite
 * point is left out, and of two labels with one id only the first is placed.
 */
export function placeLabels(
  labels: LabelBox[],
  obstacles: Obstacle[],
): Map<string, { dx: number; dy: number }> {
  const taken: Obstacle[] = obstacles
    .filter((o) => [o.x, o.y, o.w, o.h].every(Number.isFinite) && o.w > 0 && o.h > 0)
    .map((o) => ({ ...o }));
  const seen = new Set<string>();
  const usable = labels
    .map((label, index) => ({ label, index }))
    .filter(({ label }) => {
      if (seen.has(label.id) || !Number.isFinite(label.x) || !Number.isFinite(label.y))
        return false;
      seen.add(label.id);
      return true;
    });
  const out = new Map<string, { dx: number; dy: number }>();
  const boxAt = (l: LabelBox, dx: number, dy: number): Obstacle => {
    const w = Math.max(0, finite(l.w));
    const h = Math.max(0, finite(l.h));
    return { x: l.x + dx - w / 2, y: l.y + dy - h / 2, w, h };
  };

  for (const { label } of usable) {
    const fixed = label.fixed;
    if (!fixed || !Number.isFinite(fixed.dx) || !Number.isFinite(fixed.dy)) continue;
    out.set(label.id, { dx: fixed.dx, dy: fixed.dy });
    taken.push(boxAt(label, fixed.dx, fixed.dy));
  }

  const rank = (l: LabelBox): number => (Number.isNaN(l.rank) ? Infinity : l.rank);
  const free = usable
    .filter(({ label }) => !out.has(label.id))
    .sort((a, b) => {
      const [ra, rb] = [rank(a.label), rank(b.label)];
      return ra < rb ? -1 : ra > rb ? 1 : a.index - b.index;
    });
  for (const { label } of free) {
    const g = Math.max(0, finite(label.gap ?? DEFAULT_GAP));
    const w = Math.max(0, finite(label.w));
    const h = Math.max(0, finite(label.h));
    const ex = g + w / 2;
    const ny = g + h / 2;
    const candidates: [number, number][] = [
      [ex, 0],
      [ex, -ny],
      [0, -ny],
      [-ex, -ny],
      [-ex, 0],
      [-ex, ny],
      [0, ny],
      [ex, ny],
    ];
    let best = candidates[0] ?? [0, 0];
    let least = Infinity;
    for (const [dx, dy] of candidates) {
      const box = boxAt(label, dx, dy);
      const area = taken.reduce((sum, o) => sum + overlapArea(box, o), 0);
      if (area <= NO_OVERLAP) {
        best = [dx, dy];
        break;
      }
      if (area < least) {
        least = area;
        best = [dx, dy];
      }
    }
    out.set(label.id, { dx: best[0], dy: best[1] });
    taken.push(boxAt(label, best[0], best[1]));
  }
  return out;
}
