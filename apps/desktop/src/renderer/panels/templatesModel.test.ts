import { newBook, type Book, type Spread, type Template, type Theme } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import covers from '../../../resources/templates/covers.json';
import openings from '../../../resources/templates/openings.json';
import photos from '../../../resources/templates/photos.json';
import spreads from '../../../resources/templates/spreads.json';
import texte from '../../../resources/templates/texte.json';
import shippedThemes from '../../../resources/templates/themes.json';
import {
  NO_FILTERS,
  fitsView,
  indexTemplates,
  listTemplates,
  matchesChip,
  pageTarget,
  photosOnTarget,
  pickRandom,
  randomCount,
  targetFor,
  viewKind,
  type Filters,
  type SectionTitles,
  type TemplateIndex,
} from './templatesModel';

const titles: SectionTitles = { covers: 'Couvertures', pages: 'Pages', spreads: 'Doubles pages' };

let n = 0;
const tpl = (extra: Partial<Template> = {}): Template => ({
  id: `b-t${++n}`,
  name: `Modèle ${n}`,
  category: 'photos',
  scope: 'page',
  photoCount: 2,
  origin: 'bundled',
  grid: { root: { slot: 'photo' }, fullBleed: false },
  ...extra,
});
const spreadOfKind = (kind: Spread['kind']): Spread => ({
  id: kind,
  kind,
  background: {},
  elements: [],
});
const ids = (list: Template[]): string[] => list.map((t) => t.id);

describe('views and targets', () => {
  it('maps the spread in view to what the list offers', () => {
    expect(viewKind(spreadOfKind('cover'))).toBe('cover');
    expect(viewKind(spreadOfKind('first'))).toBe('page');
    expect(viewKind(spreadOfKind('last'))).toBe('page');
    expect(viewKind(spreadOfKind('inner'))).toBe('pages');
  });

  it('puts a page template on the front of the cover, the only page of an end spread, else the page pointed at', () => {
    expect(pageTarget(spreadOfKind('cover'), 'left')).toBe('right');
    expect(pageTarget(spreadOfKind('first'), 'left')).toBe('right');
    expect(pageTarget(spreadOfKind('last'), 'right')).toBe('left');
    expect(pageTarget(spreadOfKind('inner'), 'left')).toBe('left');
    expect(pageTarget(spreadOfKind('inner'), 'right')).toBe('right');
  });

  it('puts a spread template on the whole spread', () => {
    const wide = tpl({ scope: 'spread', category: 'double' });
    expect(targetFor(spreadOfKind('inner'), 'left', wide)).toBe('spread');
    expect(targetFor(spreadOfKind('inner'), 'left', tpl())).toBe('left');
    expect(targetFor(spreadOfKind('cover'), 'left', tpl({ category: 'couverture' }))).toBe('right');
  });
});

describe('indexTemplates', () => {
  it('indexes by id and by photo count, once', () => {
    const a = tpl({ photoCount: 3 });
    const b = tpl({ photoCount: 3 });
    const c = tpl({ photoCount: 1 });
    const index = indexTemplates([a, b, c]);
    expect(index.byCount.get(3)).toEqual([a, b]);
    expect(index.byCount.get(1)).toEqual([c]);
    expect(index.byCount.get(2)).toBeUndefined();
    expect(index.byId.get(b.id)).toBe(b);
  });

  it('lets a bundled template keep its id against a user one that claims it', () => {
    const bundled = tpl({ id: 'b-same' });
    const intruder = tpl({ id: 'b-same', origin: 'user', name: 'Intrus' });
    expect(indexTemplates([intruder, bundled]).byId.get('b-same')).toBe(bundled);
    expect(indexTemplates([bundled, intruder]).byId.get('b-same')).toBe(bundled);
    expect(indexTemplates([bundled, intruder]).all).toHaveLength(1);
  });
});

