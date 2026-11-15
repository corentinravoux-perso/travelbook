import { newElement } from '../factory';
import { pageBox, spineBox } from '../geometry';
import { addElement, removeElements, setBackground } from '../ops';
import type { Background, Book, Element, Mm, Rect, ShapeElement, TextElement } from '../schema';
import type { PosterSpec } from './types';

/** 1 pt in mm. */
export const PT_MM = 25.4 / 72;

/** Width in mm of `text` set in `fontFamily` at `fontSizePt`. Injected: canvas in the app. */
export type MeasureText = (text: string, fontFamily: string, fontSizePt: number) => number;

export interface PosterInput {
  spec: PosterSpec;
  /** The illustration as an album asset, and its width / height. */
  illustration: { assetId: string; ratio: number };
  measure: MeasureText;
}

export interface PosterResult {
  /** For the whole cover spread. */
  background: Background;
  /** Cover elements on the front or the spine, replaced by the poster. */
  removeIds: string[];
  elements: Element[];
}

export const POSTER_NAMES = {
  title: 'Affiche · titre',
  subtitle: 'Affiche · sous-titre',
  year: 'Affiche · année',
  illustration: 'Affiche · illustration',
  frame: 'Affiche · cadre',
  spine: 'Affiche · dos',
} as const;

/** Font of the small lines (subtitle, year). */
export const POSTER_SMALL_FONT = 'Work Sans';
/** Below this size a one-line title is wrapped to two lines. */
export const TITLE_MIN_PT = 24;
/** The title glyphs (≈ 0.8 em) are never taller than this fraction of the page. */
const TITLE_HEIGHT_CAP = 0.3;
const GLYPH_EM = 0.8;
const TITLE_LINE_HEIGHT = 1.05;
const SMALL_LINE_HEIGHT = 1.3;
const YEAR_PT = 14;
const SUBTITLE_PT = 9;
const FRAME_STROKE: Mm = 0.8;
/** Texts are fitted to this share of their box, so a browser's rounding never wraps them. */
const FIT_SLACK = 0.98;
/** Spine texts only on a spine at least this wide. */
export const SPINE_TEXT_MIN: Mm = 6;

const upper = (s: string): string => s.trim().toLocaleUpperCase('fr');
const floorPt = (pt: number): number => Math.max(Math.floor(pt * 10) / 10, 1);

/** Largest size (≤ `maxPt`) at which `text` is at most `width` mm wide. */
function fitPt(measure: MeasureText, text: string, font: string, width: Mm, maxPt: number): number {
  const ref = measure(text, font, 100);
  let pt = floorPt(ref > 0 ? Math.min((100 * width * FIT_SLACK) / ref, maxPt) : maxPt);
  while (pt > 1 && measure(text, font, pt) > width) pt = floorPt(pt * 0.98);
  return pt;
}

interface Line {
  text: string;
  pt: number;
}

/** Positions where a title may break: after a space (dropped) or after a hyphen (kept). */
function breakPoints(text: string): { head: string; tail: string; at: number }[] {
  const out: { head: string; tail: string; at: number }[] = [];
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] === ' ') {
      out.push({ head: text.slice(0, i).trimEnd(), tail: text.slice(i + 1).trimStart(), at: i });
    } else if (text[i] === '-') {
      out.push({ head: text.slice(0, i + 1), tail: text.slice(i + 1), at: i + 0.5 });
    }
  }
  return out.filter((b) => b.head !== '' && b.tail !== '');
}

/**
 * The title as lines with their sizes: one line fitted to the width; two lines when the
 * layout stacks a two-word title, or when one line would print under 24 pt. The whole
 * block's glyph height is capped, so a short title never fills the page.
 */
function titleLines(
  measure: MeasureText,
  spec: PosterSpec,
  width: Mm,
  pageH: Mm,
  stack: boolean,
): Line[] {
  const text = upper(spec.title).replace(/\s+/g, ' ');
  const capPt = (TITLE_HEIGHT_CAP * pageH) / PT_MM / GLYPH_EM;
  const fit = (t: string): Line => ({ text: t, pt: fitPt(measure, t, spec.font, width, capPt) });
  let lines: Line[];
  const words = text.split(' ');
  if (stack && words.length === 2) {
    lines = words.map(fit);
  } else {
    const one = fit(text);
    const breaks = breakPoints(text);
    if (one.pt >= TITLE_MIN_PT || breaks.length === 0) {
      lines = [one];
    } else {
      const mid = text.length / 2;
      const best = breaks.reduce((a, b) => (Math.abs(b.at - mid) < Math.abs(a.at - mid) ? b : a));
      lines = [fit(best.head), fit(best.tail)];
    }
  }
  const total = lines.reduce((s, l) => s + l.pt, 0);
  if (total > capPt) {
    const k = capPt / total;
    lines = lines.map((l) => ({ ...l, pt: floorPt(l.pt * k) }));
  }
  return lines;
}

