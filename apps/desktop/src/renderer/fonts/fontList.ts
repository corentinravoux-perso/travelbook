import { fontFaceOfAsset, type Book } from '@travelbook/core';
import { fontFaceCss, whenFontsReady, type FontFile } from '@travelbook/render';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { FontCategory, FontFamily } from '../../shared/api';
import { BOOK_FONTS, firstFamily, installBookFonts } from './bookFonts';

/** The generic family each category falls back to, as in `resources/fonts.json`. */
export const GENERIC: Record<FontCategory, string> = {
  manuscrite: 'cursive',
  serif: 'serif',
  sans: 'sans-serif',
  titre: 'sans-serif',
  machine: 'monospace',
};

/** The value stored in a text for a family: `'Lora', serif`. */
export const cssOf = (family: Pick<FontFamily, 'family' | 'category'>): string =>
  `'${family.family}', ${GENERIC[family.category]}`;

export interface FontListState {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  /** Bundled families first, then the user's. */
  families: FontFamily[];
  /** Read the list from main (once; `refresh` reads it again). */
  load(): Promise<void>;
  refresh(): Promise<void>;
}

export type FontListStore = StoreApi<FontListState>;

/** `@font-face` rules for the faces of `families`; the six fonts of `bookFonts.ts` are already declared. */
export function listFontFaces(families: readonly FontFamily[]): FontFile[] {
  const declared = new Set(BOOK_FONTS.map((f) => f.family));
  return families
    .filter((f) => !declared.has(f.family))
    .flatMap((f) =>
      f.faces.map((face) => ({
        family: f.family,
        weight: face.weight,
        style: face.style,
        url: face.url,
      })),
    );
}

let style: HTMLStyleElement | null = null;

/** Declare the faces of the list to the document, replacing the previous declaration. */
function declare(families: readonly FontFamily[]): void {
  if (style === null) {
    style = document.createElement('style');
    style.dataset['fontList'] = '';
    document.head.append(style);
  }
  style.textContent = fontFaceCss(listFontFaces(families));
}

export function createFontListStore(
  list: () => Promise<FontFamily[]> = () => window.tb.library.fonts.list(),
): FontListStore {
  const store = createStore<FontListState>((set, get) => {
    const read = async (): Promise<void> => {
      try {
        const families = await list();
        declare(families);
        set({ status: 'ready', families });
      } catch (error) {
        console.error('Font list failed', error);
        // A list already shown stays usable.
        set({ status: get().families.length > 0 ? 'ready' : 'failed' });
      }
    };
    return {
      status: 'idle',
      families: [],
      load: async () => {
        if (get().status !== 'idle') return;
        set({ status: 'loading' });
        await read();
      },
      refresh: read,
    };
  });
  return store;
}

export const fontListStore: FontListStore = createFontListStore();

export const useFontList = <T>(select: (state: FontListState) => T): T =>
  useStore(fontListStore, select);

/** The list entry a stored family (`'Lora', serif` or `Lora`) names. */
export function familyNamed(families: readonly FontFamily[], css: string): FontFamily | undefined {
  const name = firstFamily(css).toLowerCase();
  return families.find((f) => f.family.toLowerCase() === name);
}

/**
 * Families only the album has (font assets whose family is not in the list), so that a text
 * using one still shows its name in the picker.
 */
export function albumOnlyFamilies(
  book: Book | null,
  families: readonly FontFamily[],
): FontFamily[] {
  if (book === null) return [];
  const known = new Set(families.map((f) => f.family.toLowerCase()));
  const found = new Map<string, FontFamily>();
  for (const asset of Object.values(book.assets)) {
    const face = fontFaceOfAsset(asset);
    if (face === null || known.has(face.family.toLowerCase())) continue;
    let family = found.get(face.family);
    if (family === undefined) {
      family = {
        family: face.family,
        category: 'sans',
        origin: 'project',
        faces: [],
        licence: asset.licence ?? { source: '', licence: '', url: '', requiresAttribution: false },
      };
      found.set(face.family, family);
    }
    family.faces.push({
      weight: face.weight,
      style: face.style,
      url: `tb://asset/${asset.id}?v=original`,
    });
  }
  return [...found.values()];
}

/**
 * Resolves when the faces of `families` are loaded, so text drawn now is measured with them. The
 * families the app declares itself are waited for; any other name (an album's own font is
 * declared by the view that draws it) is left to the browser.
 */
export function fontsReady(families: string[]): Promise<void> {
  installBookFonts();
  const known = new Set([
    ...BOOK_FONTS.map((f) => f.family),
    ...fontListStore.getState().families.map((f) => f.family),
  ]);
  return whenFontsReady(families.map(firstFamily).filter((f) => known.has(f)));
}
