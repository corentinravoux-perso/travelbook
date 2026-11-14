import { expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { launchApp } from './launch';

/** Largest mean absolute difference between two renderings of the same view. */
const MAX_MEAN_DIFF = 0.02;

/** What `TextFixture.tsx` measures of a text box. */
type Measure = { box: number; content: number; lines: string[] };

/** The page `src/renderer/render-fixture/RenderFixture.tsx` puts on `window`. */
type FixtureWindow = {
  __fixture: {
    crops(): { id: string; sx: number; sy: number; sw: number; sh: number; w: number; h: number }[];
    mount(images: unknown): void;
    text: {
      mount(): Promise<void>;
      measure(): { view: Measure; editor: Measure };
    };
  };
};

const SIZE = { w: 1600, h: 1000 };

/** A smooth stand-in for a photo: soft shapes, so that a 320 px thumbnail looks like the preview. */
const PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE.w}" height="${SIZE.h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2b6cb0"/><stop offset="0.5" stop-color="#f6ad55"/><stop offset="1" stop-color="#9f7aea"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="500" cy="420" r="260" fill="#e53e3e" fill-opacity="0.75"/>
  <circle cx="1150" cy="620" r="320" fill="#38a169" fill-opacity="0.7"/>
  <rect x="650" y="120" width="500" height="260" fill="#ffffff" fill-opacity="0.6"/>
</svg>`;

const STICKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="400" height="400">
  <circle cx="50" cy="50" r="44" fill="#d69e2e" stroke="#744210" stroke-width="6"/>
  <path d="M30 55 Q50 80 70 55" fill="none" stroke="#744210" stroke-width="6" stroke-linecap="round"/>
  <circle cx="36" cy="38" r="6" fill="#744210"/><circle cx="64" cy="38" r="6" fill="#744210"/>
</svg>`;

const dataUrl = (type: string, bytes: Buffer): string =>
  `data:${type};base64,${bytes.toString('base64')}`;

/** Mean of |a - b| over every channel of two same-size raw images, as a fraction of 255. */
function meanDiff(a: Buffer, b: Buffer): number {
  expect(a.length).toBe(b.length);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs((a[i] as number) - (b[i] as number));
  return sum / a.length / 255;
}

test('thumb, preview and export qualities draw the same spread', async () => {
  const work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-render-'));
  // launchApp passes the environment on: main then loads the fixture page (unpackaged app only).
  const previous = process.env['TB_RENDER_FIXTURE'];
  process.env['TB_RENDER_FIXTURE'] = '1';
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => '__fixture' in window);

    // The derivatives main will make (Task 7.1): the original, cropped to what each frame shows.
    const original = await sharp(Buffer.from(PHOTO_SVG)).jpeg({ quality: 95 }).toBuffer();
    const thumb = await sharp(original).resize(320).jpeg({ quality: 85 }).toBuffer();
    const preview = await sharp(original).resize(SIZE.w).jpeg({ quality: 92 }).toBuffer();
    const crops = await page.evaluate(() => (window as unknown as FixtureWindow).__fixture.crops());
    const exported: Record<string, string> = {};
    for (const c of crops) {
      const pxW = Math.round((c.w / 25.4) * 300);
      const pxH = Math.round((c.h / 25.4) * 300);
      const derivative = await sharp(original)
        .extract({
          left: Math.round(c.sx),
          top: Math.round(c.sy),
          width: Math.min(Math.round(c.sw), SIZE.w - Math.round(c.sx)),
          height: Math.min(Math.round(c.sh), SIZE.h - Math.round(c.sy)),
        })
        .resize(pxW, pxH, { fit: 'fill' })
        .jpeg({ quality: 95 })
        .toBuffer();
      exported[c.id] = dataUrl('image/jpeg', derivative);
    }
    const sticker = dataUrl('image/svg+xml', Buffer.from(STICKER_SVG));
    await page.evaluate((images) => (window as unknown as FixtureWindow).__fixture.mount(images), {
      thumb: dataUrl('image/jpeg', thumb),
      preview: dataUrl('image/jpeg', preview),
      export: exported,
      sticker,
    });

    // All three views have the same size in CSS mm, so their screenshots have the same size.
    const shots: Record<string, Buffer> = {};
    for (const quality of ['thumb', 'preview', 'export']) {
      const view = page.getByTestId(quality);
      await expect(view.locator('img').first()).toBeVisible();
      await page.waitForFunction(
        (q) =>
          [...document.querySelectorAll(`[data-testid="${q}"] img`)].every(
            (i) => (i as HTMLImageElement).complete,
          ),
        quality,
      );
      shots[quality] = await view.screenshot();
    }
    const raw = async (png: Buffer) => {
      const { data, info } = await sharp(png)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { data, w: info.width, h: info.height };
    };
    const [t, p, e] = await Promise.all([
      raw(shots['thumb'] as Buffer),
      raw(shots['preview'] as Buffer),
      raw(shots['export'] as Buffer),
    ]);
    expect([t.w, t.h]).toEqual([p.w, p.h]);
    expect([e.w, e.h]).toEqual([p.w, p.h]);
    expect(meanDiff(t.data, p.data)).toBeLessThan(MAX_MEAN_DIFF);
    expect(meanDiff(e.data, p.data)).toBeLessThan(MAX_MEAN_DIFF);
    // The comparison would pass on a blank page: the preview has to show the photo's colours.
    const { channels } = await sharp(shots['preview'] as Buffer).stats();
    expect((channels[0]?.stdev ?? 0) > 20).toBe(true);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env['TB_RENDER_FIXTURE'];
    else process.env['TB_RENDER_FIXTURE'] = previous;
    await rm(work, { recursive: true, force: true });
  }
});

/** Largest difference in height, in CSS px, between the static text and the editor's. */
const MAX_TEXT_DELTA_PX = 0.5;

test('TextView lays text out like a mounted, non-focused Tiptap editor', async () => {
  const work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-text-'));
  const previous = process.env['TB_RENDER_FIXTURE'];
  process.env['TB_RENDER_FIXTURE'] = '1';
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => '__fixture' in window);
    // Mounting waits for the two @fontsource fonts: no system font takes part.
    await page.evaluate(() => (window as unknown as FixtureWindow).__fixture.text.mount());
    const { view, editor } = await page.evaluate(() =>
      (window as unknown as FixtureWindow).__fixture.text.measure(),
    );
    // The comparison is void on an empty or one-line box.
    expect(view.lines.length).toBeGreaterThan(8);
    expect(view.lines).toEqual(editor.lines);
    expect(Math.abs(view.content - editor.content)).toBeLessThanOrEqual(MAX_TEXT_DELTA_PX);
    expect(Math.abs(view.box - editor.box)).toBeLessThanOrEqual(MAX_TEXT_DELTA_PX);
    // The fonts really loaded, or the check would compare two fallbacks.
    const loaded = await page.evaluate(() => [
      document.fonts.check('16px "Inter"'),
      document.fonts.check('italic 16px "Lora"'),
      [...document.fonts].filter((f) => f.status === 'loaded').length,
    ]);
    expect(loaded[0]).toBe(true);
    expect(loaded[1]).toBe(true);
    expect(loaded[2]).toBeGreaterThanOrEqual(4);
    await page.getByTestId('text-view').screenshot();
  } finally {
    await app.close();
    if (previous === undefined) delete process.env['TB_RENDER_FIXTURE'];
    else process.env['TB_RENDER_FIXTURE'] = previous;
    await rm(work, { recursive: true, force: true });
  }
});
