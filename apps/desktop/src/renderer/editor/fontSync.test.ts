// @vitest-environment jsdom
import { newBook, newElement, type AssetRef, type Book } from '@travelbook/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FontFamily } from '../../shared/api';
import { createEditorStore, type EditorStore } from '../store/editor';
import { fr } from '../strings/fr';
import { missingFontFamilies, startFontSync } from './fontSync';

const licence = {
  source: 'S',
  licence: 'OFL-1.1',
  url: 'https://x.org',
  requiresAttribution: false,
};
const family = (name: string, origin: FontFamily['origin']): FontFamily => ({
  family: name,
  category: 'serif',
  origin,
  faces: [],
  licence,
});
const FAMILIES = [
  family('Lora', 'bundled'),
  family('Bitter', 'library'),
  family('Carnet', 'library'),
];

const ref = (id: string, name: string): AssetRef => ({
  id,
  kind: 'font',
  file: `assets/${id}.woff2`,
  originalName: name,
  sha256: id,
});

function bookUsing(...families: string[]): Book {
  const book = newBook({ title: 'T', innerSpreads: 2 });
  book.spreads[1]!.elements = families.map((f) => {
    const el = newElement('text', { x: 0, y: 0, w: 40, h: 10 });
    el.style.fontFamily = `'${f}', serif`;
    return el;
  });
  return book;
}

describe('missingFontFamilies', () => {
  it('names the used user-library families the album does not carry, once, bundled ones never', () => {
    const book = bookUsing('Lora', 'Bitter', 'Carnet', 'Unknown');
    expect(missingFontFamilies(book, FAMILIES)).toEqual(['Bitter', 'Carnet']);
    book.assets = { f: ref('f', 'Bitter|400|normal.woff2') };
    expect(missingFontFamilies(book, FAMILIES)).toEqual(['Carnet']);
  });

  it('is empty when the text uses bundled fonts only', () => {
    expect(missingFontFamilies(bookUsing('Lora'), FAMILIES)).toEqual([]);
  });
});

describe('startFontSync', () => {
  let editor: EditorStore;
  let assetsFor: ReturnType<typeof vi.fn>;
  let stop: () => void;
  let notify: () => void;

  async function open(book: Book): Promise<void> {
    await editor.getState().openWith(() => Promise.resolve({ book }));
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    editor = createEditorStore({ save: () => Promise.resolve() });
    assetsFor = vi.fn(async (names: string[]) =>
      names.map((n) => ref(`font-${n}`, `${n}|400|normal.woff2`)),
    );
    notify = () => undefined;
    stop = startFontSync({
      editor,
      families: () => FAMILIES,
      assetsFor: assetsFor as never,
      onFamilies: (cb) => {
        notify = cb;
        return () => undefined;
      },
    });
  });
  afterEach(() => stop());

  it('adds the font assets of a used library family in one undoable step', async () => {
    await open(bookUsing('Bitter'));
    await settle();
    expect(assetsFor).toHaveBeenCalledWith(['Bitter']);
    expect(Object.keys(editor.getState().book!.assets)).toEqual(['font-Bitter']);
    expect(editor.getState().history.labels.at(-1)).toBe(fr.fonts.undoAdd);
    // Now carried: nothing more is asked.
    await settle();
    expect(assetsFor).toHaveBeenCalledTimes(1);
  });

  it('does nothing for bundled fonts', async () => {
    await open(bookUsing('Lora'));
    await settle();
    expect(assetsFor).not.toHaveBeenCalled();
  });

  it('runs again when a text starts using another library family', async () => {
    await open(bookUsing('Bitter'));
    await settle();
    editor.getState().apply((b) => bookUsingOver(b, 'Bitter', 'Carnet'), 'x');
    await settle();
    expect(assetsFor).toHaveBeenLastCalledWith(['Carnet']);
    expect(Object.keys(editor.getState().book!.assets).sort()).toEqual([
      'font-Bitter',
      'font-Carnet',
    ]);
  });

  it('leaves an undone step undone: no sync while a redo is waiting', async () => {
    await open(bookUsing('Bitter'));
    await settle();
    editor.getState().undo();
    await settle();
    expect(editor.getState().book!.assets).toEqual({});
    expect(assetsFor).toHaveBeenCalledTimes(1);
    editor.getState().redo();
    expect(Object.keys(editor.getState().book!.assets)).toEqual(['font-Bitter']);
  });

  it('syncs when the list of fonts arrives after the album', async () => {
    const late: FontFamily[] = [];
    stop();
    stop = startFontSync({
      editor,
      families: () => late,
      assetsFor: assetsFor as never,
      onFamilies: (cb) => {
        notify = cb;
        return () => undefined;
      },
    });
    await open(bookUsing('Bitter'));
    await settle();
    expect(assetsFor).not.toHaveBeenCalled();
    late.push(family('Bitter', 'library'));
    notify();
    await settle();
    expect(assetsFor).toHaveBeenCalledWith(['Bitter']);
  });

  it('tells the console and goes on when main fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    assetsFor.mockRejectedValueOnce(new Error('disk'));
    await open(bookUsing('Bitter'));
    await settle();
    expect(error).toHaveBeenCalled();
    expect(editor.getState().book!.assets).toEqual({});
    error.mockRestore();
  });
});

/** The book with its second text using `to` instead of `from`: a user changing the font. */
function bookUsingOver(book: Book, from: string, to: string): Book {
  const copy = structuredClone(book);
  const el = newElement('text', { x: 0, y: 20, w: 40, h: 10 });
  el.style.fontFamily = `'${to}', serif`;
  void from;
  copy.spreads[1]!.elements.push(el);
  return copy;
}