function textDoc(lines: Line[], base: number): unknown {
  return {
    type: 'doc',
    content: lines.map((l) => ({
      type: 'paragraph',
      content:
        l.text === ''
          ? []
          : [
              {
                type: 'text',
                text: l.text,
                ...(l.pt === base
                  ? {}
                  : { marks: [{ type: 'textStyle', attrs: { fontSize: `${l.pt}pt` } }] }),
              },
            ],
    })),
  };
}

function textElement(
  rect: Rect,
  lines: Line[],
  opts: {
    name: string;
    font: string;
    color: string;
    lineHeight: number;
    align: TextElement['align'];
    vAlign?: TextElement['vAlign'];
    role?: TextElement['textRole'];
  },
): TextElement {
  const el = newElement('text', rect);
  const base = Math.min(...lines.map((l) => l.pt));
  return {
    ...el,
    name: opts.name,
    ...(opts.role ? { textRole: opts.role } : {}),
    doc: textDoc(lines, base),
    style: {
      fontFamily: opts.font,
      fontSizePt: base,
      color: opts.color,
      lineHeight: opts.lineHeight,
      letterSpacing: 0,
    },
    align: opts.align,
    vAlign: opts.vAlign ?? 'top',
  };
}

const linesHeight = (lines: Line[], lh: number): Mm =>
  lines.reduce((s, l) => s + l.pt * PT_MM * lh, 0);

/** `ratio` (w / h) fitted in `box`, centred across, set on the box bottom or centred. */
function fitRatio(box: Rect, ratio: number, base: 'bottom' | 'middle'): Rect {
  const w = Math.min(box.w, Math.max(box.h, 0) * ratio);
  const h = w / ratio;
  const x = box.x + (box.w - w) / 2;
  const y = base === 'bottom' ? box.y + box.h - h : box.y + (box.h - h) / 2;
  return { x, y, w, h };
}

/**
 * The small line under or over the title: subtitle and year side by side (`split`), or
 * stacked and centred (`center`). Returns the elements and the height used.
 */
function smallLines(
  input: PosterInput,
  box: { x: Mm; y: Mm; w: Mm },
  arrangement: 'year-right' | 'year-left' | 'center',
  gap: Mm,
): { elements: TextElement[]; h: Mm } {
  const { spec, measure } = input;
  const subtitle = spec.subtitle.trim();
  const year = spec.year.trim();
  const accent = spec.colors.accent;
  const opts = (name: string, align: TextElement['align']) => ({
    name,
    font: POSTER_SMALL_FONT,
    color: accent,
    lineHeight: SMALL_LINE_HEIGHT,
    align,
    vAlign: 'bottom' as const,
    role: 'caption' as const,
  });
  const lineH = (pt: number) => pt * PT_MM * SMALL_LINE_HEIGHT;
  if (arrangement === 'center') {
    const out: TextElement[] = [];
    let y = box.y;
    for (const [text, pt, name] of [
      [subtitle, SUBTITLE_PT, POSTER_NAMES.subtitle],
      [year, YEAR_PT, POSTER_NAMES.year],
    ] as const) {
      if (text === '') continue;
      const size = fitPt(measure, text, POSTER_SMALL_FONT, box.w, pt);
      out.push(
        textElement({ x: box.x, y, w: box.w, h: lineH(size) }, [{ text, pt: size }], {
          ...opts(name, 'center'),
        }),
      );
      y += lineH(size);
    }
    return { elements: out, h: y - box.y };
  }
  if (subtitle === '' && year === '') return { elements: [], h: 0 };
  const yearPt = year === '' ? 0 : fitPt(measure, year, POSTER_SMALL_FONT, box.w / 3, YEAR_PT);
  const yearW =
    year === '' ? 0 : Math.min(measure(year, POSTER_SMALL_FONT, yearPt) / FIT_SLACK + 1, box.w / 3);
  const subW = box.w - (year === '' ? 0 : yearW + gap);
  const subPt =
    subtitle === '' ? 0 : fitPt(measure, subtitle, POSTER_SMALL_FONT, subW, SUBTITLE_PT);
  const h = Math.max(year === '' ? 0 : lineH(yearPt), subtitle === '' ? 0 : lineH(subPt));
  const yearLeft = arrangement === 'year-left';
  const out: TextElement[] = [];
  if (year !== '') {
    const x = yearLeft ? box.x : box.x + box.w - yearW;
    out.push(
      textElement({ x, y: box.y, w: yearW, h }, [{ text: year, pt: yearPt }], {
        ...opts(POSTER_NAMES.year, yearLeft ? 'left' : 'right'),
      }),
    );
  }
  if (subtitle !== '') {
    const x = yearLeft && year !== '' ? box.x + yearW + gap : box.x;
    out.push(
      textElement({ x, y: box.y, w: subW, h }, [{ text: subtitle, pt: subPt }], {
        ...opts(POSTER_NAMES.subtitle, yearLeft ? 'right' : 'left'),
      }),
    );
  }
  return { elements: out, h };
}

