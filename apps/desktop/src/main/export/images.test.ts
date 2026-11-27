import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newBook, newElement, type Book, type Spread } from '@travelbook/core';
import type { ExportOptions } from '../../shared/api';
import {
  ExportCancelledError,
  cancelExport,
  exportJobLookup,
  pageLabel,
  pageOnly,
  pixelSize,
  renderPageTargets,
  runImageExport,
  type ExportRenderer,
} from './images';
import { STAGING_PREFIX } from './staging';

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
      side: 'right',
    });
    expect(targets.map((t) => t.name).slice(1, 4)).toEqual(['page-002', 'page-003', 'page-004']);
    expect(targets[23]).toMatchObject({
      name: 'page-024',
      spreadId: b.spreads[12]?.id,
      clip: { x: -3, y: -3, w: 216, h: 303 },
      side: 'left',
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
    const b = book();
    const targets = renderPageTargets(b, { ...OPTIONS, perSpread: true });
    expect(targets).toHaveLength(13);
    expect(targets[0]).toMatchObject({ name: 'page-001', side: 'right' });
    // A double page is the whole spread: no side, nothing left out.
    expect(targets[1]).toEqual({
      name: 'double-002-003',
      spreadId: b.spreads[1]?.id,
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

describe('pageOnly', () => {
  /** A4 spread: the spine is at x = 210 mm. */
  const spreadWith = (b: Book): Spread => ({
    ...b.spreads[1]!,
    background: {
      spread: { kind: 'color', color: '#eeeeee' },
      left: { kind: 'color', color: '#ff0000' },
      right: { kind: 'color', color: '#0000ff' },
    },
    elements: [
      { ...newElement('photo', { x: 20, y: 20, w: 100, h: 80 }), id: 'left' },
      // Flush with the spine, on the right page: a left page's bleed reaches it.
      { ...newElement('photo', { x: 210, y: 20, w: 100, h: 80 }), id: 'right' },
      // A panorama across the spine.
      { ...newElement('photo', { x: 150, y: 150, w: 120, h: 80 }), id: 'across' },
      // Snapped a hair short of the spine: still on the left page alone.
      { ...newElement('text', { x: 100, y: 250, w: 109.95, h: 20 }), id: 'short' },
    ],
  });

  it("leaves the other page's background and elements out, and keeps what crosses the spine", () => {
    const b = book();
    const left = pageOnly(b, spreadWith(b), 'left');
    expect(left.elements.map((e) => e.id)).toEqual(['left', 'across', 'short']);
    expect(Object.keys(left.background).sort()).toEqual(['left', 'spread']);
    const right = pageOnly(b, spreadWith(b), 'right');
    expect(right.elements.map((e) => e.id)).toEqual(['right', 'across']);
    expect(Object.keys(right.background).sort()).toEqual(['right', 'spread']);
  });

  it('judges a rotated element by the box it covers', () => {
    const b = book();
    // 100 x 10 mm centred 4 mm right of the spine, turned upright: it covers 205 to 215 mm.
    const tilted = { ...newElement('shape', { x: 164, y: 100, w: 100, h: 10 }), rotation: 90 };
    const spread = { ...b.spreads[1]!, elements: [tilted] };
    expect(pageOnly(b, spread, 'left').elements).toHaveLength(1);
    expect(pageOnly(b, spread, 'right').elements).toHaveLength(1);
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

  it("hands the page the album's bundled fonts and the page alone, without the facing page", async () => {
    const out = join(work, 'out');
    const b = book();
    const spreads = [...b.spreads];
    // Page 3 has a text flush with the spine: page 2's bleed reaches it, page 2 must not draw it.
    spreads[1] = {
      ...spreads[1]!,
      elements: [{ ...newElement('text', { x: 210, y: 20, w: 50, h: 20 }), id: 'on-page-3' }],
    };
    const fonts = [{ family: 'Pacifico', weight: 400, style: 'normal' as const, url: 'tb://x' }];
    const jobs: { fonts: unknown; ids: string[] }[] = [];
    const base = renderer();
    await runImageExport({ ...b, spreads }, work, options(out), {
      openRenderer: async () => ({
        ...base,
        show: async (job) => {
          jobs.push({ fonts: job.fonts, ids: job.spread.elements.map((e) => e.id) });
        },
      }),
      onProgress: () => undefined,
      fonts,
    });
    expect(jobs.map((j) => j.fonts)).toEqual([fonts, fonts, fonts]);
    expect(jobs.map((j) => j.ids)).toEqual([[], [], ['on-page-3']]);
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

  describe('into a folder that holds an earlier export', () => {
    const deps = (open: () => ExportRenderer = renderer) => ({
      openRenderer: async () => open(),
      onProgress: () => undefined,
    });
    /** Width in px of each file of `dir`, by name. */
    const widths = async (dir: string): Promise<Record<string, number | undefined>> =>
      Object.fromEntries(
        await Promise.all(
          (await readdir(dir))
            .filter((name) => name.endsWith('.jpg'))
            .map(async (name) => [name, (await sharp(join(dir, name)).metadata()).width] as const),
        ),
      );
    /** The earlier export: three pages at 50 dpi (425 px wide), and a file of the user's. */
    const earlier = async (out: string): Promise<void> => {
      await runImageExport(book(), work, options(out), deps());
      await writeFile(join(out, 'notes.txt'), 'mine');
    };
    const EARLIER = { 'page-001.jpg': 425, 'page-002.jpg': 425, 'page-003.jpg': 425 };

    it('keeps it intact when the new export is cancelled', async () => {
      const out = join(work, 'out');
      await earlier(out);
      let shown = 0;
      const failure = runImageExport(
        book(),
        work,
        options(out, { dpi: 60 }),
        deps(() =>
          renderer([], () => {
            shown += 1;
            if (shown === 2) cancelExport();
          }),
        ),
      );
      await expect(failure).rejects.toBeInstanceOf(ExportCancelledError);
      expect((await readdir(out)).sort()).toEqual(['notes.txt', ...Object.keys(EARLIER)]);
      expect(await widths(out)).toMatchObject(EARLIER);
      expect(await readFile(join(out, 'notes.txt'), 'utf8')).toBe('mine');
    });

    it('keeps it intact when a page of the new export fails', async () => {
      const out = join(work, 'out');
      await earlier(out);
      let shown = 0;
      const failing: ExportRenderer = {
        ...renderer(),
        show: async () => {
          shown += 1;
          if (shown === 3) throw new Error('capture failed');
        },
      };
      await expect(
        runImageExport(
          book(),
          work,
          options(out, { dpi: 60 }),
          deps(() => failing),
        ),
      ).rejects.toThrow('capture failed');
      expect((await readdir(out)).sort()).toEqual(['notes.txt', ...Object.keys(EARLIER)]);
      expect(await widths(out)).toMatchObject(EARLIER);
    });

    it('replaces it, and nothing else, when the new export completes', async () => {
      const out = join(work, 'out');
      await earlier(out);
      const report = await runImageExport(book(), work, options(out, { dpi: 60 }), deps());
      expect(report.files).toEqual(
        ['page-001.jpg', 'page-002.jpg', 'page-003.jpg'].map((f) => join(out, f)),
      );
      expect((await readdir(out)).sort()).toEqual(['notes.txt', ...Object.keys(EARLIER)]);
      // 60 dpi: 510 px wide.
      expect(await widths(out)).toMatchObject({
        'page-001.jpg': 510,
        'page-002.jpg': 510,
        'page-003.jpg': 510,
      });
    });

    it('writes the new pages out of the way until the export is complete', async () => {
      const out = join(work, 'out');
      await earlier(out);
      let shown = 0;
      let during: {
        names: string[];
        widths: Record<string, number | undefined>;
        staged: string[];
      } = {
        names: [],
        widths: {},
        staged: [],
      };
      const watching: ExportRenderer = {
        ...renderer(),
        show: async () => {
          shown += 1;
          if (shown !== 3) return;
          // Pages 1 and 2 of the new export are done, page 3 is being drawn.
          const names = await readdir(out);
          const staging = names.find((n) => n.startsWith(STAGING_PREFIX)) as string;
          during = {
            names: names.filter((n) => n !== staging).sort(),
            widths: await widths(out),
            staged: (await readdir(join(out, staging))).sort(),
          };
        },
      };
      await runImageExport(
        book(),
        work,
        options(out, { dpi: 60 }),
        deps(() => watching),
      );
      expect(during.names).toEqual(['notes.txt', ...Object.keys(EARLIER)]);
      expect(during.widths).toMatchObject(EARLIER);
      expect(during.staged).toEqual(['page-001.jpg', 'page-002.jpg']);
    });

    it('removes the staging folders a crashed run left in the folder', async () => {
      const out = join(work, 'out');
      await mkdir(join(out, `${STAGING_PREFIX}crashed`), { recursive: true });
      await writeFile(join(out, `${STAGING_PREFIX}crashed`, 'page-001.jpg'), 'half');
      await runImageExport(book(), work, options(out), deps());
      expect(await readdir(out)).toEqual(['page-001.jpg', 'page-002.jpg', 'page-003.jpg']);
    });
  });
});
