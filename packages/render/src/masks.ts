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
