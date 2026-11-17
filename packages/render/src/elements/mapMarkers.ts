import type { MapLegMode, MapMarker } from '@travelbook/core';

/**
 * Flat, one-colour glyphs of a map, own drawings. Each is SVG path data in a unit box
 * [-0.5, 0.5] on both axes (y down), to be scaled to a diameter in mm. Vehicles face right (+x).
 */

const r2 = (n: number): number => Math.round(n * 1000) / 1000;

const circle = (cx: number, cy: number, r: number): string =>
  `M${r2(cx - r)} ${r2(cy)}A${r} ${r} 0 1 0 ${r2(cx + r)} ${r2(cy)}A${r} ${r} 0 1 0 ${r2(cx - r)} ${r2(cy)}Z`;

const rect = (x: number, y: number, w: number, h: number): string =>
  `M${x} ${y}H${r2(x + w)}V${r2(y + h)}H${x}Z`;

const polygon = (points: [number, number][]): string =>
  `M${points.map(([x, y]) => `${r2(x)} ${r2(y)}`).join('L')}Z`;

const STAR = polygon(
  Array.from({ length: 10 }, (_, i): [number, number] => {
    const angle = -Math.PI / 2 + (Math.PI * i) / 5;
    const k = i % 2 === 0 ? 0.5 : 0.22;
    return [k * Math.cos(angle), k * Math.sin(angle) + 0.03];
  }),
);

export interface MarkerGlyph {
  /** Path data; paint it with the `evenodd` rule (some glyphs have holes). */
  d: string;
  /** Where the point of the place is: the glyph's centre, or its tip (a pin, a flag). */
  anchor: 'centre' | 'tip';
}

export const MARKER_GLYPHS: Record<MapMarker, MarkerGlyph> = {
  point: { d: circle(0, 0, 0.5), anchor: 'centre' },
  pin: {
    d:
      'M0 0.5C-0.1 0.2 -0.4 0.05 -0.4 -0.1A0.4 0.4 0 0 1 0.4 -0.1C0.4 0.05 0.1 0.2 0 0.5Z' +
      circle(0, -0.1, 0.15),
    anchor: 'tip',
  },
  flag: {
    d: 'M-0.04 0.5V-0.5H0.04V0.5ZM0.04 -0.5L0.5 -0.28L0.04 -0.06Z',
    anchor: 'tip',
  },
  star: { d: STAR, anchor: 'centre' },
  badge: { d: circle(0, 0, 0.5) + circle(0, 0, 0.28), anchor: 'centre' },
  icon: { d: 'M0 -0.5L0.5 0L0 0.5L-0.5 0Z', anchor: 'centre' },
};

const wheels = (...xs: number[]): string => xs.map((x) => circle(x, 0.2, 0.1)).join('');

const PLANE_HALF: [number, number][] = [
  [0.5, 0],
  [0.25, -0.06],
  [0.02, -0.08],
  [-0.14, -0.5],
  [-0.28, -0.5],
  [-0.22, -0.08],
  [-0.4, -0.06],
  [-0.5, -0.2],
];
const PLANE = polygon([
  ...PLANE_HALF,
  ...PLANE_HALF.slice(1)
    .reverse()
    .map(([x, y]): [number, number] => [x, -y]),
]);

/** Vehicle glyphs, facing right. */
export const VEHICLE_GLYPHS: Record<MapLegMode, string> = {
  voiture:
    'M-0.5 0.12V-0.04L-0.34 -0.08L-0.22 -0.28H0.2L0.34 -0.08L0.5 -0.03V0.12Z' + wheels(-0.28, 0.28),
  bus:
    rect(-0.5, -0.3, 1, 0.42) +
    rect(-0.4, -0.22, 0.22, 0.16) +
    rect(-0.1, -0.22, 0.22, 0.16) +
    rect(0.2, -0.22, 0.22, 0.16) +
    wheels(-0.3, 0.3),
  train:
    polygon([
      [-0.5, -0.26],
      [0.34, -0.26],
      [0.5, 0.02],
      [0.5, 0.14],
      [-0.5, 0.14],
    ]) +
    rect(-0.38, -0.18, 0.2, 0.16) +
    rect(-0.1, -0.18, 0.2, 0.16) +
    wheels(-0.32, -0.1, 0.12, 0.34),
  avion: PLANE,
  bateau:
    'M-0.5 0.06H0.5L0.32 0.3H-0.32Z' +
    rect(-0.2, -0.12, 0.35, 0.18) +
    rect(0.0, -0.4, 0.05, 0.28) +
    polygon([
      [0.05, -0.4],
      [0.3, -0.3],
      [0.05, -0.2],
    ]),
  pied:
    circle(0, -0.38, 0.1) +
    polygon([
      [-0.09, -0.26],
      [0.09, -0.26],
      [0.1, 0.06],
      [-0.1, 0.06],
    ]) +
    polygon([
      [-0.1, 0.06],
      [0.0, 0.06],
      [-0.12, 0.5],
      [-0.22, 0.5],
    ]) +
    polygon([
      [0.0, 0.06],
      [0.1, 0.06],
      [0.24, 0.5],
      [0.14, 0.5],
    ]),
};
