import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Crop, PhotoElement } from '@travelbook/core';
import { makeDerivative } from '../src/main/export/derivatives';
import { launchApp } from './launch';

/** Largest mean absolute difference between the CSS look and the baked derivative. */
const MAX_MEAN_DIFF = 0.02;

const NEUTRAL: PhotoElement['adjust'] = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  grayscale: 0,
  sepia: 0,
  vignette: 0,
};

const PIXEL = { w: 1600, h: 1000 };
const FRAME = { w: 90, h: 60 };
const CROP: Crop = { cx: 0.4, cy: 0.5, scale: 1.5 };

/** A smooth stand-in for a photo, with saturated colours so every filter has something to move. */
const PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${PIXEL.w}" height="${PIXEL.h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#2b6cb0"/><stop offset="0.5" stop-color="#f6ad55"/><stop offset="1" stop-color="#9f7aea"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="500" cy="420" r="260" fill="#e53e3e" fill-opacity="0.75"/>
  <circle cx="1150" cy="620" r="320" fill="#38a169" fill-opacity="0.7"/>
  <rect x="650" y="120" width="500" height="260" fill="#ffffff" fill-opacity="0.6"/>
</svg>`;

type FixtureWindow = { __fixture: { parity: { mount(spec: unknown): void } } };

const CASES: { name: string; adjust: Partial<PhotoElement['adjust']>; feather?: number }[] = [
  { name: 'brightness', adjust: { brightness: 1.25 } },
  { name: 'contrast', adjust: { contrast: 1.3 } },
  { name: 'saturation', adjust: { saturation: 1.5 } },
  { name: 'grayscale', adjust: { grayscale: 0.8 } },
  { name: 'sepia', adjust: { sepia: 0.6 } },
  { name: 'vignette', adjust: { vignette: 0.6 } },
  { name: 'feather', adjust: {}, feather: 5 },
  {
    name: 'saturation 1.3 + contrast 1.1 + vignette .4',
    adjust: { saturation: 1.3, contrast: 1.1, vignette: 0.4 },
  },
  {
    name: 'everything',
    adjust: {
      brightness: 1.1,
      contrast: 1.15,
      saturation: 0.8,
      grayscale: 0.3,
      sepia: 0.3,
      vignette: 0.5,
    },
    feather: 4,
  },
];

const dataUrl = (type: string, bytes: Buffer): string =>
  `data:${type};base64,${bytes.toString('base64')}`;

async function raw(png: Buffer): Promise<Buffer> {
  return sharp(png).removeAlpha().raw().toBuffer();
}

test('the baked derivative matches the CSS look of the editor', async () => {
  const work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-deriv-'));
  const previous = process.env['TB_RENDER_FIXTURE'];
  process.env['TB_RENDER_FIXTURE'] = '1';
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => '__fixture' in window);
    const original = join(work, 'original.jpg');
    await writeFile(original, await sharp(Buffer.from(PHOTO_SVG)).jpeg({ quality: 95 }).toBuffer());
    const originalUrl = dataUrl('image/jpeg', await readFile(original));
    const measured: string[] = [];
    for (const c of CASES) {
      const adjust = { ...NEUTRAL, ...c.adjust };
      const edge = c.feather ? { feather: c.feather } : null;
      for (const flipH of [false, true]) {
        const d = await makeDerivative(
          original,
          PIXEL,
          FRAME,
          CROP,
          { h: flipH, v: false },
          { adjust, edge },
          { dpi: 300, nativeResolution: false },
          work,
        );
        const type = d.file.endsWith('.png') ? 'image/png' : 'image/jpeg';
        await page.evaluate(
          (spec) => (window as unknown as FixtureWindow).__fixture.parity.mount(spec),
          {
            crop: CROP,
            flipH,
            adjust,
            edge,
            preview: originalUrl,
            export: dataUrl(type, await readFile(d.file)),
          },
        );
        for (const q of ['preview', 'export']) {
          await page.waitForFunction(
            (id) =>
              [...document.querySelectorAll(`[data-testid="${id}"] img`)].every(
                (i) => (i as HTMLImageElement).complete,
              ),
            q,
          );
        }
        const [p, e] = await Promise.all(
          ['preview', 'export'].map(async (q) => raw(await page.getByTestId(q).screenshot())),
        );
        let sum = 0;
        for (let i = 0; i < (p as Buffer).length; i++)
          sum += Math.abs((p as Buffer)[i]! - (e as Buffer)[i]!);
        const mad = sum / (p as Buffer).length / 255;
        measured.push(`${c.name}${flipH ? ' (flipH)' : ''}: ${(mad * 100).toFixed(2)} %`);
        expect(mad, `${c.name} flipH=${flipH}`).toBeLessThan(MAX_MEAN_DIFF);
      }
    }
    test.info().annotations.push({ type: 'MAD', description: measured.join('; ') });
    console.log(measured.join('\n'));
  } finally {
    await app.close();
    if (previous === undefined) delete process.env['TB_RENDER_FIXTURE'];
    else process.env['TB_RENDER_FIXTURE'] = previous;
    await rm(work, { recursive: true, force: true });
  }
});
