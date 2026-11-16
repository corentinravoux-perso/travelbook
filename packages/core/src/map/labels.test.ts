import { describe, expect, it } from 'vitest';
import { placeLabels, type LabelBox } from './labels';

const label = (id: string, x: number, y: number, over: Partial<LabelBox> = {}): LabelBox => ({
  id,
  x,
  y,
  w: 20,
  h: 4,
  rank: 0,
  ...over,
});

type Rect = { x: number; y: number; w: number; h: number };
/** The label's box, centred on its anchor plus the offset. */
const boxOf = (l: LabelBox, o: { dx: number; dy: number }): Rect => ({
  x: l.x + o.dx - l.w / 2,
  y: l.y + o.dy - l.h / 2,
  w: l.w,
  h: l.h,
});
const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('placeLabels', () => {
  it('puts a lone label to the east of its point, clear of it', () => {
    const l = label('a', 50, 50, { gap: 2 });
    const out = placeLabels([l], []);
    expect(out.get('a')).toEqual({ dx: 12, dy: 0 }); // 2 gap + half of 20
  });

  it('puts two labels of the same point at different positions that do not overlap', () => {
    const a = label('a', 50, 50, { rank: 0 });
    const b = label('b', 50, 50, { rank: 1 });
    const out = placeLabels([a, b], []);
    const pa = out.get('a');
    const pb = out.get('b');
    expect(pa).toBeDefined();
    expect(pb).toBeDefined();
    expect(pb).not.toEqual(pa);
    expect(overlap(boxOf(a, pa!), boxOf(b, pb!))).toBe(false);
  });

  it('places by rank: the lowest rank gets the first candidate whatever the input order', () => {
    const a = label('a', 50, 50, { rank: 5 });
    const b = label('b', 50, 50, { rank: 1 });
    const out = placeLabels([a, b], []);
    expect(out.get('b')).toEqual(placeLabels([b], []).get('b'));
    expect(out.get('a')).not.toEqual(out.get('b'));
  });

  it('tries east, north-east, north, north-west, west, south-west, south, south-east in turn', () => {
    // 10 x 4 label, gap 1: the candidate centres, y pointing down
    const centres = [
      [6, 0],
      [6, -3],
      [0, -3],
      [-6, -3],
      [-6, 0],
      [-6, 3],
      [0, 3],
      [6, 3],
    ] as const;
    const l = label('a', 50, 50, { w: 10, h: 4, gap: 1 });
    for (let taken = 0; taken < centres.length; taken++) {
      // a speck on the centre of each earlier candidate (it lies in no other candidate)
      const specks = centres
        .slice(0, taken)
        .map(([dx, dy]) => ({ x: 50 + dx - 0.1, y: 50 + dy - 0.1, w: 0.2, h: 0.2 }));
      const [dx, dy] = centres[taken]!;
      expect(placeLabels([l], specks).get('a')).toEqual({ dx, dy });
    }
  });

  it('avoids obstacles, taking the next free position', () => {
    const l = label('a', 50, 50, { gap: 1 });
    const free = placeLabels([l], []).get('a')!;
    const east = boxOf(l, free);
    const out = placeLabels([l], [east]).get('a')!;
    expect(out).not.toEqual(free);
    expect(overlap(boxOf(l, out), east)).toBe(false);
  });

  it('falls back to the position with the least overlap when all eight collide', () => {
    const l = label('a', 50, 50, { gap: 1 }); // 20 x 4
    const obstacles = [
      { x: 0, y: 0, w: 100, h: 100 }, // covers every candidate
      { x: 51, y: 48, w: 20, h: 4 }, // and the east side a second time
    ];
    // every box lies in the wall (80); the second obstacle adds 80 to the east one, 20 to the
    // north-east and south-east ones, 9 to the north one; the north-west one (80) is the first
    // with nothing else
    expect(placeLabels([l], obstacles).get('a')).toEqual({ dx: -11, dy: -3 });
  });

  it('keeps a fixed offset as given, and the others avoid it', () => {
    const fixedLabel = label('f', 50, 50, { fixed: { dx: 12, dy: 0 }, rank: 9 });
    const free = label('a', 50, 50, { rank: 0 });
    const out = placeLabels([free, fixedLabel], []);
    expect(out.get('f')).toEqual({ dx: 12, dy: 0 });
    const pa = out.get('a')!;
    expect(overlap(boxOf(free, pa), boxOf(fixedLabel, { dx: 12, dy: 0 }))).toBe(false);
  });

  it('is deterministic: the same input twice gives the same output', () => {
    const labels = Array.from({ length: 12 }, (_, i) =>
      label(`l${i}`, 40 + (i % 3) * 3, 40 + (i % 2) * 2, { rank: i % 5 }),
    );
    const obstacles = [{ x: 45, y: 38, w: 10, h: 10 }];
    const first = placeLabels(labels, obstacles);
    const second = placeLabels(labels, obstacles);
    expect([...second]).toEqual([...first]);
  });

  it('breaks rank ties by input order', () => {
    const a = label('a', 50, 50);
    const b = label('b', 50, 50);
    const out = placeLabels([a, b], []);
    expect(out.get('a')).toEqual(placeLabels([a], []).get('a'));
    const swapped = placeLabels([b, a], []);
    expect(swapped.get('b')).toEqual(out.get('a'));
  });

  it('tolerates bad boxes: duplicate ids, NaN anchors, zero or non-finite sizes', () => {
    const out = placeLabels(
      [
        label('a', 50, 50),
        label('a', 80, 80), // duplicate id: ignored
        label('nan', NaN, 3),
        label('flat', 10, 10, { w: 0, h: NaN }),
      ],
      [{ x: NaN, y: 0, w: 5, h: 5 }],
    );
    expect(out.get('a')).toEqual(placeLabels([label('a', 50, 50)], []).get('a'));
    expect(out.has('nan')).toBe(false);
    const flat = out.get('flat')!;
    expect(Number.isFinite(flat.dx) && Number.isFinite(flat.dy)).toBe(true);
  });

  it('returns an empty map for no label', () => {
    expect(placeLabels([], [{ x: 0, y: 0, w: 1, h: 1 }]).size).toBe(0);
  });
});
