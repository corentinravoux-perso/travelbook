// @vitest-environment jsdom
import { newBook, type AssetRef } from '@travelbook/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FontFamily } from '../../shared/api';
import { BOOK_FONTS } from './bookFonts';
import {
  albumOnlyFamilies,
  createFontListStore,
  cssOf,
  familyNamed,
  listFontFaces,
} from './fontList';

const licence = {
  source: 'S',
  licence: 'OFL-1.1',
  url: 'https://x.org',
  requiresAttribution: false,
};
const family = (
  name: string,
  origin: FontFamily['origin'] = 'bundled',
  category: FontFamily['category'] = 'serif',
): FontFamily => ({
  family: name,
  category,
  origin,
  licence,
  faces: [
    { weight: 400, style: 'normal', url: `tb://resource/fonts/${name}/regular.woff2` },
    { weight: 700, style: 'italic', url: `tb://resource/fonts/${name}/bold-italic.woff2` },
  ],
});

afterEach(() => {
  document.head.querySelectorAll('style[data-font-list]').forEach((n) => n.remove());
});

describe('cssOf and familyNamed', () => {
  it('writes the stored value with the generic family of the category', () => {
    expect(cssOf(family('Lora'))).toBe("'Lora', serif");
    expect(cssOf(family('Caveat', 'bundled', 'manuscrite'))).toBe("'Caveat', cursive");
    expect(cssOf(family('Space Mono', 'bundled', 'machine'))).toBe("'Space Mono', monospace");
    expect(cssOf(family('Anton', 'bundled', 'titre'))).toBe("'Anton', sans-serif");
  });

  it('agrees with the value of the six book fonts', () => {
    // `BOOK_FONTS[i].css` is what existing albums store: the same text must come out.
    const category = {
      Inter: 'sans',
      Lora: 'serif',
      'Playfair Display': 'serif',
      'Cormorant Garamond': 'serif',
      Oswald: 'titre',
      Caveat: 'manuscrite',
    } as const;
    for (const font of BOOK_FONTS) {
      expect(
        cssOf(family(font.family, 'bundled', category[font.family as keyof typeof category])),
      ).toBe(font.css);
    }
  });

  it('finds a family by the stored value, whatever the case', () => {
    const list = [family('Lora'), family('Bitter', 'library')];
    expect(familyNamed(list, "'bitter', serif")?.family).toBe('Bitter');
    expect(familyNamed(list, 'Lora')?.origin).toBe('bundled');
    expect(familyNamed(list, "'Other', serif")).toBeUndefined();
  });
});

describe('listFontFaces', () => {
  it('declares every face of the list except the six fonts bookFonts.ts already declares', () => {
    const faces = listFontFaces([family('Lora'), family('Anton'), family('Bitter', 'library')]);
    expect(faces.map((f) => `${f.family} ${f.weight} ${f.style}`)).toEqual([
      'Anton 400 normal',
      'Anton 700 italic',
      'Bitter 400 normal',
      'Bitter 700 italic',
    ]);
    expect(faces[0]?.url).toBe('tb://resource/fonts/Anton/regular.woff2');
  });
});

describe('the font list store', () => {
  it('loads once, declares the faces in <head>, and refreshes on demand', async () => {
    const list = vi
      .fn<() => Promise<FontFamily[]>>()
      .mockResolvedValueOnce([family('Anton')])
      .mockResolvedValueOnce([family('Anton'), family('Bitter', 'library')]);
    const store = createFontListStore(list);
    await store.getState().load();
    await store.getState().load();
    expect(list).toHaveBeenCalledTimes(1);
    expect(store.getState().status).toBe('ready');
    const style = document.head.querySelector('style[data-font-list]')!;
    expect(style.textContent).toContain('font-family:"Anton"');
    expect(style.textContent).not.toContain('Bitter');
    await store.getState().refresh();
    expect(store.getState().families.map((f) => f.family)).toEqual(['Anton', 'Bitter']);
    expect(document.head.querySelectorAll('style[data-font-list]')).toHaveLength(1);
    expect(style.textContent).toContain('font-family:"Bitter"');
  });

  it('says failed when the first read fails, and keeps a list it already has when a refresh fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = createFontListStore(() => Promise.reject(new Error('x')));
    await store.getState().load();
    expect(store.getState().status).toBe('failed');
    const second = createFontListStore(
      vi
        .fn()
        .mockResolvedValueOnce([family('Anton')])
        .mockRejectedValue(new Error('x')),
    );
    await second.getState().load();
    await second.getState().refresh();
    expect(second.getState().status).toBe('ready');
    expect(second.getState().families).toHaveLength(1);
  });
});

describe('albumOnlyFamilies', () => {
  it('lists the families only the album carries, from its font assets', () => {
    const book = newBook({ title: 'T', innerSpreads: 2 });
    const asset = (id: string, name: string): AssetRef => ({
      id,
      kind: 'font',
      file: `assets/${id}.woff2`,
      originalName: name,
      sha256: id,
    });
    book.assets = {
      a: asset('a', 'Carnet|400|normal.woff2'),
      b: asset('b', 'Carnet|700|italic.woff2'),
      c: asset('c', 'Lora|400|normal.woff2'),
      d: asset('d', 'not a face.woff2'),
    };
    const found = albumOnlyFamilies(book, [family('Lora')]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ family: 'Carnet', origin: 'project' });
    expect(found[0]!.faces.map((f) => f.url)).toEqual([
      'tb://asset/a?v=original',
      'tb://asset/b?v=original',
    ]);
    expect(albumOnlyFamilies(null, [])).toEqual([]);
  });
});
