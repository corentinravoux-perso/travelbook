// @vitest-environment jsdom
import { newBook, type AssetRef, type Book } from '@travelbook/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorStore, findSpread } from '../store/editor';
import { fr } from '../strings/fr';
import { naturalRatio, placeSticker, stickerRect } from './stickerActions';

const asset = (over: Partial<AssetRef> = {}): AssetRef => ({
  id: 'sticker-a',
  kind: 'sticker',
  file: 'assets/a.png',
  originalName: 'Avion.png',
  sha256: 'a',
  pixel: { w: 400, h: 200 },
  licence: {
    source: 'Openverse',
    author: 'Ada',
    licence: 'CC-BY-4.0',
    url: 'https://x.org',
    requiresAttribution: true,
  },
  ...over,
});

let book: Book;
const spreadNow = () => findSpread(editorStore.getState().book, book.spreads[1]!.id)!;

const tb = {
  project: { save: () => Promise.resolve() },
  library: { stickers: { add: vi.fn(async () => ({ id: 'sticker-a' })) } },
  assets: { fromLibrary: vi.fn(async () => asset()) },
};

beforeEach(async () => {
  tb.library.stickers.add.mockClear();
  tb.assets.fromLibrary.mockClear();
  (window as unknown as { tb: unknown }).tb = tb;
  book = newBook({ title: 'T', innerSpreads: 2 });
  await editorStore.getState().openWith(() => Promise.resolve({ book }));
  editorStore.getState().goToSpread(book.spreads[1]!.id);
});
afterEach(() => vi.restoreAllMocks());

describe('stickerRect', () => {
  it('is 40 mm wide at the natural ratio, centred on the right page', () => {
    const b = editorStore.getState().book!;
    const rect = stickerRect(b, spreadNow(), 2);
    expect(rect.w).toBe(40);
    expect(rect.h).toBe(20);
    const page = { x: b.format.width, w: b.format.width };
    expect(rect.x + rect.w / 2).toBeCloseTo(page.x + page.w / 2, 2);
  });

  it('is centred on the drop point and kept inside the spread', () => {
    const b = editorStore.getState().book!;
    expect(stickerRect(b, spreadNow(), 1, { x: 100, y: 80 })).toMatchObject({ x: 80, y: 60 });
    expect(stickerRect(b, spreadNow(), 1, { x: -50, y: -50 })).toMatchObject({ x: 0, y: 0 });
  });

  it('shrinks a very tall sticker to fit the page', () => {
    const b = editorStore.getState().book!;
    const rect = stickerRect(b, spreadNow(), 0.05);
    expect(rect.h).toBeLessThanOrEqual(b.format.height * 0.9 + 0.01);
    expect(rect.w / rect.h).toBeCloseTo(0.05, 2);
  });
});

describe('naturalRatio', () => {
  it('uses the pixel size of a raster', async () => {
    expect(await naturalRatio(asset())).toBe(2);
  });
  it('reads an SVG viewBox, and falls back to square', async () => {
    const svg = asset({ file: 'assets/a.svg' });
    delete svg.pixel;
    expect(await naturalRatio(svg, async () => '<svg viewBox="0 0 30 10"/>')).toBe(3);
    expect(await naturalRatio(svg, async () => '<svg/>')).toBe(1);
    expect(await naturalRatio(svg, async () => Promise.reject(new Error('x')))).toBe(1);
  });
});

describe('placeSticker', () => {
  it('keeps a found sticker, copies it in, and adds the asset and the element in ONE undo step', async () => {
    const id = await placeSticker({ kind: 'hit', source: 'noto', id: 'airplane' });
    expect(tb.library.stickers.add).toHaveBeenCalledWith({ source: 'noto', id: 'airplane' });
    expect(tb.assets.fromLibrary).toHaveBeenCalledWith('sticker-a');
    const state = editorStore.getState();
    expect(state.book!.assets['sticker-a']).toBeDefined();
    const el = spreadNow().elements.find((e) => e.id === id);
    expect(el).toMatchObject({ type: 'sticker', assetId: 'sticker-a', w: 40, h: 20, tint: null });
    expect(state.selection).toEqual([id]);
    expect(state.history.labels.at(-1)).toBe(fr.stickers.undoPlace);

    state.undo();
    expect(editorStore.getState().book!.assets['sticker-a']).toBeUndefined();
    expect(spreadNow().elements.some((e) => e.id === id)).toBe(false);
  });

  it('a library item skips the add and goes straight to the copy', async () => {
    await placeSticker({ kind: 'item', itemId: 'sticker-a' }, { x: 100, y: 100 });
    expect(tb.library.stickers.add).not.toHaveBeenCalled();
    expect(spreadNow().elements.at(-1)).toMatchObject({ x: 80, y: 90 });
  });

  it('tells the user and changes nothing when main fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    tb.assets.fromLibrary.mockRejectedValueOnce(new Error('disk full'));
    expect(await placeSticker({ kind: 'item', itemId: 'sticker-a' })).toBeUndefined();
    expect(editorStore.getState().notice).toBe(fr.stickers.placeFailed);
    expect(spreadNow().elements).toHaveLength(0);
    expect(editorStore.getState().book!.assets['sticker-a']).toBeUndefined();
  });
});
