import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFStream,
  decodePDFRawStream,
} from 'pdf-lib';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newBook, type Book } from '@travelbook/core';
import type { ExportOptions } from '../../shared/api';
import type { ExportRenderer } from './images';
import { ExportCancelledError, cancelExport } from './images';
import {
  RASTER_FALLBACK_DPI,
  assemblePdf,
  coverAsPagesTargets,
  runPdfExport,
  type PdfPageInput,
} from './pdf';
import { STAGING_PREFIX } from './staging';

const PT = 72 / 25.4;
const OPTIONS: ExportOptions = {
  route: 'pdf',
  pages: 'all',
  includeCover: false,
  dpi: 100,
  nativeResolution: false,
  bleed: true,
  cropMarks: false,
  imageFormat: 'jpeg',
  jpegQuality: 98,
  perSpread: false,
  coverMode: 'flat',
  outDir: '/out',
};

/** A one-page PDF of `w` x `h` points, as Chromium would print a page: a little short of the box. */
async function printed(w: number, h: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([w, h]).drawRectangle({ x: 10, y: 10, width: 50, height: 50 });
  return Buffer.from(await doc.save());
}

/** A box of the first page of a PDF, in mm. */
async function boxMm(
  bytes: Uint8Array,
  name: 'MediaBox' | 'TrimBox' | 'BleedBox',
  index = 0,
): Promise<number[]> {
  const page = (await PDFDocument.load(bytes)).getPage(index);
  const box = page.node.lookup(PDFName.of(name));
  const numbers = (
    box as unknown as { asRectangle(): { x: number; y: number; width: number; height: number } }
  ).asRectangle();
  return [numbers.x, numbers.y, numbers.width, numbers.height].map((v) => v / PT);
}

/** Content stream of a page as text. */
async function contentOf(bytes: Uint8Array, index = 0): Promise<string> {
  const page = (await PDFDocument.load(bytes)).getPage(index);
  const contents = page.node.Contents();
  const streams = contents && 'asArray' in contents ? contents.asArray() : [contents];
  return streams
    .map((ref) => page.doc.context.lookup(ref as never))
    .map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString('latin1'))
    .join('\n');
}

/** Subtype (Form for a printed page, Image for a raster one) of what a page draws. */
async function drawnKinds(bytes: Uint8Array, index: number): Promise<string[]> {
  const page = (await PDFDocument.load(bytes)).getPage(index);
  const xobjects = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
  return (xobjects?.keys() ?? []).map((key) => {
    const object = xobjects?.lookup(key, PDFStream);
    return String(object?.dict.get(PDFName.of('Subtype'))).slice(1);
  });
}

