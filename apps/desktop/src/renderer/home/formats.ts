/** Page formats offered when creating a book (spec §7.2). All sizes in mm. */
export interface FormatPreset {
  id: string;
  width: number;
  height: number;
}

/** A4 portrait first: it is the default. 21 × 21, 30 × 30 and 24 × 32 are in cm in the spec. */
export const FORMAT_PRESETS: readonly FormatPreset[] = [
  { id: 'a4-portrait', width: 210, height: 297 },
  { id: 'a4-landscape', width: 297, height: 210 },
  { id: 'a5', width: 148, height: 210 },
  { id: 'square-21', width: 210, height: 210 },
  { id: 'square-30', width: 300, height: 300 },
  { id: 'portrait-24x32', width: 240, height: 320 },
];

export const DEFAULT_FORMAT = FORMAT_PRESETS[0]!;

/** Bounds of a free width or height, in mm. */
export const MIN_SIDE_MM = 50;
export const MAX_SIDE_MM = 600;

/** The preset with exactly these sizes, if any. */
export function matchPreset(width: number, height: number): FormatPreset | undefined {
  return FORMAT_PRESETS.find((p) => p.width === width && p.height === height);
}

/**
 * Read a field typed by the user: a number of mm (a comma is accepted as the decimal mark), or
 * `null` when it is empty, not a number or outside the bounds.
 */
export function parseSide(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= MIN_SIDE_MM && value <= MAX_SIDE_MM ? value : null;
}
