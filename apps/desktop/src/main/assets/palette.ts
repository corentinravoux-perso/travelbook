import sharp from '../imaging';

/** Most colours `dominantColours` returns. */
export const MAX_COLOURS = 6;

/** Long edge of the small copy of each image the colours are counted on. */
const SAMPLE_EDGE = 32;

/** Pixels more transparent than this are not counted. */
const MIN_ALPHA = 128;

/** Two colours closer than this (Euclidean distance in RGB, out of 441) count as the same one. */
const MIN_DISTANCE = 48;

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
}

const hex = (value: number): string => Math.round(value).toString(16).padStart(2, '0');

/**
 * The dominant colours of some images, as `#rrggbb`, the most present first. Each image is shrunk
 * to a 32 px sample, and its opaque pixels are counted in 4 096 colour buckets (4 bits per
 * channel), all images together. Buckets are then grouped around the fullest one left, taking in
 * every bucket whose mean colour lies within `MIN_DISTANCE` of it (so a colour that straddles two
 * buckets, or a run of shades, counts once); a group is reported as the mean colour of its
 * fullest bucket and ranked by the pixels of all its buckets. The list holds distinct colours
 * and can be shorter than `count`. Rejects when a file is not a readable image.
 */
export async function dominantColours(
  files: readonly string[],
  count: number = MAX_COLOURS,
): Promise<string[]> {
  const buckets = new Map<number, Bucket>();
  for (const file of files) {
    const { data, info } = await sharp(file)
      .resize({ width: SAMPLE_EDGE, height: SAMPLE_EDGE, fit: 'inside' })
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i + 3 < data.length; i += info.channels) {
      if ((data[i + 3] as number) < MIN_ALPHA) continue;
      const r = data[i] as number;
      const g = data[i + 1] as number;
      const b = data[i + 2] as number;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
    }
  }

  // Fullest first; the key breaks ties so that the result does not depend on pixel order.
  const waiting = [...buckets.entries()]
    .sort(([ka, a], [kb, b]) => b.count - a.count || ka - kb)
    .map(([, bucket]) => ({
      count: bucket.count,
      rgb: [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count] as const,
    }));
  const groups: { rgb: readonly [number, number, number]; count: number }[] = [];
  while (waiting.length > 0) {
    const [seed] = waiting.splice(0, 1) as [(typeof waiting)[number]];
    const group = { rgb: seed.rgb, count: seed.count };
    for (let i = waiting.length - 1; i >= 0; i--) {
      const other = waiting[i] as (typeof waiting)[number];
      const distance = Math.hypot(
        other.rgb[0] - seed.rgb[0],
        other.rgb[1] - seed.rgb[1],
        other.rgb[2] - seed.rgb[2],
      );
      if (distance < MIN_DISTANCE) {
        group.count += other.count;
        waiting.splice(i, 1);
      }
    }
    groups.push(group);
  }
  // `sort` is stable: groups of equal size stay in the order of their fullest bucket.
  return groups
    .sort((a, b) => b.count - a.count)
    .slice(0, count)
    .map(({ rgb: [r, g, b] }) => `#${hex(r)}${hex(g)}${hex(b)}`);
}
