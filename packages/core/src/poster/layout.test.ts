import { describe, expect, it } from 'vitest';
import { newBook, newElement } from '../factory';
import { boundingBox, pageBox, spineBox, spreadSize } from '../geometry';
import { addElement } from '../ops';
import type { Book, Element, Rect, StickerElement, TextElement } from '../schema';
import { applyPoster, PT_MM, posterLayout, type MeasureText } from './layout';
import { validSpec } from './test-helpers';
import { POSTER_LAYOUTS, type PosterLayout, type PosterSpec } from './types';

const measure: MeasureText = (t, _f, pt) => t.length * pt * PT_MM * 0.5;
const EPS = 1e-6;

const book = (format = { width: 210, height: 297 }, spineWidth = 10): Book => ({
  ...newBook({ title: 'Voyage', format }),
  spineWidth,
});
const FORMATS = {
  'A4 portrait': { width: 210, height: 297 },
  'A4 landscape': { width: 297, height: 210 },
  square: { width: 210, height: 210 },
};

const spec = (patch: Partial<PosterSpec> = {}): PosterSpec => ({ ...validSpec, ...patch });
const input = (s: PosterSpec, ratio = 0.8) => ({
  spec: s,
  illustration: { assetId: 'asset-1', ratio },
  measure,
});

const named = (els: Element[], name: string) => els.filter((e) => e.name === name);
const titleOf = (els: Element[]) => named(els, 'Affiche · titre')[0] as TextElement;
const stickerOf = (els: Element[]) => named(els, 'Affiche · illustration')[0] as StickerElement;

interface Line {
  text: string;
  pt: number;
}
function lines(el: TextElement): Line[] {
  const doc = el.doc as {
    content: {
      content?: { text: string; marks?: { type: string; attrs: { fontSize?: string } }[] }[];
    }[];
  };
  return doc.content.map((p) => {
    const nodes = p.content ?? [];
    const size = nodes[0]?.marks?.find((m) => m.type === 'textStyle')?.attrs.fontSize;
    return {
      text: nodes.map((n) => n.text).join(''),
      pt: size ? parseFloat(size) : el.style.fontSizePt,
    };
  });
}

const inside = (r: Rect, box: Rect) =>
  r.x >= box.x - EPS &&
  r.y >= box.y - EPS &&
  r.x + r.w <= box.x + box.w + EPS &&
  r.y + r.h <= box.y + box.h + EPS;

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;