describe('fitsView and matchesChip', () => {
  const cover = tpl({ category: 'couverture' });
  const page = tpl();
  const wide = tpl({ scope: 'spread', category: 'double' });
  it('the cover lists covers only, and pages when asked', () => {
    expect(fitsView(cover, 'cover', false)).toBe(true);
    expect(fitsView(page, 'cover', false)).toBe(false);
    expect(fitsView(page, 'cover', true)).toBe(true);
    expect(fitsView(wide, 'cover', true)).toBe(false);
  });
  it('a page lists page templates; an inner spread also lists spread templates; neither lists covers', () => {
    expect(fitsView(page, 'page', false)).toBe(true);
    expect(fitsView(wide, 'page', false)).toBe(false);
    expect(fitsView(cover, 'page', true)).toBe(false);
    expect(fitsView(wide, 'pages', false)).toBe(true);
    expect(fitsView(cover, 'pages', true)).toBe(false);
  });
  it('chips 1 to 6 are exact and 7 means seven and more', () => {
    expect(matchesChip(tpl({ photoCount: 3 }), 3)).toBe(true);
    expect(matchesChip(tpl({ photoCount: 3 }), 4)).toBe(false);
    expect(matchesChip(tpl({ photoCount: 7 }), 7)).toBe(true);
    expect(matchesChip(tpl({ photoCount: 16 }), 7)).toBe(true);
    expect(matchesChip(tpl({ photoCount: 6 }), 7)).toBe(false);
    expect(matchesChip(tpl({ photoCount: 0 }), null)).toBe(true);
  });
});

describe('listTemplates', () => {
  const themes: Theme[] = [
    { id: 'a', name: 'Alpha', coverTemplateId: 'b-ac', fonts: ['Lora'] },
    { id: 'z', name: 'Zêta', coverTemplateId: 'b-zc', fonts: ['Inter'] },
  ];
  const aCover = tpl({ id: 'b-ac', category: 'couverture', themeId: 'a', photoCount: 1 });
  const aPage3 = tpl({ id: 'b-a3', themeId: 'a', photoCount: 3 });
  const aPage1 = tpl({ id: 'b-a1', themeId: 'a', photoCount: 1 });
  const zCover = tpl({ id: 'b-zc', category: 'couverture', themeId: 'z', photoCount: 2 });
  const plain3 = tpl({ id: 'b-p3', photoCount: 3 });
  const plain1 = tpl({ id: 'b-p1', photoCount: 1 });
  const plainText = tpl({ id: 'b-px', category: 'texte', photoCount: 0 });
  const plainCover = tpl({ id: 'b-pc', category: 'couverture', photoCount: 2 });
  const plainCover0 = tpl({ id: 'b-pc0', category: 'couverture', photoCount: 0 });
  const wide = tpl({ id: 'b-w', scope: 'spread', category: 'double', photoCount: 2 });
  const mine = tpl({ id: 'user-1', origin: 'user', name: 'Le mien', photoCount: 3 });
  const index: TemplateIndex = indexTemplates([
    aCover,
    aPage3,
    aPage1,
    zCover,
    plain3,
    plain1,
    plainText,
    plainCover,
    plainCover0,
    wide,
    mine,
  ]);
  const list = (
    tab: 'themed' | 'classic' | 'mine',
    view: 'cover' | 'page' | 'pages',
    filters: Partial<Filters> = {},
  ) => listTemplates(index, themes, tab, view, { ...NO_FILTERS, ...filters }, titles);

  it('Thématique: each theme with its cover, then its pages by photo count; themes in order', () => {
    const sections = list('themed', 'page');
    expect(sections.map((s) => s.title)).toEqual(['Alpha']);
    // The cover is not offered on a page: only that theme's pages.
    expect(ids(sections[0]!.templates)).toEqual(['b-a1', 'b-a3']);
    const onCover = list('themed', 'cover');
    expect(onCover.map((s) => [s.title, ids(s.templates)])).toEqual([
      ['Alpha', ['b-ac']],
      ['Zêta', ['b-zc']],
    ]);
  });

  it('Thématique with pages on the cover puts the cover first', () => {
    const [alpha] = list('themed', 'cover', { withPages: true });
    expect(ids(alpha!.templates)).toEqual(['b-ac', 'b-a1', 'b-a3']);
  });

  it('Classique: plain bundled templates only, fewest photos first and text pages last, spreads in a section of their own', () => {
    const sections = list('classic', 'pages');
    expect(sections.map((s) => s.title)).toEqual(['Pages', 'Doubles pages']);
    expect(ids(sections[0]!.templates)).toEqual(['b-p1', 'b-p3', 'b-px']);
    expect(ids(sections[1]!.templates)).toEqual(['b-w']);
  });

  it('with the cover in view the list shows covers only, with no heading for a single section', () => {
    const sections = list('classic', 'cover');
    expect(sections).toEqual([{ key: 'covers', templates: [plainCover, plainCover0] }]);
  });

  it('on the cover, "withPages" adds the page templates after the covers', () => {
    const sections = list('classic', 'cover', { withPages: true });
    expect(sections.map((s) => s.title)).toEqual(['Couvertures', 'Pages']);
    expect(ids(sections[1]!.templates)).toEqual(['b-p1', 'b-p3', 'b-px']);
  });

  it('on a single page there are no spread templates', () => {
    const sections = list('classic', 'page');
    expect(sections).toHaveLength(1);
    expect(ids(sections[0]!.templates)).not.toContain('b-w');
  });

  it('the photo-count chip narrows every tab', () => {
    expect(ids(list('classic', 'pages', { chip: 3 }).flatMap((s) => s.templates))).toEqual([
      'b-p3',
    ]);
    expect(ids(list('themed', 'pages', { chip: 3 }).flatMap((s) => s.templates))).toEqual(['b-a3']);
    expect(list('classic', 'pages', { chip: 5 })).toEqual([]);
  });

  it('the category filter narrows pages, and does not touch the cover', () => {
    expect(
      ids(list('classic', 'pages', { category: 'texte' }).flatMap((s) => s.templates)),
    ).toEqual(['b-px']);
    expect(
      ids(list('classic', 'pages', { category: 'double' }).flatMap((s) => s.templates)),
    ).toEqual(['b-w']);
    expect(
      ids(list('classic', 'cover', { category: 'texte' }).flatMap((s) => s.templates)),
    ).toEqual(['b-pc', 'b-pc0']);
  });

  it('Mes modèles: the user templates only', () => {
    expect(ids(list('mine', 'pages').flatMap((s) => s.templates))).toEqual(['user-1']);
    expect(list('mine', 'cover')).toEqual([]);
  });
});

