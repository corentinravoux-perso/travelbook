// @vitest-environment jsdom
import { addElement, newBook, type AssetRef, type Book } from '@travelbook/core';
import { mapElement } from '@travelbook/core/src/map/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClipboardPayload } from '../../shared/api';
import { editorStore } from '../store/editor';
import { copySelection, pasteClipboard } from './actions';

const state = () => editorStore.getState();

const GEOMETRY = 'map-0123456789abcdef';

const asset = (id: string, kind: AssetRef['kind'], file: string): AssetRef => ({
  id,
  kind,
  file,
  originalName: file.split('/').pop()!,
  sha256: id,
});

/** An album with a map (geometry, and the medallion photo `photo-1` of its second place) and a spare photo. */
function albumWithMap(): { book: Book; spreadId: string } {
  let book = newBook({ title: 'A', innerSpreads: 2 });
  const spreadId = book.spreads[1]!.id;
  book.assets = {
    [GEOMETRY]: asset(GEOMETRY, 'map', `assets/${GEOMETRY}.json`),
    'photo-1': asset('photo-1', 'photo', 'originals/photo-1.jpg'),
    spare: asset('spare', 'photo', 'originals/spare.jpg'),
  };
  book = addElement(book, spreadId, mapElement());
  return { book, spreadId };
}

describe('copy and paste of a map', () => {
  const writeElements = vi.fn<(payload: ClipboardPayload) => Promise<void>>(async () => undefined);
  const readElements = vi.fn<() => Promise<ClipboardPayload | null>>(async () => null);

  beforeEach(() => {
    writeElements.mockClear();
    readElements.mockReset();
    vi.stubGlobal('tb', {
      project: { save: () => Promise.resolve() },
      clipboard: { writeElements, readElements },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts the geometry and the medallion photos on the clipboard, and no other asset', async () => {
    const { book, spreadId } = albumWithMap();
    await state().openWith(() => Promise.resolve({ dir: '/a', book }));
    state().goToSpread(spreadId);
    state().select(['map-1']);

    expect(await copySelection()).toBe(true);

    const payload = writeElements.mock.calls[0]![0];
    expect(payload.assets.map((a) => a.id)).toEqual([GEOMETRY, 'photo-1']);
    expect(payload.elements.map((e) => e.id)).toEqual(['map-1']);
  });

  it('carries each asset once when two selected maps share them', async () => {
    const { book, spreadId } = albumWithMap();
    const twin = { ...mapElement(), id: 'map-2' };
    await state().openWith(() =>
      Promise.resolve({ dir: '/a', book: addElement(book, spreadId, twin) }),
    );
    state().goToSpread(spreadId);
    state().select(['map-1', 'map-2']);
    await copySelection();
    expect(writeElements.mock.calls[0]![0].assets.map((a) => a.id)).toEqual([GEOMETRY, 'photo-1']);
  });

  it('pastes into another album with the geometry and the photos recorded in its book', async () => {
    const source = albumWithMap().book;
    const other = newBook({ title: 'B', innerSpreads: 2 });
    const spreadId = other.spreads[1]!.id;
    readElements.mockResolvedValue({
      origin: { bookId: source.id, spreadId: 'elsewhere' },
      elements: [source.spreads[1]!.elements[0]!],
      assets: [source.assets[GEOMETRY]!, source.assets['photo-1']!],
    });
    await state().openWith(() => Promise.resolve({ dir: '/b', book: other }));
    state().goToSpread(spreadId);

    await pasteClipboard();

    const pasted = state().book!;
    expect(Object.keys(pasted.assets).sort()).toEqual([GEOMETRY, 'photo-1']);
    const [map] = pasted.spreads[1]!.elements;
    expect(map).toMatchObject({ type: 'map', geometryAssetId: GEOMETRY });
    expect(map!.id).not.toBe('map-1');
    // The medallion photo is still the same asset.
    expect((map as ReturnType<typeof mapElement>).places[1]!.photo!.assetId).toBe('photo-1');
  });
});
