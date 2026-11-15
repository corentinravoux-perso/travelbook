import { MM_TO_PX, type Mm, type PhotoElement } from '@travelbook/core';
import { round } from './units';

export type Mask = PhotoElement['mask'];

/** What a photo frame needs to be drawn in the shape of its mask. */
export interface MaskCss {
  /** `border-radius` of the frame: set for the rounded and ellipse masks. */
  borderRadius?: string;
  /** `clip-path` of the frame, in CSS px: set for the presets. */
  clipPath?: string;
  /** The same outline as an SVG path in mm (frame coordinates), so a border can follow it. */
  outline?: string;
}

/** One absolute path command; the numbers are x y pairs (Z has none). */
type Cmd = readonly ['M' | 'L' | 'C' | 'Z', ...number[]];

/** A preset's outline: `contain` keeps its natural aspect ratio, otherwise it fills the frame. */
interface Shape {
  /** Natural width and height; `cmds` use these as their coordinate space. */
  w: number;
  h: number;
  contain: boolean;
  cmds: readonly Cmd[];
}

const polygon = (points: readonly (readonly [number, number])[]): Cmd[] => [
  ...points.map(([x, y], i): Cmd => [i === 0 ? 'M' : 'L', x, y]),
  ['Z'],
];

/** Quarter-circle Bézier constant: control points sit 55.23% of the radius along the tangent. */
const KAPPA = 0.5522847498;

/** Corners of a regular star or polygon centred at (cx, cy), starting at the top. */
function ring(
  count: number,
  cx: number,
  cy: number,
  outer: number,
  inner?: number,
): [number, number][] {
  const corners = inner === undefined ? count : 2 * count;
  return Array.from({ length: corners }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / corners;
    const r = inner === undefined || i % 2 === 0 ? outer : inner;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });
}

/** Re-centre points on their bounding box, so that a shape's natural box is tight around it. */
function tight(points: [number, number][]): Shape {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return {
    w: Math.max(...xs) - x0,
    h: Math.max(...ys) - y0,
    contain: true,
    cmds: polygon(points.map(([x, y]) => [x - x0, y - y0])),
  };
}

/** Deterministic noise in [0, 1): an irregular shape is the same on every machine and every draw. */
function noise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** A smooth closed curve through `points`: Catmull-Rom, written as cubic Béziers. */
function smooth(points: readonly (readonly [number, number])[]): Cmd[] {
  const n = points.length;
  const p = (i: number): readonly [number, number] => points[(i + n) % n] as [number, number];
  const cmds: Cmd[] = [['M', ...p(0)]];
  for (let i = 0; i < n; i++) {
    const [a, b, c, d] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    cmds.push([
      'C',
      b[0] + (c[0] - a[0]) / 6,
      b[1] + (c[1] - a[1]) / 6,
      c[0] - (d[0] - b[0]) / 6,
      c[1] - (d[1] - b[1]) / 6,
      c[0],
      c[1],
    ]);
  }
  return [...cmds, ['Z']];
}

/** `cmds` moved and stretched to fill 0..100 on both axes, control points included. */
function fill100(cmds: readonly Cmd[]): Shape {
  const xs = cmds.flatMap(([, ...n]) => n.filter((_, i) => i % 2 === 0));
  const ys = cmds.flatMap(([, ...n]) => n.filter((_, i) => i % 2 === 1));
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const kx = 100 / (Math.max(...xs) - x0);
  const ky = 100 / (Math.max(...ys) - y0);
  return {
    w: 100,
    h: 100,
    contain: false,
    cmds: cmds.map(([op, ...n]): Cmd => [
      op,
      ...n.map((v, i) => (i % 2 === 0 ? (v - x0) * kx : (v - y0) * ky)),
    ]),
  };
}

/** The four sides of a frame, clockwise from its top left corner: `at(u, d)` is `u` along the side, `d` in. */
function sides(w: Mm, h: Mm): { len: Mm; at(u: Mm, d: Mm): [number, number] }[] {
  return [
    { len: w, at: (u, d) => [u, d] },
    { len: h, at: (u, d) => [w - d, u] },
    { len: w, at: (u, d) => [w - u, h - d] },
    { len: h, at: (u, d) => [d, h - u] },
  ];
}

/** Seven bulges of different sizes round a centre: a pebble, a puddle. */
const BLOB = fill100(
  smooth(
    [1, 0.88, 0.97, 0.82, 0.99, 0.86, 0.93].map((r, i, all): [number, number] => {
      const angle = (2 * Math.PI * (i + 0.25)) / all.length - Math.PI / 2;
      return [50 + 50 * r * Math.cos(angle), 50 + 50 * r * Math.sin(angle)];
    }),
  ),
);

