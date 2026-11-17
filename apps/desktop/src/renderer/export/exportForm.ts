import type { Book, PreflightIssue } from '@travelbook/core';
import { elementAssetIds, pageCount } from '@travelbook/core';
import type { ExportOptions } from '../../shared/api';
import { findSpread } from '../store/editor';
import { pageNumbers } from '../editor/pages';

/** The resolutions the select offers besides "free" and "native". */
export const DPI_CHOICES = [150, 300, 600] as const;
export const DPI_RANGE = { min: 72, max: 1200 } as const;
export const QUALITY_CHOICES = [95, 96, 97, 98, 99, 100] as const;

export type Resolution = `${(typeof DPI_CHOICES)[number]}` | 'free' | 'native';

/** What the dialog's fields hold: text for what the user types, so that a typo is not lost. */
export interface FormState {
  route: ExportOptions['route'];
  rangeMode: 'all' | 'range';
  from: string;
  to: string;
  includeCover: boolean;
  resolution: Resolution;
  freeDpi: string;
  bleed: boolean;
  cropMarks: boolean;
  imageFormat: ExportOptions['imageFormat'];
  jpegQuality: number;
  perSpread: boolean;
  coverMode: ExportOptions['coverMode'];
  outDir: string;
}

export type FieldName = 'from' | 'to' | 'freeDpi' | 'outDir';

/** The fields of an `ExportOptions`, in the shape the dialog edits. */
export function fromOptions(o: ExportOptions): FormState {
  const known = DPI_CHOICES.find((d) => d === o.dpi);
  return {
    route: o.route,
    rangeMode: o.pages === 'all' ? 'all' : 'range',
    from: o.pages === 'all' ? '1' : String(o.pages.from),
    to: o.pages === 'all' ? '1' : String(o.pages.to),
    includeCover: o.includeCover,
    resolution: o.nativeResolution ? 'native' : known !== undefined ? `${known}` : 'free',
    freeDpi: String(o.dpi),
    bleed: o.bleed,
    cropMarks: o.cropMarks,
    imageFormat: o.imageFormat,
    jpegQuality: o.jpegQuality,
    perSpread: o.perSpread,
    coverMode: o.coverMode,
    outDir: o.outDir,
  };
}

const wholeNumber = (text: string): number | null => {
  const t = text.trim();
  return /^\d{1,5}$/.test(t) ? Number(t) : null;
};

/**
 * The options the fields stand for, or the fields that are wrong. Crop marks only exist on the
 * PDF route and are dropped without it; a JPEG quality only means something for JPEG.
 */
export function toOptions(
  f: FormState,
  pages: number,
): { options: ExportOptions; invalid: [] } | { options: null; invalid: FieldName[] } {
  const invalid: FieldName[] = [];
  let range: ExportOptions['pages'] = 'all';
  if (f.rangeMode === 'range') {
    const from = wholeNumber(f.from);
    const to = wholeNumber(f.to);
    if (from === null || from < 1 || from > pages) invalid.push('from');
    if (to === null || to < 1 || to > pages) invalid.push('to');
    if (from !== null && to !== null && invalid.length === 0 && from > to) invalid.push('to');
    if (invalid.length === 0) range = { from: from as number, to: to as number };
  }
  let dpi = Number(f.resolution);
  if (f.resolution === 'free' || f.resolution === 'native') {
    const free = wholeNumber(f.freeDpi);
    if (free === null || free < DPI_RANGE.min || free > DPI_RANGE.max) {
      if (f.resolution === 'free') invalid.push('freeDpi');
      dpi = 300;
    } else dpi = free;
  }
  if (f.outDir.trim() === '') invalid.push('outDir');
  if (invalid.length > 0) return { options: null, invalid };
  return {
    invalid: [],
    options: {
      route: f.route,
      pages: range,
      includeCover: f.includeCover,
      dpi,
      nativeResolution: f.resolution === 'native',
      bleed: f.bleed,
      cropMarks: f.route === 'pdf' && f.cropMarks,
      imageFormat: f.imageFormat,
      jpegQuality: f.jpegQuality,
      perSpread: f.perSpread,
      coverMode: f.coverMode,
      outDir: f.outDir.trim(),
    },
  };
}