describe('assemblePdf', () => {
  const pageOf = async (over: Partial<PdfPageInput> = {}): Promise<PdfPageInput> => ({
    // 216 mm = 612.283 pt: Chromium prints 612 pt wide, 858.96 high.
    pdf: await printed(612, 858.96),
    trim: { x: 3, y: 3, w: 210, h: 297 },
    bleed: 3,
    ...over,
  });

  it('sets the MediaBox, BleedBox and TrimBox from the millimetres, exactly', async () => {
    const bytes = await assemblePdf([await pageOf(), await pageOf()], false);
    for (const index of [0, 1]) {
      const [, , mw, mh] = await boxMm(bytes, 'MediaBox', index);
      expect(mw).toBeCloseTo(216, 6);
      expect(mh).toBeCloseTo(303, 6);
      expect(await boxMm(bytes, 'BleedBox', index)).toEqual([0, 0, mw, mh].map((v) => v));
      const [tx, ty, tw, th] = await boxMm(bytes, 'TrimBox', index);
      expect([tx, ty]).toEqual([3, 3].map((v) => expect.closeTo(v, 6)));
      expect(tw).toBeCloseTo(210, 6);
      expect(th).toBeCloseTo(297, 6);
    }
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it('grows the MediaBox by a 7 mm slug on each side with crop marks, and draws eight marks', async () => {
    const bytes = await assemblePdf([await pageOf()], true);
    const [, , mw, mh] = await boxMm(bytes, 'MediaBox');
    // Offset 3 mm (the bleed) + 3 mm mark + 1 mm of white.
    expect([mw, mh]).toEqual([expect.closeTo(230, 6), expect.closeTo(317, 6)]);
    const [bx, by, bw, bh] = await boxMm(bytes, 'BleedBox');
    expect([bx, by, bw, bh]).toEqual([7, 7, 216, 303].map((v) => expect.closeTo(v, 6)));
    const [tx, ty, tw, th] = await boxMm(bytes, 'TrimBox');
    expect([tx, ty, tw, th]).toEqual([10, 10, 210, 297].map((v) => expect.closeTo(v, 6)));
    const content = await contentOf(bytes);
    // Two lines per corner, 0.25 pt wide.
    expect(content.match(/ l\b/g)).toHaveLength(8);
    expect(content).toContain('0.25 w');
  });

  /** The mark lines of the first page, in mm of the media. */
  const marksOf = async (bytes: Uint8Array) =>
    [...(await contentOf(bytes)).matchAll(/([\d.]+) ([\d.]+) m\s+([\d.]+) ([\d.]+) l/g)].map((m) =>
      [m[1], m[2], m[3], m[4]].map((v) => Number(v) / PT),
    );

  it('starts the marks outside the bleed: the book bleed from the trim, 3 mm long', async () => {
    const lines = await marksOf(await assemblePdf([await pageOf()], true));
    // Bottom-left corner of the trim is at (10, 10) mm of the media: the marks leave from 7 mm,
    // which is the edge of the bleed box, and end at 4 mm.
    const horizontal = lines.find((l) => Math.abs(l[1]! - 10) < 1e-3 && l[0]! < 10 && l[2]! < 10);
    expect(horizontal?.[0]).toBeCloseTo(7, 2);
    expect(horizontal?.[2]).toBeCloseTo(4, 2);
    const vertical = lines.find((l) => Math.abs(l[0]! - 10) < 1e-3 && l[1]! < 10 && l[3]! < 10);
    expect(vertical?.[1]).toBeCloseTo(7, 2);
    expect(vertical?.[3]).toBeCloseTo(4, 2);
    // No mark touches the bleed box.
    const [bx = 0, by = 0, bw = 0, bh = 0] = await boxMm(
      await assemblePdf([await pageOf()], true),
      'BleedBox',
    );
    for (const [x1, y1, x2, y2] of lines) {
      for (const [x, y] of [
        [x1!, y1!],
        [x2!, y2!],
      ] as const) {
        const inside = x > bx + 1e-3 && x < bx + bw - 1e-3 && y > by + 1e-3 && y < by + bh - 1e-3;
        expect(inside).toBe(false);
      }
    }
  });

  it('keeps the book bleed as the mark offset when the export has no bleed', async () => {
    const bytes = await assemblePdf(
      [await pageOf({ bleed: 0, trim: { x: 0, y: 0, w: 210, h: 297 }, markOffset: 3 })],
      true,
    );
    const [, , mw, mh] = await boxMm(bytes, 'MediaBox');
    expect([mw, mh]).toEqual([expect.closeTo(224, 6), expect.closeTo(311, 6)]);
    const horizontal = (await marksOf(bytes)).find(
      (l) => Math.abs(l[1]! - 7) < 1e-3 && l[0]! < 7 && l[2]! < 7,
    );
    // Trim corner at (7, 7): the mark leaves 3 mm from it, at 4 mm.
    expect(horizontal?.[0]).toBeCloseTo(4, 2);
    expect(horizontal?.[2]).toBeCloseTo(1, 2);
  });

  it('draws an image page across the bleed box (PNG and JPEG)', async () => {
    const grey = { create: { width: 40, height: 56, channels: 3 as const, background: '#808080' } };
    const png = await sharp(grey).png().toBuffer();
    const jpeg = await sharp(grey).jpeg().toBuffer();
    const bytes = await assemblePdf(
      [
        { png, trim: { x: 0, y: 0, w: 210, h: 297 }, bleed: 0 },
        { png: jpeg, trim: { x: 0, y: 0, w: 210, h: 297 }, bleed: 0 },
      ],
      false,
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const [, , w, h] = await boxMm(bytes, 'MediaBox');
    expect([w, h]).toEqual([expect.closeTo(210, 6), expect.closeTo(297, 6)]);
  });

  it('takes the pages one at a time from an async source', async () => {
    const source = (async function* () {
      yield await pageOf();
      yield await pageOf({ bleed: 0, trim: { x: 0, y: 0, w: 100, h: 150 } });
    })();
    const bytes = await assemblePdf(source, false);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    const [, , w] = await boxMm(bytes, 'MediaBox', 1);
    expect(w).toBeCloseTo(100, 6);
  });

  it('refuses a page with neither PDF nor image', async () => {
    await expect(
      assemblePdf([{ trim: { x: 0, y: 0, w: 1, h: 1 }, bleed: 0 }], false),
    ).rejects.toThrow(/ni PDF ni image/);
  });

  it('keeps the printed content: the PDF of the page is embedded, not redrawn', async () => {
    const bytes = await assemblePdf([await pageOf()], false);
    const content = await contentOf(bytes);
    expect(content).toMatch(/\/[\w-]+ Do/);
  });
});

describe('runPdfExport', () => {
  let work: string;
  beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), 'travelbook-pdf-test-'));
  });
  afterEach(() => rm(work, { recursive: true, force: true }));

  const book = (): Book => ({ ...newBook({ title: 'Mon album' }), spineWidth: 6 });

  /** A window that prints a blank page of the size of the box (rounded down to whole points). */
  function renderer(calls: string[] = []): ExportRenderer {
    return {
      show: async () => {
        calls.push('show');
      },
      capture: async (target, dpi) => {
        calls.push(`capture ${dpi}`);
        const w = Math.round((target.clip.w * dpi) / 25.4);
        const h = Math.round((target.clip.h * dpi) / 25.4);
        return sharp({ create: { width: w, height: h, channels: 3, background: '#808080' } })
          .png()
          .toBuffer();
      },
      print: async (job) => {
        calls.push(`print ${job.clip.w}x${job.clip.h}`);
        return printed(Math.floor(job.clip.w * PT), job.clip.h * PT);
      },
      close: () => undefined,
    };
  }
  const deps = (calls: string[] = [], forceRaster?: (t: { name: string }) => boolean) => ({
    openRenderer: async () => renderer(calls),
    onProgress: () => undefined,
    ...(forceRaster ? { forceRaster } : {}),
  });
  const options = (patch: Partial<ExportOptions> = {}): ExportOptions => ({
    ...OPTIONS,
    outDir: join(work, 'out'),
    pages: { from: 1, to: 3 },
    ...patch,
  });

  it('writes <slug>-interieur.pdf with the pages at the size of the export box', async () => {
    const calls: string[] = [];
    const report = await runPdfExport(book(), work, options(), deps(calls));
    expect(report.files).toEqual([join(work, 'out', 'mon-album-interieur.pdf')]);
    expect(report.pages).toBe(3);
    expect(calls).toEqual(['print 216x303', 'print 216x303', 'print 216x303']);
    const bytes = new Uint8Array(
      await (await import('node:fs/promises')).readFile(report.files[0]!),
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
    const [, , w, h] = await boxMm(bytes, 'MediaBox', 2);
    expect([w, h]).toEqual([expect.closeTo(216, 6), expect.closeTo(303, 6)]);
    expect(await readdir(join(work, 'out'))).toEqual(['mon-album-interieur.pdf']);
  });

  it('writes the cover as a flat sheet of its own, spine and cover bleed included', async () => {
    const b = book();
    const calls: string[] = [];
    const report = await runPdfExport(
      b,
      work,
      options({ includeCover: true, pages: { from: 1, to: 1 } }),
      deps(calls),
    );
    expect(report.files.map((f) => f.slice(work.length + 5))).toEqual([
      'mon-album-couverture.pdf',
      'mon-album-interieur.pdf',
    ]);
    const w = 2 * b.format.width + b.spineWidth + 2 * b.coverBleed;
    expect(calls[0]).toBe(`print ${w}x${b.format.height + 2 * b.coverBleed}`);
    const { readFile } = await import('node:fs/promises');
    const cover = new Uint8Array(await readFile(report.files[0]!));
    const [, , mw, mh] = await boxMm(cover, 'MediaBox');
    expect(mw).toBeCloseTo(w, 6);
    expect(mh).toBeCloseTo(b.format.height + 2 * b.coverBleed, 6);
    const [, , tw] = await boxMm(cover, 'TrimBox');
    expect(tw).toBeCloseTo(2 * b.format.width + b.spineWidth, 6);
  });

  it('puts the cover first in the single file of the screen reading preset', async () => {
    const report = await runPdfExport(
      book(),
      work,
      options({
        route: 'pdf',
        perSpread: true,
        includeCover: true,
        dpi: 150,
        bleed: false,
        cropMarks: false,
        pages: { from: 1, to: 3 },
      }),
      deps(),
    );
    expect(report.files).toEqual([join(work, 'out', 'mon-album-interieur.pdf')]);
    const { readFile } = await import('node:fs/promises');
    const bytes = new Uint8Array(await readFile(report.files[0]!));
    // Cover, page 1 alone, then the double page 2-3.
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
    const [, , cw] = await boxMm(bytes, 'MediaBox', 0);
    expect(cw).toBeCloseTo(2 * 210 + 6, 6);
    const [, , dw] = await boxMm(bytes, 'MediaBox', 2);
    expect(dw).toBeCloseTo(420, 6);
  });

  it('with the cover as pages, writes one <slug>.pdf: front cover, the pages, back cover', async () => {
    const b = { ...book(), coverBleed: 10 };
    const calls: string[] = [];
    const report = await runPdfExport(
      b,
      work,
      options({ includeCover: true, coverAsPages: true, pages: { from: 1, to: 2 } }),
      deps(calls),
    );
    expect(report.files).toEqual([join(work, 'out', 'mon-album.pdf')]);
    expect(report.pages).toBe(4);
    // Every page, the covers included, is a page with the pages' 3 mm bleed.
    expect(calls).toEqual(Array(4).fill('print 216x303'));
    const bytes = new Uint8Array(await readFile(report.files[0]!));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(4);
    for (const n of [0, 3]) {
      const [, , tw, th] = await boxMm(bytes, 'TrimBox', n);
      expect([tw, th]).toEqual([expect.closeTo(210, 6), expect.closeTo(297, 6)]);
    }
    expect(await readdir(join(work, 'out'))).toEqual(['mon-album.pdf']);
  });

  it('cuts the front cover first and the back cover last, the spine left out', () => {
    const b = book();
    const targets = coverAsPagesTargets(b, options({ includeCover: true, coverAsPages: true }));
    expect(targets.map((t) => t.name)).toEqual([
      'couverture-avant',
      'page-001',
      'page-002',
      'page-003',
      'couverture-dos',
    ]);
    // Front: right of the 6 mm spine; back: the left panel.
    expect(targets[0]).toMatchObject({
      spreadId: b.cover.id,
      clip: { x: 213, y: -3, w: 216, h: 303 },
    });
    expect(targets.at(-1)).toMatchObject({
      spreadId: b.cover.id,
      clip: { x: -3, y: -3, w: 216, h: 303 },
    });
  });

  it('captures a page at 600 dpi and embeds it when it is sent to the raster fallback', async () => {
    const calls: string[] = [];
    const report = await runPdfExport(
      book(),
      work,
      options({ pages: { from: 1, to: 2 }, cropMarks: true }),
      deps(calls, (t) => t.name === 'page-002'),
    );
    expect(calls).toEqual(['print 216x303', 'show', `capture ${RASTER_FALLBACK_DPI}`]);
    const { readFile } = await import('node:fs/promises');
    const doc = await PDFDocument.load(new Uint8Array(await readFile(report.files[0]!)));
    expect(doc.getPageCount()).toBe(2);
    // Crop marks on the image page too.
    const [, , w] = await boxMm(new Uint8Array(await readFile(report.files[0]!)), 'MediaBox', 1);
    expect(w).toBeCloseTo(230, 6);
  });

  it('removes the files of a failed run', async () => {
    const failing: ExportRenderer = {
      ...renderer(),
      print: async () => {
        throw new Error('Impression de la page: pas de réponse');
      },
    };
    await expect(
      runPdfExport(book(), work, options(), {
        openRenderer: async () => failing,
        onProgress: () => undefined,
      }),
    ).rejects.toThrow(/Impression/);
    expect(await readdir(join(work, 'out'))).toEqual([]);
  });

  it('keeps the pages in order when a raster page sits between printed ones', async () => {
    const report = await runPdfExport(
      book(),
      work,
      options(),
      deps([], (t) => t.name === 'page-002'),
    );
    const bytes = new Uint8Array(await readFile(report.files[0]!));
    expect(await Promise.all([0, 1, 2].map((i) => drawnKinds(bytes, i)))).toEqual([
      ['Form'],
      ['Image'],
      ['Form'],
    ]);
  });

  it('spills each page to the staging folder instead of holding it, and leaves no trace', async () => {
    const out = join(work, 'out');
    const spilled: string[][] = [];
    const watching: ExportRenderer = {
      ...renderer(),
      print: async (job) => {
        const staging = (await readdir(out)).find((n) => n.startsWith(STAGING_PREFIX));
        spilled.push(
          staging === undefined ? [] : await readdir(join(out, staging, 'pages')).catch(() => []),
        );
        return renderer().print(job);
      },
    };
    await runPdfExport(book(), work, options(), {
      openRenderer: async () => watching,
      onProgress: () => undefined,
    });
    // Before page 1, 2 and 3 is printed, 0, 1 and 2 pages are on disk.
    expect(spilled.map((pages) => pages.length)).toEqual([0, 1, 2]);
    expect(await readdir(out)).toEqual(['mon-album-interieur.pdf']);
  });

  describe('into a folder that holds an earlier export', () => {
    const earlierPdf = join('out', 'mon-album-interieur.pdf');
    const earlier = async (): Promise<Buffer> => {
      await mkdir(join(work, 'out'), { recursive: true });
      await writeFile(join(work, earlierPdf), 'earlier export');
      return readFile(join(work, earlierPdf));
    };

    it('keeps it intact when the new export fails or is cancelled', async () => {
      const before = await earlier();
      const failing: ExportRenderer = {
        ...renderer(),
        print: async () => {
          throw new Error('Impression de la page: pas de réponse');
        },
      };
      await expect(
        runPdfExport(book(), work, options(), {
          openRenderer: async () => failing,
          onProgress: () => undefined,
        }),
      ).rejects.toThrow(/Impression/);
      let printed = 0;
      const cancelling: ExportRenderer = {
        ...renderer(),
        print: async (job) => {
          printed += 1;
          if (printed === 2) cancelExport();
          return renderer().print(job);
        },
      };
      await expect(
        runPdfExport(book(), work, options(), {
          openRenderer: async () => cancelling,
          onProgress: () => undefined,
        }),
      ).rejects.toBeInstanceOf(ExportCancelledError);
      expect(await readdir(join(work, 'out'))).toEqual(['mon-album-interieur.pdf']);
      expect(await readFile(join(work, earlierPdf))).toEqual(before);
    });

    it('replaces it when the new export completes', async () => {
      await earlier();
      const report = await runPdfExport(book(), work, options(), deps());
      expect(report.files).toEqual([join(work, earlierPdf)]);
      expect(await readdir(join(work, 'out'))).toEqual(['mon-album-interieur.pdf']);
      const bytes = new Uint8Array(await readFile(report.files[0]!));
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
    });
  });
});
