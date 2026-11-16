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
  decor: 'Affiche · décor',
  spine: 'Affiche · dos',
} as const;

/** Font of the small lines (subtitle, year). */
export const POSTER_SMALL_FONT = 'Work Sans';
/** Below this size a one-line title is wrapped to two lines. */
export const TITLE_MIN_PT = 24;
/** The title glyphs (≈ 0.8 em) are never taller than this fraction of the page. */
const TITLE_HEIGHT_CAP = 0.3;
/** The same cap for `geant`, whose title is the poster's second subject. */
const TITLE_HEIGHT_CAP_GEANT = 0.4;
/** In `geant`, a drawing that fills less of the height than this is centred, not on the foot. */
const GEANT_FILL = 0.75;
/** In `geant` the year answers the large title: this many times the usual year size. */
const GEANT_YEAR = 1.8;
const GLYPH_EM = 0.8;
const TITLE_LINE_HEIGHT = 1.05;
const SMALL_LINE_HEIGHT = 1.3;
/** The year's size, in pt per mm of the front page's shorter side (22 pt on A4). */
const YEAR_PT_PER_MM = 0.105;
const YEAR_LINE_HEIGHT = 1.1;
const SUBTITLE_PT = 9;
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
  heightCap = TITLE_HEIGHT_CAP,
): Line[] {
  const text = upper(spec.title).replace(/\s+/g, ' ');
  const capPt = (heightCap * pageH) / PT_MM / GLYPH_EM;
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

/** The line under the title: the subtitle on the left, the year on the right in the title face. */
function smallLines(
  input: PosterInput,
  box: { x: Mm; y: Mm; w: Mm },
  gap: Mm,
  yearMaxPt: number,
): { elements: TextElement[]; h: Mm } {
  const { spec, measure } = input;
  const subtitle = spec.subtitle.trim();
  const year = spec.year.trim();
  if (subtitle === '' && year === '') return { elements: [], h: 0 };
  const opts = (name: string, align: TextElement['align'], font: string, lineHeight: number) => ({
    name,
    font,
    color: spec.colors.accent,
    lineHeight,
    align,
    vAlign: 'bottom' as const,
    role: 'caption' as const,
  });
  const lineH = (pt: number) => pt * PT_MM * SMALL_LINE_HEIGHT;
  const yearPt = year === '' ? 0 : fitPt(measure, year, spec.font, box.w / 3, yearMaxPt);
  const yearH = yearPt * PT_MM * YEAR_LINE_HEIGHT;
  const yearW =
    year === '' ? 0 : Math.min(measure(year, spec.font, yearPt) / FIT_SLACK + 1, box.w / 3);
  const subW = box.w - (year === '' ? 0 : yearW + gap);
  const subPt =
    subtitle === '' ? 0 : fitPt(measure, subtitle, POSTER_SMALL_FONT, subW, SUBTITLE_PT);
  const h = Math.max(year === '' ? 0 : yearH, subtitle === '' ? 0 : lineH(subPt));
  const out: TextElement[] = [];
  if (year !== '') {
    out.push(
      textElement(
        { x: box.x + box.w - yearW, y: box.y, w: yearW, h },
        [{ text: year, pt: yearPt }],
        opts(POSTER_NAMES.year, 'right', spec.font, YEAR_LINE_HEIGHT),
      ),
    );
  }
  if (subtitle !== '') {
    out.push(
      textElement(
        { x: box.x, y: box.y, w: subW, h },
        [{ text: subtitle, pt: subPt }],
        opts(POSTER_NAMES.subtitle, 'left', POSTER_SMALL_FONT, SMALL_LINE_HEIGHT),
      ),
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

function decorShape(rect: Rect, shape: 'rect' | 'ellipse', color: string): ShapeElement {
  return {
    ...newElement('shape', rect),
    name: POSTER_NAMES.decor,
    shape,
    fill: color,
    stroke: null,
  };
}

/**
 * The poster for the cover of `book`: a background for the whole cover spread, the elements
 * to place (title, small lines, illustration, decor shapes, spine text) in spread millimetres,
 * and the ids of the elements it replaces (those whose centre is on the front or the spine).
 * Every layout shares the header: the title on top, the year under it on the right. The layout
 * is the composition of the illustration below it.
 */
export function posterLayout(book: Book, input: PosterInput): PosterResult {
  const { spec } = input;
  const front = pageBox(book, book.cover, 'right')!;
  const { x: fx, w: fw, h: fh } = front;
  const bleed = book.coverBleed;
  const layout = spec.layout;
  const geant = layout === 'geant';
  // geant: tighter margins, so the title and the drawing take the whole front.
  const m = (geant ? 0.05 : 0.07) * Math.min(fw, fh);
  const gap = 0.2 * m;
  const inset = m;
  const innerW = fw - 2 * inset;

  // Header.
  const lines = titleLines(
    input.measure,
    spec,
    innerW,
    fh,
    layout === 'empile' || geant,
    geant ? TITLE_HEIGHT_CAP_GEANT : TITLE_HEIGHT_CAP,
  );
  const titleH = linesHeight(lines, TITLE_LINE_HEIGHT);
  const title = textElement({ x: fx + inset, y: inset, w: innerW, h: titleH }, lines, {
    name: POSTER_NAMES.title,
    font: spec.font,
    color: spec.colors.title,
    lineHeight: TITLE_LINE_HEIGHT,
    align: geant ? 'center' : 'left',
    role: 'title',
  });
  const small = smallLines(
    input,
    { x: fx + inset, y: inset + titleH + gap, w: innerW },
    m / 2,
    YEAR_PT_PER_MM * Math.min(fw, fh) * (geant ? GEANT_YEAR : 1),
  );
  const headerBottom = inset + titleH + (small.h > 0 ? gap + small.h : 0);

  // Composition.
  const decor: ShapeElement[] = [];
  const foot = fh + bleed;
  const cx = fx + fw / 2;
  let box: Rect;
  let base: 'bottom' | 'middle' = 'bottom';
  switch (layout) {
    case 'arche': {
      // The arch is sized from the drawing: it spans 90 % of the arch's width, centred between
      // the vault and the bottom margin; the arch top comes down for a wide drawing, never above
      // the header. The arch itself runs to the foot.
      const ratio = input.illustration.ratio;
      const minTop = headerBottom + m;
      const bottom = fh - m;
      let aw = 0.76 * fw;
      let top = Math.max(minTop, bottom - (0.9 * aw) / ratio - 0.6 * aw);
      if (foot - top < aw) aw = foot - top; // a low arch keeps its vault round
      top = Math.max(minTop, Math.min(top, foot - aw));
      decor.push(
        decorShape({ x: cx - aw / 2, y: top, w: aw, h: aw }, 'ellipse', spec.colors.decor),
      );
      decor.push(
        decorShape(
          { x: cx - aw / 2, y: top + aw / 2, w: aw, h: foot - top - aw / 2 },
          'rect',
          spec.colors.decor,
        ),
      );
      const illTop = top + 0.16 * aw;
      box = { x: cx - 0.45 * aw, y: illTop, w: 0.9 * aw, h: bottom - illTop };
      base = 'middle';
      break;
    }
    case 'soleil': {
      const top = Math.max(0.42 * fh, headerBottom + m / 2);
      const d = Math.min(0.78 * fw, (foot - top) * 0.85);
      decor.push(decorShape({ x: cx - d / 2, y: top, w: d, h: d }, 'ellipse', spec.colors.decor));
      const illTop = top + 0.12 * d;
      box = { x: fx + m, y: illTop, w: innerW, h: foot - illTop };
      break;
    }
    case 'horizon': {
      const bandH = 0.14 * fh;
      const bandY = fh - bandH;
      decor.push(
        decorShape({ x: fx, y: bandY, w: fw + bleed, h: bandH + bleed }, 'rect', spec.colors.decor),
      );
      const top = Math.max(0.4 * fh, headerBottom + m / 2);
      box = { x: fx + m, y: top, w: innerW, h: bandY + 0.3 * bandH - top };
      break;
    }
    case 'geant': {
      // The drawing as large as the front allows, edge to edge, standing on the foot of the
      // bleed so its ground runs off the page, as on a printed travel poster. A drawing too wide
      // to fill most of that height is centred in the space under the title instead, so the
      // page keeps no empty band between the title and a small subject at the foot.
      const top = headerBottom + m / 3;
      box = { x: fx, y: top, w: fw, h: foot - top };
      if (fw / input.illustration.ratio < GEANT_FILL * box.h) {
        box = { x: fx, y: top, w: fw, h: fh - m - top };
        base = 'middle';
      }
      break;
    }
    default: {
      // classique, empile: the illustration centred in the space under the header.
      const top = headerBottom + m / 2;
      box = { x: fx + m, y: top, w: innerW, h: fh - m - top };
      base = 'middle';
    }
  }

  const sticker = {
    ...newElement('sticker', fitRatio(box, input.illustration.ratio, base)),
    name: POSTER_NAMES.illustration,
    assetId: input.illustration.assetId,
  };
  const elements: Element[] = [...decor, sticker, title, ...small.elements];
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
