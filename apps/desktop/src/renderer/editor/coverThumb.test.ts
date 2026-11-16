import {
  addElement,
  newBook,
  newElement,
  type AssetRef,
  type Book,
  type PhotoElement,
} from '@travelbook/core';
import { mapElement } from '@travelbook/core/src/map/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorStore, type EditorStore } from '../store/editor';
import { createCoverThumbs } from './coverThumb';

const open = (book: Book) => () => Promise.resolve({ dir: '/x', book });

const asset = (id: string): AssetRef => ({
  id,
  kind: 'photo',
  file: `originals/${id}.jpg`,
  originalName: `${id}.jpg`,
  sha256: id,
});

async function setup(hasThumb = true) {
  const store = createEditorStore({ save: () => Promise.resolve() });
  const capture = vi.fn<(book: Book) => Promise<void>>(() => Promise.resolve());
  const has = vi.fn<() => Promise<boolean>>(() => Promise.resolve(hasThumb));
  const thumbs = createCoverThumbs({ store, capture, hasThumb: has });
  const book = newBook({ title: 'T', innerSpreads: 2 });
  await store.getState().openWith(open(book));
  return { store, capture, has, thumbs, book };
}

const editCover = (store: EditorStore) =>
  store.getState().apply((b) => ({ ...b, cover: { ...b.cover, elements: [] } }), 'Couverture');
const editInner = (store: EditorStore) =>
  store
    .getState()
    .apply(
      (b) => ({ ...b, spreads: b.spreads.map((s, i) => (i === 1 ? { ...s, elements: [] } : s)) }),
      'Double page',
    );
/** A photo imported for the inner pages: it joins `book.assets` and nothing else. */
const importPhoto = (store: EditorStore, id: string) =>
  store.getState().apply((b) => ({ ...b, assets: { ...b.assets, [id]: asset(id) } }), 'Importer');
/** A photo of the book put on the cover (its asset is imported first). */
const putOnCover = (store: EditorStore, id: string) =>
  store.getState().apply((b) => {
    const photo: PhotoElement = {
      ...newElement('photo', { x: 10, y: 10, w: 50, h: 50 }),
      assetId: id,
    };
    return addElement(b, b.cover.id, photo);
  }, 'Photo');