/** An oval swept with a dry brush: a ragged rim, and bristle streaks where the stroke starts and ends. */
const BRUSH = (() => {
  const rnd = noise(5);
  const count = 96;
  return fill100(
    polygon(
      Array.from({ length: count }, (_, i): [number, number] => {
        const angle = (2 * Math.PI * i) / count;
        const bristle = Math.abs(Math.cos(angle)) > 0.9 && i % 2 === 0;
        const r = 1 - 0.03 * rnd() - (bristle ? 0.1 * (0.4 + rnd()) : 0);
        return [50 + 50 * r * Math.cos(angle), 50 + 50 * r * Math.sin(angle)];
      }),
    ),
  );
})();

const R = 50;
const SHAPES: Record<string, (frame: { w: Mm; h: Mm }) => Shape> = {
  /** A circle as wide as the shorter side of the frame. */
  circle: () => ({
    w: 100,
    h: 100,
    contain: true,
    cmds: [
      ['M', 50, 0],
      ['C', 50 + R * KAPPA, 0, 100, 50 - R * KAPPA, 100, 50],
      ['C', 100, 50 + R * KAPPA, 50 + R * KAPPA, 100, 50, 100],
      ['C', 50 - R * KAPPA, 100, 0, 50 + R * KAPPA, 0, 50],
      ['C', 0, 50 - R * KAPPA, 50 - R * KAPPA, 0, 50, 0],
      ['Z'],
    ],
  }),
  /** A window: flat bottom, straight sides and a round top as wide as the frame. */
  arch: ({ w, h }) => {
    const r = Math.min(w / 2, h);
    return {
      w,
      h,
      contain: false,
      cmds: [
        ['M', 0, h],
        ['L', 0, r],
        ['C', 0, r - r * KAPPA, w / 2 - r * KAPPA, 0, w / 2, 0],
        ['C', w / 2 + r * KAPPA, 0, w, r - r * KAPPA, w, r],
        ['L', w, h],
        ['Z'],
      ],
    };
  },
  heart: () => ({
    w: 100,
    h: 90,
    contain: true,
    cmds: [
      ['M', 50, 90],
      ['C', 10, 60, 0, 35, 0, 25],
      ['C', 0, 8, 12, 0, 25, 0],
      ['C', 38, 0, 47, 8, 50, 17],
      ['C', 53, 8, 62, 0, 75, 0],
      ['C', 88, 0, 100, 8, 100, 25],
      ['C', 100, 35, 90, 60, 50, 90],
      ['Z'],
    ],
  }),
  /** The four middle points of the sides: fills the frame. */
  diamond: () => ({
    w: 100,
    h: 100,
    contain: false,
    cmds: polygon([
      [50, 0],
      [100, 50],
      [50, 100],
      [0, 50],
    ]),
  }),
  hexagon: () => tight(ring(6, 0, 0, 50).map(([x, y]) => [y, x])),
  star: () => tight(ring(5, 0, 0, 50, 22)),
  /** A sheet torn out of a pad: a jagged edge with teeth of about 2.5 mm, at most 3 mm deep. */
  torn: ({ w, h }) => {
    const rnd = noise(11);
    const depth = Math.min(3, w / 10, h / 10);
    const points: [number, number][] = [];
    for (const { len, at } of sides(w, h)) {
      const gaps = Array.from(
        { length: Math.max(2, Math.round(len / 2.5)) },
        () => 0.6 + 0.8 * rnd(),
      );
      const total = gaps.reduce((sum, gap) => sum + gap, 0);
      let u = 0;
      let d = 0;
      gaps.forEach((gap, i) => {
        // Each tooth leans on the one before; the first point of a side is the corner and stays put.
        d = i === 0 ? 0 : 0.25 * d + 0.75 * depth * rnd();
        points.push(at(u, d));
        u += (gap / total) * len;
      });
    }
    return { w, h, contain: false, cmds: polygon(points) };
  },
  /** Gentle ripples along the four sides, 10 mm from crest to crest and 1.8 mm deep at most. */
  wave: ({ w, h }) => {
    const depth = Math.min(1.8, w / 20, h / 20);
    const cmds: Cmd[] = [];
    sides(w, h).forEach(({ len, at }, side) => {
      // An even number of half waves: each side starts and ends on the frame, at the corners.
      const n = 2 * Math.max(1, Math.round(len / 10));
      for (let i = 0; i < n; i++) {
        const [u0, u1] = [(len * i) / n, (len * (i + 1)) / n];
        const [d0, d1] = [i % 2 === 0 ? 0 : depth, i % 2 === 0 ? depth : 0];
        const mid = (u0 + u1) / 2;
        if (side === 0 && i === 0) cmds.push(['M', ...at(u0, d0)]);
        cmds.push(['C', ...at(mid, d0), ...at(mid, d1), ...at(u1, d1)]);
      }
    });
    return { w, h, contain: false, cmds: [...cmds, ['Z']] };
  },
  blob: () => BLOB,
  brush: () => BRUSH,
};

