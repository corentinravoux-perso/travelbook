import type { Book } from '@travelbook/core';
import { MAX_SIDE_MM, MIN_SIDE_MM } from '../home/formats';

/** Allowed ranges of the numeric fields; the dialog shows them in its help texts. */
export const RANGES = {
  side: { min: MIN_SIDE_MM, max: MAX_SIDE_MM },
  bleed: { min: 0, max: 10 },
  coverBleed: { min: 0, max: 20 },
  safeMargin: { min: 0, max: 30 },
  spineWidth: { min: 0, max: 100 },
  pageMin: { min: 2, max: 400 },
  dpi: { min: 50, max: 1200 },
} as const;

export const PAGE_MULTIPLES = [1, 2, 4] as const;

/** What the user typed, field by field. */
export interface SettingsText {
  width: string;
  height: string;
  scaleContent: boolean;
  bleed: string;
  coverBleed: string;
  safeMargin: string;
  spineWidth: string;
  pageMin: string;
  pageMultiple: 1 | 2 | 4;
  frenchTypography: boolean;
  dpiGood: string;
  dpiLow: string;
}

const text = (n: number): string => String(Math.round(n * 1000) / 1000);

export function settingsText(book: Book): SettingsText {
  return {
    width: text(book.format.width),
    height: text(book.format.height),
    scaleContent: true,
    bleed: text(book.bleed),
    coverBleed: text(book.coverBleed),
    safeMargin: text(book.safeMargin),
    spineWidth: text(book.spineWidth),
    pageMin: text(book.pageRule.min),
    pageMultiple: book.pageRule.multiple,
    frenchTypography: book.settings.frenchTypography,
    dpiGood: text(book.settings.dpiGood),
    dpiLow: text(book.settings.dpiLow),
  };
}

/** A number typed by the user (a comma is a decimal mark) within `[min, max]`, else `null`. */
export function parseNumber(
  value: string,
  { min, max }: { min: number; max: number },
  whole = false,
): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (!(whole ? /^\d+$/ : /^\d+(\.\d+)?$/).test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= min && n <= max ? n : null;
}

/** The settings once every field is valid. */
export interface SettingsValues {
  format: { width: number; height: number };
  scaleContent: boolean;
  bleed: number;
  coverBleed: number;
  safeMargin: number;
  spineWidth: number;
  pageRule: { min: number; multiple: 1 | 2 | 4 };
  settings: { frenchTypography: boolean; dpiGood: number; dpiLow: number };
}

export type FieldName = Exclude<
  keyof SettingsText,
  'scaleContent' | 'frenchTypography' | 'pageMultiple'
>;

/** The fields that are not valid, and the values when none is. `dpiGood` below `dpiLow` is a fault of `dpiGood`. */
export function validate(t: SettingsText): { values: SettingsValues | null; invalid: FieldName[] } {
  const width = parseNumber(t.width, RANGES.side);
  const height = parseNumber(t.height, RANGES.side);
  const bleed = parseNumber(t.bleed, RANGES.bleed);
  const coverBleed = parseNumber(t.coverBleed, RANGES.coverBleed);
  const safeMargin = parseNumber(t.safeMargin, RANGES.safeMargin);
  const spineWidth = parseNumber(t.spineWidth, RANGES.spineWidth);
  const pageMin = parseNumber(t.pageMin, RANGES.pageMin, true);
  const dpiGood = parseNumber(t.dpiGood, RANGES.dpi);
  const dpiLow = parseNumber(t.dpiLow, RANGES.dpi);
  const invalid: FieldName[] = [];
  const need = (name: FieldName, value: number | null) => value === null && invalid.push(name);
  need('width', width);
  need('height', height);
  need('bleed', bleed);
  need('coverBleed', coverBleed);
  need('safeMargin', safeMargin);
  need('spineWidth', spineWidth);
  need('pageMin', pageMin);
  need('dpiGood', dpiGood);
  need('dpiLow', dpiLow);
  if (dpiGood !== null && dpiLow !== null && dpiGood < dpiLow) invalid.push('dpiGood');
  if (
    invalid.length > 0 ||
    width === null ||
    height === null ||
    bleed === null ||
    coverBleed === null ||
    safeMargin === null ||
    spineWidth === null ||
    pageMin === null ||
    dpiGood === null ||
    dpiLow === null
  ) {
    return { values: null, invalid };
  }
  return {
    invalid: [],
    values: {
      format: { width, height },
      scaleContent: t.scaleContent,
      bleed,
      coverBleed,
      safeMargin,
      spineWidth,
      pageRule: { min: pageMin, multiple: t.pageMultiple },
      settings: { frenchTypography: t.frenchTypography, dpiGood, dpiLow },
    },
  };
}
