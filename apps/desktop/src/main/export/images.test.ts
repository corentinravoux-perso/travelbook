import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newBook, type Book } from '@travelbook/core';
import type { ExportOptions } from '../../shared/api';
import {
  ExportCancelledError,
  cancelExport,
  exportJobLookup,
  pageLabel,
  pixelSize,
  renderPageTargets,
  runImageExport,
  type ExportRenderer,
} from './images';

const OPTIONS: ExportOptions = {
  route: 'images',
  pages: 'all',
  includeCover: false,
  dpi: 300,
  nativeResolution: false,
  bleed: true,
  cropMarks: false,
  imageFormat: 'jpeg',
  jpegQuality: 98,
  perSpread: false,
  coverMode: 'flat',
  outDir: '/out',
};

/** 24 pages: first spread, 11 inner spreads, last spread. A4, 3 mm bleed, 6 mm spine. */
const book = (): Book => ({ ...newBook({ title: 'x' }), spineWidth: 6 });

describe('renderPageTargets', () => {
  it('gives one target per page, the first page being the right page of the first spread', () => {
    const b = book();
    const targets = renderPageTargets(b, OPTIONS);
    expect(targets).toHaveLength(24);
    expect(targets[0]).toEqual({
      name: 'page-001',
      spreadId: b.spreads[0]?.id,
      clip: { x: 207, y: -3, w: 216, h: 303 },
    });
    expect(targets.map((t) => t.name).slice(1, 4)).toEqual(['page-002', 'page-003', 'page-004']);
    expect(targets[23]).toMatchObject({
      name: 'page-024',
      spreadId: b.spreads[12]?.id,
      clip: { x: -3, y: -3, w: 216, h: 303 },
    });
    // Every page has the same size, so that the files print alike.
    expect(new Set(targets.map((t) => `${t.clip.w}x${t.clip.h}`))).toEqual(new Set(['216x303']));
  });

  it('cuts a page at its trim box when there is no bleed', () => {
    const [first, second] = renderPageTargets(book(), { ...OPTIONS, bleed: false });
    expect(first?.clip).toEqual({ x: 210, y: 0, w: 210, h: 297 });
    expect(second?.clip).toEqual({ x: 0, y: 0, w: 210, h: 297 });
  });

  it('keeps the pages of a range, by page number', () => {
    const targets = renderPageTargets(book(), { ...OPTIONS, pages: { from: 5, to: 8 } });
    expect(targets.map((t) => t.name)).toEqual(['page-005', 'page-006', 'page-007', 'page-008']);
  });

  it('gives the first spread, the doubles and the last spread per double page', () => {
    const targets = renderPageTargets(book(), { ...OPTIONS, perSpread: true });
    expect(targets).toHaveLength(13);
    expect(targets[0]?.name).toBe('page-001');
    expect(targets[1]).toMatchObject({
      name: 'double-002-003',
      clip: { x: -3, y: -3, w: 426, h: 303 },
    });
    expect(targets[11]?.name).toBe('double-022-023');
    expect(targets[12]?.name).toBe('page-024');
  });

  it('puts the cover first: one flat sheet, or front, back and spine', () => {
    const b = book();
    const flat = renderPageTargets(b, { ...OPTIONS, includeCover: true });
    expect(flat).toHaveLength(25);
    expect(flat[0]).toEqual({
      name: 'couverture-a-plat',
      spreadId: b.cover.id,
      clip: { x: -3, y: -3, w: 432, h: 303 },
    });
    const panels = renderPageTargets(b, { ...OPTIONS, includeCover: true, coverMode: 'panels' });
    expect(panels).toHaveLength(27);
    expect(panels.slice(0, 3).map((t) => t.name)).toEqual([
      'couverture-avant',
      'couverture-dos',
      'couverture-tranche',
    ]);
    expect(panels[0]?.clip).toEqual({ x: 213, y: -3, w: 216, h: 303 });
    expect(panels[1]?.clip).toEqual({ x: -3, y: -3, w: 216, h: 303 });
    expect(panels[2]?.clip).toEqual({ x: 210, y: -3, w: 6, h: 303 });
  });

  it('leaves the cover out unless asked, whatever the page range', () => {
    expect(renderPageTargets(book(), { ...OPTIONS, pages: { from: 1, to: 2 } })).toHaveLength(2);
    const withCover = renderPageTargets(book(), {
      ...OPTIONS,
      includeCover: true,
      pages: { from: 1, to: 2 },
    });
    expect(withCover.map((t) => t.name)).toEqual(['couverture-a-plat', 'page-001', 'page-002']);
  });
});