function spineText(book: Book, input: PosterInput): TextElement | null {
  const { spec, measure } = input;
  if (!spec.spine || book.spineWidth < SPINE_TEXT_MIN) return null;
  const title = upper(spec.title);
  if (title === '') return null;
  const year = spec.year.trim();
  const text = year === '' ? title : `${title} · ${year}`;
  const spine = spineBox(book);
  const h = spine.w * 0.8;
  const w = spine.h * 0.6;
  const pt = fitPt(measure, text, spec.font, w, Math.min((0.55 * spine.w) / PT_MM, 28));
  const el = textElement(
    { x: spine.x + spine.w / 2 - w / 2, y: spine.y + spine.h / 2 - h / 2, w, h },
    [{ text, pt }],
    {
      name: POSTER_NAMES.spine,
      font: spec.font,
      color: spec.colors.title,
      lineHeight: 1,
      align: 'center',
      vAlign: 'middle',
    },
  );
  return { ...el, rotation: 90 };
}

/**
 * The poster for the cover of `book`: a background for the whole cover spread, the elements
 * to place (title, small lines, illustration, frame, spine text) in spread millimetres, and
 * the ids of the elements it replaces (those whose centre is on the front or the spine).
 */
export function posterLayout(book: Book, input: PosterInput): PosterResult {
  const { spec } = input;
  const front = pageBox(book, book.cover, 'right')!;
  const { x: fx, w: fw, h: fh } = front;
  const m = 0.07 * Math.min(fw, fh);
  const gap = 0.2 * m;
  const layout = spec.layout;
  const elements: Element[] = [];

  const framed = layout === 'encadre';
  const inset = framed ? 1.5 * m : m;
  const titleW = fw - 2 * inset;
  const lines = titleLines(input.measure, spec, titleW, fh, layout === 'empile');
  const titleH = linesHeight(lines, TITLE_LINE_HEIGHT);
  const titleOpts = {
    name: POSTER_NAMES.title,
    font: spec.font,
    color: spec.colors.title,
    lineHeight: TITLE_LINE_HEIGHT,
    align: (framed ? 'center' : 'left') as TextElement['align'],
    role: 'title' as const,
  };
  const smallBox = (y: Mm) => ({ x: fx + inset, y, w: titleW });
  let illustrationBox: Rect;
  let base: 'bottom' | 'middle' = 'bottom';

  if (layout === 'bas') {
    const titleY = fh - m - titleH;
    const small = smallLines(input, smallBox(0), 'year-right', m / 2);
    const smallY = titleY - (small.h > 0 ? gap + small.h : 0);
    for (const el of small.elements) el.y = smallY;
    elements.push(textElement({ x: fx + m, y: titleY, w: titleW, h: titleH }, lines, titleOpts));
    elements.push(...small.elements);
    const bottom = Math.min(0.66 * fh, smallY - m / 2);
    illustrationBox = { x: fx + m, y: m, w: titleW, h: bottom - m };
  } else {
    const titleY = inset;
    elements.push(
      textElement({ x: fx + inset, y: titleY, w: titleW, h: titleH }, lines, titleOpts),
    );
    const small = smallLines(
      input,
      smallBox(titleY + titleH + gap),
      layout === 'classique' ? 'year-right' : layout === 'empile' ? 'year-left' : 'center',
      m / 2,
    );
    elements.push(...small.elements);
    const textBottom = titleY + titleH + (small.h > 0 ? gap + small.h : 0);
    if (layout === 'classique') {
      const top = Math.max(0.48 * fh, textBottom + m / 2);
      illustrationBox = { x: fx + m, y: top, w: titleW, h: fh + book.coverBleed - top };
    } else if (layout === 'empile') {
      const top = textBottom + m / 2;
      illustrationBox = { x: fx + m, y: top, w: titleW, h: fh - m - top };
      base = 'middle';
    } else {
      const top = textBottom + m / 2;
      illustrationBox = { x: fx + inset, y: top, w: titleW, h: fh - inset - top };
      const frame: ShapeElement = {
        ...newElement('shape', { x: fx + m / 2, y: m / 2, w: fw - m, h: fh - m }),
        name: POSTER_NAMES.frame,
        shape: 'rect',
        fill: null,
        stroke: { width: FRAME_STROKE, color: spec.colors.accent },
      };
      elements.unshift(frame);
    }
  }

  const sticker = {
    ...newElement('sticker', fitRatio(illustrationBox, input.illustration.ratio, base)),
    name: POSTER_NAMES.illustration,
    assetId: input.illustration.assetId,
  };
  elements.splice(framed ? 1 : 0, 0, sticker);

  const spine = spineText(book, input);
  if (spine) elements.push(spine);

  const spineStart = book.format.width;
  const removeIds = book.cover.elements
    .filter((el) => el.x + el.w / 2 >= spineStart)
    .map((el) => el.id);

  return { background: { kind: 'color', color: spec.colors.background }, removeIds, elements };
}

/**
 * `book` with the poster on its cover: the background on the whole spread (page overrides
 * cleared), the replaced elements removed, the poster's elements on top. The back is kept.
 */
export function applyPoster(book: Book, result: PosterResult): Book {
  const id = book.cover.id;
  let out = setBackground(book, id, 'spread', result.background);
  if (result.removeIds.length > 0) out = removeElements(out, id, result.removeIds);
  for (const el of result.elements) out = addElement(out, id, el);
  return out;
}
