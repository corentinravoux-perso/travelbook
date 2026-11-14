import type { Mm } from '@travelbook/core';

/** A number with at most 4 decimals: sub-micron noise would only make the DOM unreadable. */
export const round = (n: number, decimals = 4): number => {
  const k = 10 ** decimals;
  return Math.round(n * k) / k || 0;
};

/** A CSS length in millimetres. */
export const mm = (n: Mm): string => `${round(n)}mm`;

/** A CSS percentage. */
export const pct = (n: number): string => `${round(n, 3)}%`;

/** A CSS `url()` of any string: quotes and backslashes are escaped, so a URL cannot end it early. */
export const cssUrl = (url: string): string =>
  `url("${url.replace(/[\\"]/g, '\\$&').replace(/\n/g, '\\a ')}")`;
