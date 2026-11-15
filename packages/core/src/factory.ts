import type { Book, Crop, Element, Rect, Spread } from './schema';

type IdSource = () => string;

const defaultIdSource: IdSource = () => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (!c?.randomUUID) throw new Error('crypto.randomUUID is unavailable');
  return c.randomUUID();
};

let idSource: IdSource = defaultIdSource;

/** Replace the id generator (tests). Pass null to restore `crypto.randomUUID`. */
export function setIdSource(source: IdSource | null): void {
  idSource = source ?? defaultIdSource;
}

export function newId(): string {
  return idSource();
}

/** A photo that has not been panned or zoomed: cover fit, centred. */
export function defaultCrop(): Crop {
  return { scale: 1, cx: 0.5, cy: 0.5 };
}

export function newSpread(kind: Spread['kind']): Spread {
  return { id: newId(), kind, background: {}, elements: [] };
}

export function newElement<T extends Element['type']>(
  type: T,
  rect: Rect,
): Extract<Element, { type: T }> {
  const base = {
    id: newId(),
    ...rect,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
  };
  let el: Element;
  switch (type as Element['type']) {
    case 'photo':
      el = {
        ...base,
        type: 'photo',
        assetId: null,
        crop: defaultCrop(),
        flipH: false,
        flipV: false,
        mask: { kind: 'rect' },
        border: null,
        shadow: null,
        adjust: { brightness: 1, contrast: 1, saturation: 1, grayscale: 0, sepia: 0, vignette: 0 },
        edge: null,
      };
      break;
    case 'text':
      el = {
        ...base,
        type: 'text',
        doc: { type: 'doc', content: [{ type: 'paragraph' }] },
        style: {
          fontFamily: 'Inter',
          fontSizePt: 12,
          color: '#000000',
          lineHeight: 1.3,
          letterSpacing: 0,
        },
        align: 'left',
        vAlign: 'top',
        box: { fill: null, padding: 0 },
        outline: null,
        shadow: null,
      };
      break;
    case 'sticker':
      el = { ...base, type: 'sticker', assetId: '', flipH: false, flipV: false, tint: null };
      break;
    case 'shape':
      el = {
        ...base,
        type: 'shape',
        shape: 'rect',
        fill: '#cccccc',
        stroke: null,
        radius: 0,
        points: 5,
      };
      break;
  }
  return el as Extract<Element, { type: T }>;
}

export function newBook(opts: {
  title: string;
  format?: { width: number; height: number };
  innerSpreads?: number;
}): Book {
  const inner = opts.innerSpreads ?? 11;
  return {
    schemaVersion: 1,
    id: newId(),
    title: opts.title,
    format: opts.format ?? { width: 210, height: 297 },
    bleed: 3,
    coverBleed: 3,
    safeMargin: 8,
    spineWidth: 0,
    pageRule: { min: 24, multiple: 2 },
    settings: { frenchTypography: true, dpiGood: 250, dpiLow: 150 },
    cover: newSpread('cover'),
    spreads: [
      newSpread('first'),
      ...Array.from({ length: inner }, () => newSpread('inner')),
      newSpread('last'),
    ],
    assets: {},
  };
}

/** 2 pages per inner spread plus page 1 (first) and the last left page. */
export function pageCount(book: Book): number {
  return 2 * (book.spreads.length - 2) + 2;
}
