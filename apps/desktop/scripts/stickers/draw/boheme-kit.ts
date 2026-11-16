/** Palette and helpers of the "Bohème" set (see `boheme.ts`). */
import { stroke } from './core.ts';

/** Bohème palette. */
export const P = {
  peach: '#f6b48f',
  apricot: '#f9cfae',
  mustard: '#f7c85c',
  sand: '#f3dcae',
  terracotta: '#c8775c',
  clay: '#b9705a',
  sage: '#a9c3b4',
  teal: '#3e9a96',
  tealDark: '#2f6f7a',
  plum: '#5c2346',
  coral: '#f26d5b',
  coralLight: '#f79a7d',
  red: '#e2523f',
  pink: '#ee6b7d',
  leaf: '#3f8f63',
  leafDark: '#2a6b4c',
  leafLight: '#7cbf7a',
};

/** The thin line of the bohème line art. */
export const line = (d: string, w = 3.2): string[] =>
  stroke(d, w, { roughness: 0.35, bowing: 0.3 });

/** A pointed petal standing on (0, 0), pointing up, length r, width k·r. */
export const petal = (r: number, k = 0.38): string =>
  `M0 0C${r * k} ${-r * 0.25} ${r * k} ${-r * 0.75} 0 ${-r}C${-r * k} ${-r * 0.75} ${-r * k} ${-r * 0.25} 0 0Z`;

/** A rounded petal standing on (0, 0). */
export const roundPetal = (r: number, k = 0.55): string =>
  `M0 0C${r * k} ${-r * 0.1} ${r * k * 1.1} ${-r} 0 ${-r}C${-r * k * 1.1} ${-r} ${-r * k} ${-r * 0.1} 0 0Z`;

/** `n` copies of a petal path rotated around (cx, cy). */
export function ring(
  cx: number,
  cy: number,
  n: number,
  d: string,
  colour: string,
  offset = 0,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = offset + (360 / n) * i;
    out.push(
      `<path transform="translate(${cx} ${cy}) rotate(${Math.round(a * 10) / 10})" d="${d}" fill="${colour}"/>`,
    );
  }
  return out;
}

/** A leaf from (x, y) along angle `deg`, length l. */
export function leaf(
  x: number,
  y: number,
  l: number,
  deg: number,
  colour: string,
  k = 0.32,
): string {
  return `<path transform="translate(${x} ${y}) rotate(${deg})" d="M0 0C${l * 0.3} ${-l * k} ${l * 0.75} ${-l * k} ${l} 0C${l * 0.75} ${l * k} ${l * 0.3} ${l * k} 0 0Z" fill="${colour}"/>`;
}