/** Names of the `preset` masks, in alphabetical order. */
export const MASK_PRESETS = Object.keys(SHAPES).sort();

/** `d` of an absolute path, with every coordinate mapped through `map` and rounded. */
function pathData(cmds: readonly Cmd[], map: (x: number, y: number) => [number, number]): string {
  return cmds
    .map(([op, ...n]) => {
      const mapped: number[] = [];
      for (let i = 0; i < n.length; i += 2) {
        mapped.push(...map(n[i] as number, n[i + 1] as number));
      }
      return [op, ...mapped.map((v) => round(v, 3))].join(' ');
    })
    .join(' ');
}

function preset(name: string | undefined, frame: { w: Mm; h: Mm }): MaskCss {
  if (name === undefined || !Object.hasOwn(SHAPES, name)) return {};
  if (!(frame.w > 0 && frame.h > 0)) return {};
  const shape = (SHAPES[name] as (frame: { w: Mm; h: Mm }) => Shape)(frame);
  const sx = frame.w / shape.w;
  const sy = frame.h / shape.h;
  const [kx, ky] = shape.contain ? [Math.min(sx, sy), Math.min(sx, sy)] : [sx, sy];
  const ox = (frame.w - shape.w * kx) / 2;
  const oy = (frame.h - shape.h * ky) / 2;
  const toMm = (x: number, y: number): [number, number] => [ox + x * kx, oy + y * ky];
  const toPx = (x: number, y: number): [number, number] => {
    const [mx, my] = toMm(x, y);
    return [mx * MM_TO_PX, my * MM_TO_PX];
  };
  return {
    clipPath: `path('${pathData(shape.cmds, toPx)}')`,
    outline: pathData(shape.cmds, toMm),
  };
}

/**
 * How a photo frame of `size` (mm) takes the shape of its mask. A rect needs nothing; rounded and
 * ellipse are a `border-radius`; a preset is a `clip-path` (and an outline for the border). An
 * unknown preset draws as a rect, so a book written by a newer version still opens.
 */
export function maskCss(mask: Mask, size: { w: Mm; h: Mm }): MaskCss {
  switch (mask.kind) {
    case 'rounded':
      return mask.radius ? { borderRadius: `${round(mask.radius)}mm` } : {};
    case 'ellipse':
      return { borderRadius: '50%' };
    case 'preset':
      return preset(mask.preset, size);
    case 'rect':
      return {};
  }
}

/** `mask-*` properties of a frame whose outline fades out. */
export interface FeatherCss {
  maskImage: string;
  maskSize: string;
  maskRepeat: string;
}

/** The shape of `mask` as SVG markup, in mm, for a frame of `size`. */
function shapeSvg(mask: Mask, size: { w: Mm; h: Mm }, filter: string): string {
  const [w, h] = [round(size.w), round(size.h)];
  const common = `fill="#000" filter="${filter}"`;
  if (mask.kind === 'ellipse') {
    return `<ellipse cx="${round(w / 2)}" cy="${round(h / 2)}" rx="${round(w / 2)}" ry="${round(h / 2)}" ${common}/>`;
  }
  if (mask.kind === 'preset') {
    const { outline } = preset(mask.preset, size);
    if (outline !== undefined) return `<path d="${outline}" ${common}/>`;
  }
  const rx = mask.kind === 'rounded' && mask.radius ? ` rx="${round(mask.radius)}"` : '';
  return `<rect width="${w}" height="${h}"${rx} ${common}/>`;
}

/**
 * A CSS mask that fades the outline of a frame: nothing at the edge, all of the photo `feather` mm
 * inside it. The mask is an SVG image the size of the frame (so it follows the shape of the
 * frame's own mask): the shape drawn eroded by half the feather, then blurred by a quarter of it
 * either way. The width is held to half the short side, so the middle of the photo is always seen.
 * Undefined when there is no feather.
 */
export function featherCss(
  mask: Mask,
  size: { w: Mm; h: Mm },
  feather: Mm,
): FeatherCss | undefined {
  if (!(feather > 0 && size.w > 0 && size.h > 0)) return undefined;
  const width = Math.min(feather, Math.min(size.w, size.h) / 2);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(size.w)} ${round(size.h)}" preserveAspectRatio="none">` +
    `<filter id="f" x="0" y="0" width="1" height="1">` +
    `<feMorphology operator="erode" radius="${round(width / 2)}"/>` +
    `<feGaussianBlur stdDeviation="${round(width / 4)}"/>` +
    `</filter>${shapeSvg(mask, size, 'url(#f)')}</svg>`;
  // encodeURIComponent leaves ' ( ) alone: a data URI with none of them needs no quoting care.
  const uri = encodeURIComponent(svg).replace(
    /['()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return {
    maskImage: `url("data:image/svg+xml,${uri}")`,
    maskSize: '100% 100%',
    maskRepeat: 'no-repeat',
  };
}
