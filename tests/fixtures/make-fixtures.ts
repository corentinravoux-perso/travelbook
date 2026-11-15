/**
 * Builds the synthetic image fixtures used by the main-process tests into `tests/fixtures/out/`
 * (git-ignored). Nothing here is a real photograph. Idempotent: existing files are kept.
 *
 *   npm run fixtures            build whatever is missing
 *   ensureFixtures()            same, from a test
 *   `setup` export              lets Vitest use this file as a `globalSetup`
 */
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

export const FIXTURES_DIR = join(import.meta.dirname, 'out');

/** File names, in build order (`truncated.jpg` is cut from `small.jpg`). */
export const FIXTURE_NAMES = [
  'landscape.jpg',
  'portrait-o6.jpg',
  'pano.jpg',
  'small.jpg',
  'truncated.jpg',
  'alpha.png',
  'opaque.png',
  'évasion n°1.jpg',
  'script.svg',
  'plain.svg',
  'day1.jpg',
  'day2.jpg',
] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];

export function fixturePath(name: FixtureName): string {
  // Accented names are stored in NFC whatever the editor or the OS normalises to.
  return join(FIXTURES_DIR, name.normalize('NFC'));
}

/**
 * A gradient with a red square in the top-left corner and a blue bar on the left edge, so that
 * a wrong orientation or a wrong crop is visible to the eye. Shapes only: no fonts needed.
 */
function patternSvg(w: number, h: number): string {
  const s = Math.round(Math.min(w, h) / 8);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f2c14e"/>
      <stop offset="0.5" stop-color="#4f9d69"/>
      <stop offset="1" stop-color="#2b4c7e"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <circle cx="${w * 0.6}" cy="${h * 0.45}" r="${h * 0.22}" fill="#ffffff" fill-opacity="0.55"/>
  <rect x="0" y="${s * 2}" width="${s / 2}" height="${h - s * 2}" fill="#1d3557"/>
  <rect x="0" y="0" width="${s}" height="${s}" fill="#e63946"/>
</svg>`;
}

async function jpeg(
  w: number,
  h: number,
  options: { orientation?: number; takenAt?: string } = {},
): Promise<Buffer> {
  let image = sharp(Buffer.from(patternSvg(w, h))).jpeg({ quality: 85 });
  // Sets the EXIF Orientation tag only: the stored pixels are not rotated.
  if (options.orientation !== undefined)
    image = image.withMetadata({ orientation: options.orientation });
  // `DateTimeOriginal` lives in the Exif sub-directory (IFD2) of the metadata sharp writes.
  if (options.takenAt !== undefined)
    image = image.withExifMerge({ IFD2: { DateTimeOriginal: options.takenAt } });
  return image.toBuffer();
}

/** 400 x 300, transparent corners and a half-transparent disc. */
const ALPHA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
  <ellipse cx="200" cy="150" rx="190" ry="140" fill="#e63946"/>
  <circle cx="200" cy="150" r="80" fill="#ffffff" fill-opacity="0.5"/>
</svg>`;

async function alphaPng(): Promise<Buffer> {
  return sharp(Buffer.from(ALPHA_SVG)).png().toBuffer();
}

async function opaquePng(): Promise<Buffer> {
  return sharp(Buffer.from(ALPHA_SVG))
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .png()
    .toBuffer();
}

const PLAIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <rect width="200" height="100" fill="#3366cc"/>
  <circle cx="100" cy="50" r="30" fill="#ffcc00"/>
</svg>
`;

const SCRIPT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100" onload="alert('onload')">
  <script>alert('script')</script>
  <rect width="200" height="100" fill="#3366cc" onclick="alert('onclick')"/>
  <circle cx="100" cy="50" r="30" fill="#ffcc00"/>
</svg>
`;

/** EXIF capture times of `day1.jpg` and `day2.jpg`: two different days, in EXIF's own notation. */
export const DAY_1 = '2026:06:10 14:30:00';
export const DAY_2 = '2026:06:11 09:05:00';

const BUILDERS: Record<FixtureName, () => Promise<Buffer | string>> = {
  'landscape.jpg': () => jpeg(6000, 4000),
  'portrait-o6.jpg': () => jpeg(6000, 4000, { orientation: 6 }),
  'pano.jpg': () => jpeg(12000, 3000),
  'small.jpg': () => jpeg(800, 600),
  'truncated.jpg': async () => {
    const whole = await readFile(fixturePath('small.jpg'));
    if (whole.length <= 4096) throw new Error('small.jpg is too small to truncate at 4 kB');
    return whole.subarray(0, 4096);
  },
  'alpha.png': alphaPng,
  'opaque.png': opaquePng,
  'évasion n°1.jpg': () => jpeg(1200, 800),
  'script.svg': async () => SCRIPT_SVG,
  'plain.svg': async () => PLAIN_SVG,
  // Two photos shot on different days (EXIF DateTimeOriginal, camera wall-clock digits).
  'day1.jpg': () => jpeg(3000, 2000, { takenAt: DAY_1 }),
  'day2.jpg': () => jpeg(2000, 3000, { takenAt: DAY_2 }),
};

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/** Build every fixture that is not on disk yet. Returns the names it created. */
export async function ensureFixtures(): Promise<FixtureName[]> {
  await mkdir(FIXTURES_DIR, { recursive: true });
  const created: FixtureName[] = [];
  // Sequential: the largest images are tens of megapixels.
  for (const name of FIXTURE_NAMES) {
    const path = fixturePath(name);
    if (await exists(path)) continue;
    const data = await BUILDERS[name]();
    // Write then rename, so an interrupted run never leaves a half-written fixture behind.
    const tmp = `${path}.tmp`;
    try {
      await writeFile(tmp, data);
      await rename(tmp, path);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
    created.push(name);
  }
  return created;
}

/** Vitest `globalSetup` entry point. */
export async function setup(): Promise<void> {
  await ensureFixtures();
}

if (import.meta.main) {
  const created = await ensureFixtures();
  console.log(
    created.length === 0
      ? `Fixtures up to date in ${FIXTURES_DIR}`
      : `Built ${created.length} fixture(s) in ${FIXTURES_DIR}: ${created.join(', ')}`,
  );
}
