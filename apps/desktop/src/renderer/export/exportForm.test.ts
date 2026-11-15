import { newBook, newElement, type Book, type PreflightIssue } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import type { ExportOptions } from '../../shared/api';
import {
  applyPreset,
  fromOptions,
  isBlocking,
  locate,
  sameOptions,
  toOptions,
  type FormState,
} from './exportForm';
import { progressRatio } from './progress';

const OPTIONS: ExportOptions = {
  route: 'images',
  pages: { from: 2, to: 5 },
  includeCover: false,
  dpi: 450,
  nativeResolution: false,
  bleed: true,
  cropMarks: false,
  imageFormat: 'png',
  jpegQuality: 96,
  perSpread: true,
  coverMode: 'panels',
  outDir: '/tmp/out',
};

describe('fromOptions / toOptions', () => {
  it('round-trips options, a free resolution included', () => {
    expect(toOptions(fromOptions(OPTIONS), 24).options).toEqual(OPTIONS);
    expect(fromOptions(OPTIONS).resolution).toBe('free');
    expect(fromOptions({ ...OPTIONS, dpi: 600 }).resolution).toBe('600');
  });

  it('keeps native resolution apart from the dpi', () => {
    const form = { ...fromOptions(OPTIONS), resolution: 'native' as const };
    const out = toOptions(form, 24).options;
    expect(out?.nativeResolution).toBe(true);
    expect(fromOptions(out as ExportOptions).resolution).toBe('native');
  });

  it('refuses a page range outside the book or back to front', () => {
    const form = (from: string, to: string): FormState => ({
      ...fromOptions(OPTIONS),
      from,
      to,
    });
    expect(toOptions(form('0', '3'), 24).invalid).toEqual(['from']);
    expect(toOptions(form('2', '25'), 24).invalid).toEqual(['to']);
    expect(toOptions(form('6', '3'), 24).invalid).toEqual(['to']);
    expect(toOptions(form('x', '3'), 24).invalid).toEqual(['from']);
    expect(toOptions(form('24', '24'), 24).options?.pages).toEqual({ from: 24, to: 24 });
  });

  it('ignores the range fields when all pages are chosen', () => {
    const form = { ...fromOptions(OPTIONS), rangeMode: 'all' as const, from: 'oops' };
    expect(toOptions(form, 24).options?.pages).toBe('all');
  });

  it('refuses a free resolution out of range, and an empty folder', () => {
    const free = { ...fromOptions(OPTIONS), freeDpi: '20' };
    expect(toOptions(free, 24).invalid).toEqual(['freeDpi']);
    expect(toOptions({ ...free, freeDpi: '1201' }, 24).invalid).toEqual(['freeDpi']);
    expect(toOptions({ ...fromOptions(OPTIONS), outDir: '  ' }, 24).invalid).toEqual(['outDir']);
  });

  it('does not check the free field when a fixed resolution is chosen', () => {
    const form = { ...fromOptions(OPTIONS), resolution: '300' as const, freeDpi: 'nope' };
    expect(toOptions(form, 24).options?.dpi).toBe(300);
  });

  it('drops crop marks outside the PDF route', () => {
    const form = { ...fromOptions({ ...OPTIONS, route: 'images' }), cropMarks: true };
    expect(toOptions(form, 24).options?.cropMarks).toBe(false);
    expect(toOptions({ ...form, route: 'pdf' }, 24).options?.cropMarks).toBe(true);
  });
});

describe('presets in the form', () => {
  it('compares options with or without the folder', () => {
    const other = { ...OPTIONS, outDir: '/elsewhere' };
    expect(sameOptions(OPTIONS, other, true)).toBe(false);
    expect(sameOptions(OPTIONS, { ...other, outDir: '' }, false)).toBe(true);
    expect(sameOptions(OPTIONS, { ...other, dpi: 300 }, false)).toBe(false);
  });

  it('keeps the chosen folder when a built-in preset has none', () => {
    expect(applyPreset({ ...OPTIONS, outDir: '' }, '/mine').outDir).toBe('/mine');
    expect(applyPreset(OPTIONS, '/mine').outDir).toBe('/tmp/out');
  });
});

describe('pre-flight issues', () => {
  const labels = {
    cover: 'couverture',
    page: (n: number) => `page ${n}`,
    pages: (l: number, r: number) => `pages ${l} et ${r}`,
  };
  const book: Book = newBook({ title: 'T', innerSpreads: 4 });
  const photo = { ...newElement('photo', { x: 0, y: 0, w: 50, h: 50 }), assetId: 'photo-a' };
  const spread = book.spreads[1]!;
  const withPhoto: Book = {
    ...book,
    assets: {
      'photo-a': {
        id: 'photo-a',
        kind: 'photo',
        file: 'photos/a.jpg',
        originalName: 'plage.jpg',
        pixel: { w: 100, h: 100 },
      } as never,
    },
    spreads: book.spreads.map((s) =>
      s.id === spread.id ? { ...s, elements: [...s.elements, photo] } : s,
    ),
  };

  it('names the pages of the spread and targets the element', () => {
    const issue: PreflightIssue = {
      kind: 'lowResolution',
      spreadId: spread.id,
      elementId: photo.id,
      dpi: 90,
    };
    expect(locate(withPhoto, issue, labels)).toEqual({
      place: 'pages 2 et 3',
      file: null,
      target: { spreadId: spread.id, elementId: photo.id },
    });
  });

  it('points a missing original at the first photo that uses it, with its file name', () => {
    const where = locate(withPhoto, { kind: 'missingAsset', assetId: 'photo-a' }, labels);
    expect(where.file).toBe('plage.jpg');
    expect(where.target).toEqual({ spreadId: spread.id, elementId: photo.id });
  });

  it('has no target for a page rule or an element that is gone', () => {
    const rule: PreflightIssue = {
      kind: 'pageRule',
      pages: 6,
      rule: { min: 24, multiple: 4 } as never,
    };
    expect(locate(withPhoto, rule, labels).target).toBeNull();
    const gone: PreflightIssue = { kind: 'emptySlot', spreadId: spread.id, elementId: 'nope' };
    expect(locate(withPhoto, gone, labels).target).toBeNull();
  });

  it('blocks only on a missing original', () => {
    expect(isBlocking({ kind: 'missingAsset', assetId: 'x' })).toBe(true);
    expect(isBlocking({ kind: 'emptySlot', spreadId: 's', elementId: 'e' })).toBe(false);
    expect(isBlocking({ kind: 'lowResolution', spreadId: 's', elementId: 'e', dpi: 10 })).toBe(
      false,
    );
    expect(isBlocking({ kind: 'textOutsideSafe', spreadId: 's', elementId: 'e' })).toBe(false);
  });
});

describe('progressRatio', () => {
  it('grows with the page and the step, and never passes 1', () => {
    expect(progressRatio({ page: 1, total: 4, step: 'derivatives' })).toBeCloseTo(0.0125, 4);
    expect(progressRatio({ page: 3, total: 4, step: 'render' })).toBeGreaterThan(0.5);
    expect(progressRatio({ page: 4, total: 4, step: 'write' })).toBeLessThanOrEqual(1);
    expect(progressRatio({ page: 1, total: 0, step: 'write' })).toBe(0);
  });
});