describe.each(Object.entries(FORMATS))('posterLayout on %s', (_name, format) => {
  const b = book(format);
  const size = spreadSize(b, b.cover);
  const bled: Rect = {
    x: -b.coverBleed,
    y: -b.coverBleed,
    w: size.w + 2 * b.coverBleed,
    h: size.h + 2 * b.coverBleed,
  };
  const front = pageBox(b, b.cover, 'right')!;

  it.each(POSTER_LAYOUTS)('%s keeps every element inside the cover spread plus bleed', (layout) => {
    const s = spec({ layout, subtitle: 'Kyoto · Osaka · Nara', year: '2026' });
    const { elements } = posterLayout(b, input(s));
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) expect(inside(boundingBox(el), bled)).toBe(true);
  });

  it.each(POSTER_LAYOUTS)('%s prints the title in capitals within its box', (layout) => {
    const { elements } = posterLayout(b, input(spec({ layout, title: 'Japon' })));
    const title = titleOf(elements);
    expect(lines(title).map((l) => l.text)).toEqual(['JAPON']);
    for (const l of lines(title)) {
      expect(measure(l.text, title.style.fontFamily, l.pt)).toBeLessThanOrEqual(title.w + EPS);
    }
    expect(title.textRole).toBe('title');
    expect(title.style.color).toBe(validSpec.colors.title);
    expect(title.style.fontFamily).toBe(validSpec.font);
  });

  it.each(POSTER_LAYOUTS)(
    '%s keeps the title on the front page, clear of the illustration',
    (l) => {
      const s = spec({ layout: l, subtitle: 'Sous-titre', year: '2026' });
      const { elements } = posterLayout(b, input(s));
      const title = titleOf(elements);
      const sticker = stickerOf(elements);
      expect(inside(boundingBox(title), front)).toBe(true);
      expect(overlap(boundingBox(title), boundingBox(sticker))).toBe(false);
      for (const name of ['Affiche · sous-titre', 'Affiche · année']) {
        const [t] = named(elements, name);
        expect(t).toBeDefined();
        expect(overlap(boundingBox(t!), boundingBox(sticker))).toBe(false);
        expect(overlap(boundingBox(t!), boundingBox(title))).toBe(false);
      }
    },
  );

  it.each(POSTER_LAYOUTS)('%s fits a long title on one line, never overflowing', (layout) => {
    const title = titleOf(
      posterLayout(b, input(spec({ layout, title: 'Nouvelle-Zélande et Australie' }))).elements,
    );
    for (const l of lines(title)) {
      expect(l.pt).toBeGreaterThanOrEqual(24);
      expect(measure(l.text, title.style.fontFamily, l.pt)).toBeLessThanOrEqual(title.w + EPS);
    }
  });

  it.each(POSTER_LAYOUTS)('%s wraps a title that would print under 24 pt', (layout) => {
    const long = 'Nouvelle-Zélande, Australie, Fidji, Vanuatu et Nouvelle-Calédonie';
    const title = titleOf(posterLayout(b, input(spec({ layout, title: long }))).elements);
    const ls = lines(title);
    expect(ls).toHaveLength(2);
    expect(ls.map((l) => l.text).join(' ')).toBe(long.toLocaleUpperCase('fr'));
    for (const l of ls) {
      expect(measure(l.text, title.style.fontFamily, l.pt)).toBeLessThanOrEqual(title.w + EPS);
    }
  });

  it.each(POSTER_LAYOUTS)('%s puts the title on top and the year under it, right', (layout) => {
    const { elements } = posterLayout(
      b,
      input(spec({ layout, subtitle: 'Sous-titre', year: '2026' })),
    );
    const title = titleOf(elements);
    const year = named(elements, 'Affiche · année')[0] as TextElement;
    const sticker = stickerOf(elements);
    expect(title.y).toBeLessThan(0.2 * front.h);
    expect(year.align).toBe('right');
    expect(year.y).toBeGreaterThanOrEqual(title.y + title.h - EPS);
    expect(year.x + year.w).toBeCloseTo(title.x + title.w, 6);
    expect(sticker.y).toBeGreaterThanOrEqual(year.y + year.h - EPS);
  });

  it.each(POSTER_LAYOUTS)(
    '%s keeps decor shapes under the header and behind the illustration',
    (layout) => {
      const { elements } = posterLayout(b, input(spec({ layout, year: '2026' })));
      const title = titleOf(elements);
      const year = named(elements, 'Affiche · année')[0]!;
      const sticker = elements.indexOf(stickerOf(elements));
      elements.forEach((el, i) => {
        if (el.name !== 'Affiche · décor') return;
        expect(i).toBeLessThan(sticker);
        expect(el.y).toBeGreaterThanOrEqual(year.y + year.h - EPS);
        expect(overlap(boundingBox(el), boundingBox(title))).toBe(false);
      });
    },
  );

  it.each(POSTER_LAYOUTS)('%s keeps the illustration ratio', (layout) => {
    for (const ratio of [0.4, 1, 2.5]) {
      const sticker = stickerOf(posterLayout(b, input(spec({ layout }), ratio)).elements);
      expect(sticker.w / sticker.h).toBeCloseTo(ratio, 6);
      expect(sticker.assetId).toBe('asset-1');
      expect(inside(boundingBox(sticker), bled)).toBe(true);
    }
  });
});