describe('cover thumbnail controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never captures while the user edits, however long they wait', async () => {
    const { store, capture } = await setup();
    editCover(store);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(capture).not.toHaveBeenCalled();
  });

  it('flush captures once when the cover changed, and only then', async () => {
    const { store, capture, thumbs } = await setup();
    await thumbs.flush();
    expect(capture).not.toHaveBeenCalled();
    editCover(store);
    editCover(store);
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]![0]).toBe(store.getState().book);
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('ignores edits of other spreads and view changes', async () => {
    const { store, capture, thumbs } = await setup();
    editInner(store);
    store.getState().setZoom(2);
    store.getState().goToSpread(store.getState().book!.cover.id);
    await thumbs.flush();
    expect(capture).not.toHaveBeenCalled();
  });

  it('ignores photos imported for the inner pages, which only change book.assets', async () => {
    const { store, capture, thumbs } = await setup();
    importPhoto(store, 'p1');
    importPhoto(store, 'p2');
    await thumbs.flush();
    expect(capture).not.toHaveBeenCalled();
  });

  it('sees a photo put on the cover, and the change of an asset the cover shows', async () => {
    const { store, capture, thumbs } = await setup();
    importPhoto(store, 'p1');
    putOnCover(store, 'p1');
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(1);
    // The same photo with new data (relinked, say): a new AssetRef object, same id.
    store.getState().apply((b) => ({ ...b, assets: { ...b.assets, p1: asset('p1') } }), 'Relier');
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(2);
    // Another asset changing does not count.
    importPhoto(store, 'p2');
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('sees a change of the geometry or of a medallion photo of a map on the cover', async () => {
    const { store, capture, thumbs } = await setup();
    const geometry = (): AssetRef => ({
      id: 'map-0123456789abcdef',
      kind: 'map',
      file: 'assets/map-0123456789abcdef.json',
      originalName: 'TH.json',
      sha256: 'a',
    });
    store
      .getState()
      .apply((b) => ({ ...b, assets: { ...b.assets, [geometry().id]: geometry() } }), 'Carte');
    store.getState().apply((b) => addElement(b, b.cover.id, mapElement()), 'Carte');
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(1);
    // The geometry arrives anew (rebuilt): same id, a new AssetRef.
    store
      .getState()
      .apply((b) => ({ ...b, assets: { ...b.assets, [geometry().id]: geometry() } }), 'Recharger');
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(2);
    // The medallion photo of a place is part of what the cover draws.
    importPhoto(store, 'photo-1');
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(3);
    // An asset the cover does not draw is not.
    importPhoto(store, 'other');
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(3);
  });

  it('sees a change of the format, the spine or the cover bleed', async () => {
    const { store, capture, thumbs } = await setup();
    store.getState().apply((b) => ({ ...b, spineWidth: 12 }), 'Dos');
    await thumbs.flush();
    store.getState().apply((b) => ({ ...b, coverBleed: 5 }), 'Fond perdu');
    await thumbs.flush();
    store.getState().apply((b) => ({ ...b, format: { width: 200, height: 280 } }), 'Format');
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(3);
  });

  it('does not rebuild the thumbnail of a book that is opened again unchanged', async () => {
    const { store, capture, thumbs, book } = await setup();
    // Back from the home screen: the same album, read from disk, so its parts are new objects.
    await store.getState().openWith(open(structuredClone(book)));
    await thumbs.flush();
    expect(capture).not.toHaveBeenCalled();
    editCover(store);
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('forgets the pending change of an album when another one opens', async () => {
    const { store, capture, thumbs } = await setup();
    editCover(store);
    await store.getState().openWith(open(newBook({ title: 'Other' })));
    await thumbs.flush();
    expect(capture).not.toHaveBeenCalled();
  });

  describe('buildIfMissing', () => {
    it('captures when the open book has no thumbnail, at once and without a timer', async () => {
      const { capture, thumbs } = await setup(false);
      await thumbs.buildIfMissing();
      expect(capture).toHaveBeenCalledTimes(1);
    });

    it('leaves an album that has a thumbnail alone', async () => {
      const { capture, thumbs, has } = await setup(true);
      await thumbs.buildIfMissing();
      expect(has).toHaveBeenCalledTimes(1);
      expect(capture).not.toHaveBeenCalled();
    });

    it('captures once for two calls made together (a remount of the editor)', async () => {
      const { capture, thumbs } = await setup(false);
      await Promise.all([thumbs.buildIfMissing(), thumbs.buildIfMissing()]);
      expect(capture).toHaveBeenCalledTimes(1);
    });

    it('does nothing when another album opened while it checked, or when it cannot check', async () => {
      const { store, capture, thumbs, has } = await setup(false);
      has.mockImplementationOnce(async () => {
        await store.getState().openWith(open(newBook({ title: 'Other' })));
        return false;
      });
      await thumbs.buildIfMissing();
      expect(capture).not.toHaveBeenCalled();
      has.mockRejectedValueOnce(new Error('no project'));
      await expect(thumbs.buildIfMissing()).resolves.toBeUndefined();
      expect(capture).not.toHaveBeenCalled();
    });

    it('shows the cover as it is: a pending change is covered by that capture', async () => {
      const { store, capture, thumbs } = await setup(false);
      editCover(store);
      await thumbs.buildIfMissing();
      expect(capture).toHaveBeenCalledTimes(1);
      await thumbs.flush();
      expect(capture).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps going after a failed capture and never rejects', async () => {
    const { store, capture, thumbs } = await setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    capture.mockRejectedValueOnce(new Error('no window'));
    editCover(store);
    await expect(thumbs.flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    store.getState().apply((b) => ({ ...b, spineWidth: 8 }), 'Dos');
    await thumbs.flush();
    expect(capture).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