describe('pickRandom', () => {
  const a = tpl({ id: 'b-a', photoCount: 3 });
  const b = tpl({ id: 'b-b', photoCount: 3 });
  const c = tpl({ id: 'b-c', photoCount: 3 });
  const other = tpl({ id: 'b-o', photoCount: 4 });
  const text = tpl({ id: 'b-t', photoCount: 3, category: 'texte' });
  const wide = tpl({ id: 'b-w', photoCount: 3, scope: 'spread', category: 'double' });
  const cover = tpl({ id: 'b-cv', photoCount: 3, category: 'couverture' });
  const coverB = tpl({ id: 'b-cv2', photoCount: 3, category: 'couverture' });
  const themed = tpl({ id: 'b-th', photoCount: 3, themeId: 'plage' });
  const themed2 = tpl({ id: 'b-th2', photoCount: 3, themeId: 'plage' });
  const index = indexTemplates([a, b, c, other, text, wide, cover, coverB, themed, themed2]);
  const pick = (over: Partial<Parameters<typeof pickRandom>[1]>) =>
    pickRandom(index, {
      photoCount: 3,
      last: undefined,
      view: 'pages',
      target: 'left',
      rand: () => 0,
      ...over,
    });

  it('picks a page template with the same photo count, never the one last applied', () => {
    const seen = new Set<string>();
    for (const r of [0, 0.2, 0.5, 0.8, 0.99]) {
      const got = pick({ last: a, rand: () => r });
      expect(got?.photoCount).toBe(3);
      expect(got?.id).not.toBe('b-a');
      seen.add(got!.id);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('keeps to the scope of the target: pages pick photo pages, spreads spread templates, covers covers', () => {
    expect(['b-a', 'b-b', 'b-c']).toContain(pick({ rand: () => 0.99 })?.id);
    expect(pick({ target: 'spread' })?.id).toBe('b-w');
    expect(pick({ view: 'cover', target: 'right', rand: () => 0.99 })?.id).toBe('b-cv2');
    expect(pick({ view: 'cover', target: 'right', last: cover })?.id).toBe('b-cv2');
  });

  it('stays in the theme of a themed template, and out of the themes otherwise', () => {
    expect(pick({ last: themed })?.id).toBe('b-th2');
    expect(['b-a', 'b-b', 'b-c']).toContain(pick({ last: a, rand: () => 0.99 })?.id);
    expect(pick({ last: undefined })?.themeId).toBeUndefined();
  });

  it('falls back to any template of the count when the theme has no other', () => {
    const lone = indexTemplates([themed, a]);
    expect(
      pickRandom(lone, {
        photoCount: 3,
        last: themed,
        view: 'pages',
        target: 'left',
        rand: () => 0,
      })?.id,
    ).toBe('b-a');
  });

  it('returns null when nothing else has that many photos', () => {
    expect(pick({ photoCount: 4, last: other })).toBeNull();
    expect(pick({ photoCount: 9 })).toBeNull();
    expect(pick({ target: 'spread', last: wide })).toBeNull();
  });

  it('is deterministic for a given random source, and handles rand() close to 1', () => {
    expect(pick({ rand: () => 0.999999 })).toEqual(pick({ rand: () => 0.999999 }));
  });
});

describe('photosOnTarget and randomCount', () => {
  function book(): Book {
    const b = newBook({ title: 'T', innerSpreads: 1 });
    const photo = (id: string, x: number, assetId: string | null) => ({
      id,
      type: 'photo' as const,
      x,
      y: 10,
      w: 50,
      h: 50,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      assetId,
      crop: { scale: 1, cx: 0.5, cy: 0.5 },
      flipH: false,
      flipV: false,
      mask: { kind: 'rect' as const },
      border: null,
      shadow: null,
      adjust: { brightness: 1, contrast: 1, saturation: 1, grayscale: 0, sepia: 0, vignette: 0 },
      edge: null,
    });
    b.spreads[1]!.elements = [photo('l1', 10, 'A'), photo('l2', 70, null), photo('r1', 250, 'B')];
    return b;
  }

  it('counts the frames of one page, or of the whole spread', () => {
    const b = book();
    const spread = b.spreads[1]!;
    expect(photosOnTarget(b, spread, 'left')).toEqual({ filled: 1, frames: 2 });
    expect(photosOnTarget(b, spread, 'right')).toEqual({ filled: 1, frames: 1 });
    expect(photosOnTarget(b, spread, 'spread')).toEqual({ filled: 2, frames: 3 });
  });

  it('keeps the placed photos, or the empty frames of a page that has no photo', () => {
    expect(randomCount({ filled: 3, frames: 5 })).toBe(3);
    expect(randomCount({ filled: 0, frames: 2 })).toBe(2);
    expect(randomCount({ filled: 0, frames: 0 })).toBe(0);
  });
});

describe('the shipped templates', () => {
  const all = [photos, covers, openings, texte, spreads].flat() as unknown as Template[];
  const themes = shippedThemes as Theme[];
  const index = indexTemplates(all);
  const flat = (
    tab: 'themed' | 'classic',
    view: 'cover' | 'page' | 'pages',
    f: Partial<Filters> = {},
  ) =>
    listTemplates(index, themes, tab, view, { ...NO_FILTERS, ...f }, titles).flatMap(
      (s) => s.templates,
    );

  it('list covers only with the cover in view, and no cover on a page', () => {
    for (const tab of ['themed', 'classic'] as const) {
      expect(flat(tab, 'cover').every((t) => t.category === 'couverture')).toBe(true);
      expect(flat(tab, 'pages').some((t) => t.category === 'couverture')).toBe(false);
    }
    expect(flat('classic', 'cover').length).toBeGreaterThanOrEqual(30);
  });

  it('give every photo count from 1 to 16 a random layout to pick, other than the last applied', () => {
    for (let count = 1; count <= 16; count++) {
      const first = pickRandom(index, {
        photoCount: count,
        last: undefined,
        view: 'pages',
        target: 'left',
        rand: () => 0,
      });
      expect(first, `${count} photos`).not.toBeNull();
      const next = pickRandom(index, {
        photoCount: count,
        last: first!,
        view: 'pages',
        target: 'left',
        rand: () => 0,
      });
      expect(next, `${count} photos`).not.toBeNull();
      expect(next!.id).not.toBe(first!.id);
    }
  });

  it('chip 3 shows only 3-photo templates', () => {
    const shown = flat('classic', 'pages', { chip: 3 });
    expect(shown.length).toBeGreaterThanOrEqual(12);
    expect(shown.every((t) => t.photoCount === 3)).toBe(true);
  });
});