describe('posterLayout details', () => {
  const b = book();
  const front = pageBox(b, b.cover, 'right')!;

  it('prints lower-case accented input in capitals', () => {
    const title = titleOf(posterLayout(b, input(spec({ title: 'crète' }))).elements);
    expect(lines(title)[0]!.text).toBe('CRÈTE');
  });

  it('shrinks a long single word to the width before it would wrap', () => {
    const title = titleOf(posterLayout(b, input(spec({ title: 'Nouvelle-Zélande' }))).elements);
    const ls = lines(title);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.pt).toBeGreaterThanOrEqual(24);
    expect(measure(ls[0]!.text, 'Anton', ls[0]!.pt)).toBeLessThanOrEqual(title.w + EPS);
  });

  it.each(Object.values(FORMATS))('caps the height of a short title (%o)', (format) => {
    const bk = book(format);
    const title = titleOf(posterLayout(bk, input(spec({ title: 'Pérou' }))).elements);
    expect(title.style.fontSizePt * PT_MM * 0.8).toBeLessThanOrEqual(0.3 * format.height + EPS);
  });

  it('breaks a single long word after its hyphen when it must wrap', () => {
    const narrow = book({ width: 60, height: 90 });
    const title = titleOf(
      posterLayout(narrow, input(spec({ title: 'Nouvelle-Calédonie' }))).elements,
    );
    expect(lines(title).map((l) => l.text)).toEqual(['NOUVELLE-', 'CALÉDONIE']);
  });

  it('stacks a two-word title in empile, each line fitted to the width', () => {
    const title = titleOf(
      posterLayout(b, input(spec({ layout: 'empile', title: 'Costa Rica' }))).elements,
    );
    const ls = lines(title);
    expect(ls.map((l) => l.text)).toEqual(['COSTA', 'RICA']);
    expect(ls[1]!.pt).toBeGreaterThan(ls[0]!.pt);
    const total = ls.reduce((s, l) => s + l.pt, 0);
    expect(total * PT_MM * 0.8).toBeLessThanOrEqual(0.3 * front.h + EPS);
  });

  it('places the year right-aligned in the accent colour under a classique title', () => {
    const { elements } = posterLayout(b, input(spec({ year: '2026' })));
    const year = named(elements, 'Affiche · année')[0] as TextElement;
    const title = titleOf(elements);
    expect(year.align).toBe('right');
    expect(year.style.color).toBe(validSpec.colors.accent);
    expect(year.style.fontFamily).toBe('Work Sans');
    expect(year.textRole).toBe('caption');
    expect(year.y).toBeGreaterThanOrEqual(title.y + title.h - EPS);
  });

  it('omits empty subtitle and year', () => {
    const { elements } = posterLayout(b, input(spec()));
    expect(named(elements, 'Affiche · année')).toHaveLength(0);
    expect(named(elements, 'Affiche · sous-titre')).toHaveLength(0);
  });

  it.each(['classique', 'empile'] as PosterLayout[])(
    'centres the %s illustration in the space under the header, inside the margins',
    (layout) => {
      for (const ratio of [0.5, 1, 2]) {
        const { elements } = posterLayout(b, input(spec({ layout, year: '2026' }), ratio));
        const year = named(elements, 'Affiche · année')[0]!;
        const sticker = stickerOf(elements);
        const m = 0.07 * Math.min(front.w, front.h);
        const top = year.y + year.h;
        expect(sticker.y + sticker.h).toBeLessThanOrEqual(front.h - m + EPS);
        const free = { top: sticker.y - top, bottom: front.h - m - (sticker.y + sticker.h) };
        expect(Math.abs(free.top - free.bottom)).toBeLessThanOrEqual(m / 2 + EPS);
        expect(sticker.x + sticker.w / 2).toBeCloseTo(front.x + front.w / 2, 6);
      }
    },
  );

  it('draws a disc in the decor colour behind a soleil illustration', () => {
    const { elements } = posterLayout(b, input(spec({ layout: 'soleil' })));
    const decor = named(elements, 'Affiche · décor');
    expect(decor).toHaveLength(1);
    const disc = decor[0]!;
    expect(disc.type === 'shape' && disc.shape).toBe('ellipse');
    expect(disc.type === 'shape' && disc.fill).toBe(validSpec.colors.decor);
    expect(disc.w).toBeCloseTo(disc.h, 6);
  });

  it('opens an arched window to the foot for arche', () => {
    const { elements } = posterLayout(b, input(spec({ layout: 'arche' })));
    const decor = named(elements, 'Affiche · décor');
    expect(decor.map((d) => d.type === 'shape' && d.shape).sort()).toEqual(['ellipse', 'rect']);
    const rect = decor.find((d) => d.type === 'shape' && d.shape === 'rect')!;
    expect(rect.y + rect.h).toBeCloseTo(front.h + b.coverBleed, 6);
    const sticker = stickerOf(elements);
    expect(sticker.x).toBeGreaterThanOrEqual(rect.x - EPS);
    expect(sticker.x + sticker.w).toBeLessThanOrEqual(rect.x + rect.w + EPS);
  });

  it.each([0.6, 1.6, 2.4])('fills the arch with an illustration of ratio %s', (ratio) => {
    const { elements } = posterLayout(b, input(spec({ layout: 'arche', year: '2026' }), ratio));
    const rect = named(elements, 'Affiche · décor').find(
      (d) => d.type === 'shape' && d.shape === 'rect',
    )!;
    const sticker = stickerOf(elements);
    const year = named(elements, 'Affiche · année')[0]!;
    const arch = named(elements, 'Affiche · décor').find(
      (d) => d.type === 'shape' && d.shape === 'ellipse',
    )!;
    expect(arch.y).toBeGreaterThanOrEqual(year.y + year.h - EPS);
    // A wide drawing spans most of the arch; a tall one is limited by the height.
    if (ratio > 1) expect(sticker.w).toBeGreaterThanOrEqual(0.85 * rect.w);
    expect(sticker.y).toBeGreaterThanOrEqual(arch.y + 0.1 * arch.h - EPS);
  });

  it('stands a horizon illustration on a band across the front foot', () => {
    const { elements } = posterLayout(b, input(spec({ layout: 'horizon' })));
    const [band] = named(elements, 'Affiche · décor');
    expect(band?.type === 'shape' && band.shape).toBe('rect');
    expect(band!.x).toBeCloseTo(front.x, 6);
    expect(band!.x + band!.w).toBeCloseTo(front.x + front.w + b.coverBleed, 6);
    expect(band!.y + band!.h).toBeCloseTo(front.h + b.coverBleed, 6);
    const sticker = stickerOf(elements);
    expect(sticker.y + sticker.h).toBeGreaterThan(band!.y);
    expect(sticker.y + sticker.h).toBeLessThan(band!.y + band!.h);
  });

  it('keeps the year right under a stacked empile title', () => {
    const { elements } = posterLayout(
      b,
      input(spec({ layout: 'empile', title: 'Costa Rica', year: '2026' })),
    );
    const year = named(elements, 'Affiche · année')[0] as TextElement;
    expect(year.align).toBe('right');
  });

  it('writes one rotated text on a spine of 10 mm', () => {
    const { elements } = posterLayout(b, input(spec({ year: '2026' })));
    const spine = named(elements, 'Affiche · dos') as TextElement[];
    expect(spine).toHaveLength(1);
    expect(spine[0]!.rotation).toBe(90);
    expect(lines(spine[0]!)[0]!.text).toBe('JAPON · 2026');
    expect(inside(boundingBox(spine[0]!), spineBox(b))).toBe(true);
    expect(spine[0]!.style.fontSizePt).toBeLessThanOrEqual(Math.min((0.55 * 10) / PT_MM, 28));
  });

  it('writes no spine text on a 5 mm spine or when the spine is off', () => {
    const thin = book(undefined, 5);
    expect(named(posterLayout(thin, input(spec())).elements, 'Affiche · dos')).toHaveLength(0);
    expect(
      named(posterLayout(b, input(spec({ spine: false }))).elements, 'Affiche · dos'),
    ).toHaveLength(0);
  });

  it('lists the front and spine elements for removal, not the back ones', () => {
    const onFront = newElement('text', { x: front.x + 20, y: 20, w: 50, h: 10 });
    const onSpine = newElement('text', { x: 211, y: 100, w: 8, h: 40 });
    const onBack = newElement('text', { x: 20, y: 20, w: 50, h: 10 });
    let bk = b;
    for (const el of [onFront, onSpine, onBack]) bk = addElement(bk, bk.cover.id, el);
    const { removeIds } = posterLayout(bk, input(spec()));
    expect(removeIds.sort()).toEqual([onFront.id, onSpine.id].sort());
  });

  it('sets the spread background', () => {
    expect(posterLayout(b, input(spec())).background).toEqual({
      kind: 'color',
      color: validSpec.colors.background,
    });
  });
});