describe('pixelSize', () => {
  it('gives 2551 x 3579 px for A4 with bleed and 2480 x 3508 px without, at 300 dpi', () => {
    expect(pixelSize({ x: 0, y: 0, w: 216, h: 303 }, 300)).toEqual({ w: 2551, h: 3579 });
    expect(pixelSize({ x: 0, y: 0, w: 210, h: 297 }, 300)).toEqual({ w: 2480, h: 3508 });
  });
});

describe('pageLabel', () => {
  it('names a target the way a person counts', () => {
    expect(pageLabel('page-003')).toBe('page 3');
    expect(pageLabel('double-002-003')).toBe('double page 2-3');
    expect(pageLabel('couverture-dos')).toBe('couverture (dos)');
    expect(pageLabel('couverture-a-plat')).toBe('couverture (à plat)');
  });
});

describe('runImageExport', () => {
  let work: string;
  beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), 'travelbook-images-test-'));
  });
  afterEach(() => rm(work, { recursive: true, force: true }));

  /** A window that "captures" a flat grey page of the size asked for. */
  const renderer = (shown: string[] = [], onShow?: () => void): ExportRenderer => ({
    show: async (job) => {
      shown.push(job.token);
      onShow?.();
    },
    capture: async (target, dpi) => {
      const { w, h } = pixelSize(target.clip, dpi);
      return sharp({ create: { width: w, height: h, channels: 4, background: '#808080' } })
        .png()
        .toBuffer();
    },
    print: async () => {
      throw new Error('print is not used by the images route');
    },
    close: () => undefined,
  });
  const options = (outDir: string, patch: Partial<ExportOptions> = {}): ExportOptions => ({
    ...OPTIONS,
    dpi: 50,
    pages: { from: 1, to: 3 },
    outDir,
    ...patch,
  });

  it('writes one file per page, with the size and dpi asked, and unregisters its token', async () => {
    const out = join(work, 'out');
    const shown: string[] = [];
    const seen: string[] = [];
    const report = await runImageExport(book(), work, options(out), {
      openRenderer: async () =>
        renderer(shown, () => seen.push(String(exportJobLookup(shown[0]!)?.dir))),
      onProgress: () => undefined,
    });
    expect(report.pages).toBe(3);
    expect(await readdir(out)).toEqual(['page-001.jpg', 'page-002.jpg', 'page-003.jpg']);
    const meta = await sharp(join(out, 'page-002.jpg')).metadata();
    expect([meta.width, meta.height, meta.density, meta.space]).toEqual([425, 596, 50, 'srgb']);
    expect(new Set(shown).size).toBe(1);
    expect(seen[0], 'the route knows the export while a page is drawn').toMatch(/derivatives$/);
    expect(exportJobLookup(shown[0]!)).toBeUndefined();
  });

  it('removes what it wrote and rejects when cancelled, after the page it is on', async () => {
    const out = join(work, 'out');
    let shown = 0;
    const failure = runImageExport(book(), work, options(out), {
      openRenderer: async () =>
        renderer([], () => {
          shown += 1;
          if (shown === 2) cancelExport();
        }),
      onProgress: () => undefined,
    });
    await expect(failure).rejects.toBeInstanceOf(ExportCancelledError);
    expect(shown).toBe(2);
    expect(await readdir(out)).toEqual([]);
  });

  it('removes what it wrote when a page fails, and refuses a second export meanwhile', async () => {
    const out = join(work, 'out');
    let shown = 0;
    let second: Promise<unknown> | undefined;
    const failing: ExportRenderer = {
      ...renderer(),
      show: async () => {
        shown += 1;
        second ??= runImageExport(book(), work, options(out), {
          openRenderer: async () => renderer(),
          onProgress: () => undefined,
        }).catch((error: unknown) => (error as Error).message);
        if (shown === 3) throw new Error('capture failed');
      },
    };
    await expect(
      runImageExport(book(), work, options(out), {
        openRenderer: async () => failing,
        onProgress: () => undefined,
      }),
    ).rejects.toThrow('capture failed');
    expect(await second).toMatch(/déjà en cours/);
    expect(await readdir(out)).toEqual([]);
  });
});
