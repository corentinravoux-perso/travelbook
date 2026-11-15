// @vitest-environment jsdom
import {
  newBook,
  newElement,
  addElement,
  pageBox,
  type AssetRef,
  type Book,
} from '@travelbook/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';
import { applyPosterToCover, illustrationUrl } from './posterActions';
import { POSTER_PRESETS } from './presets';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><path class="tb-main" fill="#c8423b" d="M0 0h200v100H0z"/></svg>';
let stored: { svg: string; meta: unknown }[] = [];
const asset = (svg: string): AssetRef => ({
  id: `sticker-${svg.length.toString(16).padStart(16, '0')}`,
  kind: 'sticker',
  file: 'assets/x.svg',
  originalName: 'x.svg',
  sha256: 'x',
});
const tb = {
  project: { save: () => Promise.resolve() },
  assets: {
    fromSvg: vi.fn(async (svg: string, meta: unknown) => {
      stored.push({ svg, meta });
      return asset(svg);
    }),
  },
};
const fetchOk = vi.fn(async () => ({ ok: true, text: async () => SVG }) as Response);

let book: Book;
const spec = () => ({ ...POSTER_PRESETS[0]!.spec });

beforeEach(async () => {
  stored = [];
  tb.assets.fromSvg.mockClear();
  (window as unknown as { tb: unknown }).tb = tb;
  vi.stubGlobal('fetch', fetchOk);
  book = { ...newBook({ title: 'Japon', innerSpreads: 2 }), spineWidth: 10 };
  const front = pageBox(book, book.cover, 'right')!;
  book = addElement(
    book,
    book.cover.id,
    newElement('text', { x: front.x + 20, y: 20, w: 60, h: 20 }),
  );
  book = addElement(book, book.cover.id, newElement('photo', { x: 20, y: 20, w: 60, h: 60 }));
  await editorStore.getState().openWith(() => Promise.resolve({ book }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  editorStore.getState().notify(null);
});

describe('illustrationUrl', () => {
  it('points to the offline set or to the library', () => {
    expect(illustrationUrl({ set: 'affiches', id: 'japon-torii' })).toBe(
      'tb://sticker/affiches/japon-torii.svg',
    );
    expect(illustrationUrl({ itemId: 'sticker-abc' })).toBe('tb://library/sticker-abc');
  });
});

describe('applyPosterToCover', () => {
  it('adds the asset and the poster in one undo step', async () => {
    const before = editorStore.getState().book!;
    expect(await applyPosterToCover(spec())).toBe(true);
    const after = editorStore.getState().book!;
    expect(Object.keys(after.assets)).toHaveLength(Object.keys(before.assets).length + 1);
    const names = after.cover.elements.map((e) => e.name);
    expect(names).toContain('Affiche · titre');
    expect(names).toContain('Affiche · illustration');
    expect(after.cover.background.spread).toEqual({
      kind: 'color',
      color: spec().colors.background,
    });
    expect(stored[0]!.meta).toMatchObject({ licence: { source: 'travelbook', licence: 'MIT' } });
    editorStore.getState().undo();
    expect(editorStore.getState().book).toEqual(before);
  });

  it('replaces the first poster when applied twice; one undo restores the first', async () => {
    await applyPosterToCover(spec());
    const first = editorStore.getState().book!;
    const second = { ...spec(), title: 'Kyoto' };
    await applyPosterToCover(second);
    const after = editorStore.getState().book!;
    expect(after.cover.elements.filter((e) => e.name === 'Affiche · titre')).toHaveLength(1);
    expect(after.cover.elements.filter((e) => e.name === 'Affiche · illustration')).toHaveLength(1);
    expect(after.cover.elements.filter((e) => e.name === 'Affiche · dos')).toHaveLength(1);
    editorStore.getState().undo();
    expect(editorStore.getState().book).toEqual(first);
  });

  it('keeps the back cover and drops the front elements', async () => {
    await applyPosterToCover(spec());
    const types = editorStore.getState().book!.cover.elements.map((e) => e.type);
    expect(types.filter((t) => t === 'photo')).toHaveLength(1);
  });

  it('shows the notice and changes nothing when the illustration cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as Response),
    );
    const before = editorStore.getState().book;
    expect(await applyPosterToCover(spec())).toBe(false);
    expect(editorStore.getState().book).toBe(before);
    expect(editorStore.getState().notice).toBe(fr.poster.applyFailed);
    expect(tb.assets.fromSvg).not.toHaveBeenCalled();
  });

  it('shows the notice when the asset cannot be stored', async () => {
    tb.assets.fromSvg.mockRejectedValueOnce(new Error('disk full'));
    const before = editorStore.getState().book;
    expect(await applyPosterToCover(spec())).toBe(false);
    expect(editorStore.getState().book).toBe(before);
    expect(editorStore.getState().notice).toBe(fr.poster.applyFailed);
  });

  it('recolours a recolourable drawing with the illustration colours', async () => {
    const s = {
      ...spec(),
      colors: { ...spec().colors, illustration: { main: '#123456', shade: '#0a0b0c' } },
    };
    await applyPosterToCover(s);
    expect(stored[0]!.svg).toContain('#123456');
  });
});