/** Do two option sets mean the same export? `outDir` is left out for a preset with no folder. */
export function sameOptions(a: ExportOptions, b: ExportOptions, withFolder: boolean): boolean {
  const key = (o: ExportOptions) =>
    JSON.stringify([
      o.route,
      o.pages === 'all' ? 'all' : [o.pages.from, o.pages.to],
      o.includeCover,
      o.dpi,
      o.nativeResolution,
      o.bleed,
      o.cropMarks,
      o.imageFormat,
      o.jpegQuality,
      o.perSpread,
      o.coverMode,
      withFolder ? o.outDir : '',
    ]);
  return key(a) === key(b);
}

/**
 * A preset's options as the dialog applies them: the built-in ones carry no folder, so the
 * folder already chosen stays.
 */
export function applyPreset(options: ExportOptions, currentDir: string): FormState {
  return fromOptions(options.outDir === '' ? { ...options, outDir: currentDir } : options);
}

/** Only a missing original stops an export; the other issues are warnings (spec §10). */
export const isBlocking = (issue: PreflightIssue): boolean => issue.kind === 'missingAsset';

/** Where an issue is in the album: the element to select and the spread that holds it. */
export interface IssueTarget {
  spreadId: string;
  elementId: string;
}

export interface IssueWhere {
  /** `null` for an issue that belongs to the book. */
  place: string | null;
  /** The file name of a missing original. */
  file: string | null;
  target: IssueTarget | null;
}

/**
 * The place of an issue as the user reads it ("page 4", "pages 4 et 5", "couverture"), and the
 * element "voir" goes to. A missing original has no place of its own: it points at the first
 * photo (or map, for a medallion) that uses it.
 */
export function locate(book: Book, issue: PreflightIssue, labels: SpreadLabel): IssueWhere {
  if (issue.kind === 'pageRule') return { place: null, file: null, target: null };
  if (issue.kind === 'missingAsset') {
    const file = book.assets[issue.assetId]?.originalName ?? issue.assetId;
    for (const spread of [book.cover, ...book.spreads]) {
      const el = spread.elements.find(
        (e) =>
          (e.type === 'photo' && e.assetId === issue.assetId) ||
          (e.type === 'map' && elementAssetIds(e).includes(issue.assetId)),
      );
      if (el) {
        return {
          place: placeOf(book, spread.id, labels),
          file,
          target: { spreadId: spread.id, elementId: el.id },
        };
      }
    }
    return { place: null, file, target: null };
  }
  const spread = findSpread(book, issue.spreadId);
  if (!spread || !spread.elements.some((e) => e.id === issue.elementId)) {
    return { place: null, file: null, target: null };
  }
  return {
    place: placeOf(book, issue.spreadId, labels),
    file: null,
    target: { spreadId: issue.spreadId, elementId: issue.elementId },
  };
}

/** The words that name a place; they live in `fr.ts`. */
export interface SpreadLabel {
  cover: string;
  page(n: number): string;
  pages(left: number, right: number): string;
}

function placeOf(book: Book, spreadId: string, labels: SpreadLabel): string | null {
  const spread = findSpread(book, spreadId);
  if (!spread) return null;
  if (spread.kind === 'cover') return labels.cover;
  const { left, right } = pageNumbers(book, spread);
  if (left !== null && right !== null) return labels.pages(left, right);
  const only = left ?? right;
  return only === null ? null : labels.page(only);
}

/** Pages an export range may name: the book's pages, the cover not numbered. */
export const exportablePages = (book: Book): number => pageCount(book);
