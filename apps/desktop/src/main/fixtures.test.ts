import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ensureFixtures,
  FIXTURE_NAMES,
  fixturePath,
  type FixtureName,
} from '../../../../tests/fixtures/make-fixtures';

beforeAll(async () => {
  await ensureFixtures();
});

async function meta(name: FixtureName) {
  return sharp(fixturePath(name)).metadata();
}

describe('image fixtures', () => {
  it('builds every listed fixture', async () => {
    for (const name of FIXTURE_NAMES) {
      expect((await stat(fixturePath(name))).size).toBeGreaterThan(0);
    }
  });

  it('is idempotent: a second run builds nothing and leaves the files untouched', async () => {
    const before = await stat(fixturePath('landscape.jpg'));
    expect(await ensureFixtures()).toEqual([]);
    const after = await stat(fixturePath('landscape.jpg'));
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it('has the documented pixel sizes', async () => {
    const sizes = {
      'landscape.jpg': [6000, 4000],
      'pano.jpg': [12000, 3000],
      'small.jpg': [800, 600],
    } as const;
    for (const [name, [width, height]] of Object.entries(sizes)) {
      const m = await meta(name as FixtureName);
      expect([m.format, m.width, m.height, m.orientation]).toEqual([
        'jpeg',
        width,
        height,
        undefined,
      ]);
    }
  });

  it('stores portrait-o6.jpg as 6000 x 4000 with EXIF orientation 6', async () => {
    const m = await meta('portrait-o6.jpg');
    expect([m.width, m.height, m.orientation]).toEqual([6000, 4000, 6]);
  });

  it('cuts truncated.jpg to the first 4096 bytes of a valid JPEG', async () => {
    const [truncated, whole] = await Promise.all([
      readFile(fixturePath('truncated.jpg')),
      readFile(fixturePath('small.jpg')),
    ]);
    expect(truncated).toHaveLength(4096);
    expect(truncated.equals(whole.subarray(0, 4096))).toBe(true);
    // The header is intact but the pixel data is not.
    expect((await meta('truncated.jpg')).format).toBe('jpeg');
    await expect(sharp(truncated, { failOn: 'error' }).raw().toBuffer()).rejects.toThrow();
  });

  it('has one PNG with an alpha channel and one without', async () => {
    expect((await meta('alpha.png')).hasAlpha).toBe(true);
    expect((await meta('opaque.png')).hasAlpha).toBe(false);
  });

  it('keeps the accented name with spaces in NFC', async () => {
    expect(basename(fixturePath('évasion n°1.jpg'))).toBe('évasion n°1.jpg');
    expect((await meta('évasion n°1.jpg')).format).toBe('jpeg');
  });

  it('has an SVG with a script and an onload handler and a plain one without', async () => {
    const script = await readFile(fixturePath('script.svg'), 'utf8');
    expect(script).toContain('<script>');
    expect(script).toMatch(/\sonload=/);
    const plain = await readFile(fixturePath('plain.svg'), 'utf8');
    expect(plain).not.toMatch(/<script|\son\w+=/);
    expect((await meta('plain.svg')).format).toBe('svg');
  });
});
