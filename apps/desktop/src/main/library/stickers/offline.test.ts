import { join } from 'node:path';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { buildStickerPacks, isAllowedLicence } from '../../../../scripts/build-sticker-packs';
import { listOfflineSets, searchOffline, setStickersResourcesDir, stickerSvg } from './offline';

const RESOURCES = join(import.meta.dirname, '../../../../resources');
const ALL = { offset: 0, limit: 10_000 };

beforeAll(async () => {
  // The packs are built, not committed: build them the first time (a no-op once up to date).
  await buildStickerPacks({ log: () => undefined });
  setStickersResourcesDir(RESOURCES);
}, 300_000);
afterAll(() => setStickersResourcesDir(null));

describe('offline sticker packs', () => {
  it('holds more than 20 000 stickers, 10 of them monochrome sets, each with a full licence', () => {
    const sets = listOfflineSets();
    expect(sets.reduce((sum, s) => sum + s.count, 0)).toBeGreaterThan(20_000);
    expect(sets.filter((s) => s.mono)).toHaveLength(10);
    for (const set of sets) {
      expect(set.licence.source).not.toBe('');
      expect(set.licence.author).toBeTruthy();
      expect(set.licence.url).toMatch(/^https:\/\//);
      expect(isAllowedLicence(set.licence.licence)).toBe(true);
      expect(set.licence.requiresAttribution).toBe(set.licence.licence.startsWith('CC-BY'));
    }
  });

  it('finds a suitcase by its French and English names', () => {
    expect(searchOffline('valise', ALL).total).toBeGreaterThan(0);
    expect(searchOffline('suitcase', ALL).total).toBeGreaterThan(0);
  });

  it('ignores case and accents', () => {
    const plain = searchOffline('valise', ALL);
    for (const q of ['VALISE', 'valisé', 'Valise']) {
      const found = searchOffline(q, ALL);
      expect(found.total).toBe(plain.total);
      expect(found.items.map((i) => `${i.source}/${i.id}`)).toEqual(
        plain.items.map((i) => `${i.source}/${i.id}`),
      );
    }
    expect(searchOffline('ÉTÉ', ALL).total).toBe(searchOffline('ete', ALL).total);
  });

  it('finds the flag of Iceland from French words', () => {
    const { items } = searchOffline('drapeau islande', ALL);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => /^drapeau/i.test(i.title))).toBe(true);
    expect(items.some((i) => i.source === 'flag' && i.id === 'is-4x3')).toBe(true);
    expect(items.some((i) => i.source === 'circle-flags' && i.id === 'is')).toBe(true);
  });

  it('returns hits that describe a file the app can show', () => {
    const [hit] = searchOffline('valise', { set: 'tabler', offset: 0, limit: 1 }).items;
    expect(hit).toMatchObject({ source: 'tabler', format: 'svg', mono: true });
    expect(hit?.fileUrl).toBe(`tb://sticker/tabler/${hit?.id}.svg`);
    expect(hit?.licence.licence).toBe('MIT');
    const svg = stickerSvg('tabler', hit?.id as string) as string;
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
    expect(stickerSvg('tabler', 'no-such-icon')).toBeUndefined();
    expect(stickerSvg('no-such-set', 'x')).toBeUndefined();
  });

  it('keeps only MIT, Apache-2.0 and CC0 sets with noAttribution', () => {
    const { items, total } = searchOffline('', { noAttribution: true, offset: 0, limit: 100_000 });
    expect(total).toBeGreaterThan(20_000);
    for (const item of items) {
      expect(['MIT', 'Apache-2.0', 'CC0-1.0']).toContain(item.licence.licence);
      expect(item.licence.requiresAttribution).toBe(false);
    }
    const credited = searchOffline('', ALL).items.filter((i) => i.licence.requiresAttribution);
    expect(credited.length).toBeGreaterThan(0);
  });

  it('filters by set, category and monochrome', () => {
    const mono = searchOffline('avion', { mono: true, offset: 0, limit: 50 });
    expect(mono.total).toBeGreaterThan(0);
    expect(mono.items.every((i) => i.mono)).toBe(true);
    const colour = searchOffline('avion', { mono: false, offset: 0, limit: 50 });
    expect(colour.items.every((i) => !i.mono)).toBe(true);
    const one = searchOffline('avion', { set: 'noto', offset: 0, limit: 50 });
    expect(one.items.every((i) => i.source === 'noto')).toBe(true);
    const flags = searchOffline('', { set: 'twemoji', category: 'DRAPEAUX', offset: 0, limit: 5 });
    expect(flags.total).toBeGreaterThan(200);
    expect(flags.items.every((i) => /^drapeau/i.test(i.title))).toBe(true);
  });

  it('pages stably: pages are consecutive slices of one order, with no repeat', () => {
    const everything = searchOffline('avion', ALL);
    expect(everything.total).toBeGreaterThan(30);
    const pages = [];
    for (let offset = 0; offset < everything.total; offset += 12) {
      const page = searchOffline('avion', { offset, limit: 12 });
      expect(page.total).toBe(everything.total);
      pages.push(...page.items);
    }
    const key = (i: { source: string; id: string }): string => `${i.source}/${i.id}`;
    expect(pages.map(key)).toEqual(everything.items.map(key));
    expect(new Set(pages.map(key)).size).toBe(pages.length);
    // The same query again gives the same answer.
    expect(searchOffline('avion', { offset: 12, limit: 12 }).items.map(key)).toEqual(
      pages.slice(12, 24).map(key),
    );
    expect(searchOffline('avion', { offset: everything.total, limit: 5 }).items).toEqual([]);
  });

  it('lists every set with its count', () => {
    const sets = listOfflineSets();
    expect(new Set(sets.map((s) => s.id)).size).toBe(sets.length);
    expect(searchOffline('', { set: 'flag', ...{ offset: 0, limit: 1 } }).total).toBe(
      sets.find((s) => s.id === 'flag')?.count,
    );
  });
});

describe('licence rule of the build', () => {
  it('accepts MIT, Apache-2.0, CC0, CC-BY and CC-BY-SA, and nothing else', () => {
    for (const ok of ['MIT', 'Apache-2.0', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0']) {
      expect(isAllowedLicence(ok)).toBe(true);
    }
    for (const no of [
      'OFL-1.1',
      'GPL-3.0-only',
      'CC-BY-NC-4.0',
      'CC-BY-ND-4.0',
      'ISC',
      undefined,
    ]) {
      expect(isAllowedLicence(no)).toBe(false);
    }
  });

  it('dropped nothing from the chosen sets', async () => {
    const manifest = await buildStickerPacks({ log: () => undefined });
    expect(manifest.dropped).toEqual([]);
  });
});