describe('applyPoster', () => {
  const front = (bk: Book) => pageBox(bk, bk.cover, 'right')!;

  it('replaces the cover background, removes front and spine elements, keeps the back', () => {
    let bk = book();
    const onFront = newElement('text', { x: front(bk).x + 20, y: 20, w: 50, h: 10 });
    const onBack = newElement('photo', { x: 20, y: 20, w: 50, h: 50 });
    for (const el of [onFront, onBack]) bk = addElement(bk, bk.cover.id, el);
    bk = {
      ...bk,
      cover: {
        ...bk.cover,
        background: { left: { kind: 'color', color: '#ff0000' } },
      },
    };
    const result = posterLayout(bk, input(spec({ year: '2026' })));
    const out = applyPoster(bk, result);
    expect(out.cover.background).toEqual({
      spread: { kind: 'color', color: validSpec.colors.background },
    });
    const ids = out.cover.elements.map((e) => e.id);
    expect(ids).toContain(onBack.id);
    expect(ids).not.toContain(onFront.id);
    expect(out.cover.elements).toHaveLength(2 - result.removeIds.length + result.elements.length);
    expect(bk.cover.elements).toHaveLength(2);
  });

  it.each(['classique', 'horizon'] as PosterLayout[])('%s leaves the other spreads alone', (l) => {
    const bk = book();
    const out = applyPoster(bk, posterLayout(bk, input(spec({ layout: l }))));
    expect(out.spreads).toBe(bk.spreads);
  });
});
