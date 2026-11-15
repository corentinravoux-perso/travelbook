import { fontFaceOfAsset, fontFamiliesUsed, type AssetRef, type Book } from '@travelbook/core';
import type { FontFamily } from '../../shared/api';
import { fontListStore } from '../fonts/fontList';
import { editorStore, type EditorStore } from '../store/editor';
import { fr } from '../strings/fr';
import { withAssets } from './photoImport';

/**
 * The user-library families a book's text uses and the book does not carry yet: used by a text
 * (base family or a mark), in the user's library, and with no font asset of that family in
 * `book.assets`. Bundled families are always there and never copied.
 */
export function missingFontFamilies(book: Book, families: readonly FontFamily[]): string[] {
  const carried = new Set<string>();
  for (const asset of Object.values(book.assets)) {
    const face = fontFaceOfAsset(asset);
    if (face) carried.add(face.family.toLowerCase());
  }
  const own = new Map(
    families.filter((f) => f.origin === 'library').map((f) => [f.family.toLowerCase(), f.family]),
  );
  return fontFamiliesUsed(book)
    .map((name) => own.get(name.toLowerCase()))
    .filter((name): name is string => name !== undefined && !carried.has(name.toLowerCase()));
}

export interface FontSyncDeps {
  editor: EditorStore;
  families(): readonly FontFamily[];
  /** Tell `cb` when the font list changes; returns the function that stops it. */
  onFamilies(cb: () => void): () => void;
  assetsFor(families: string[]): Promise<AssetRef[]>;
}

/**
 * Keep the album carrying the fonts its text uses. After a change that uses a user-library font
 * the album lacks, main copies its faces into `assets/` and the asset records join the book in
 * one `store.apply` (undoable, saved). Nothing runs while an undo is waiting to be redone: an
 * undone step must stay undone. Returns the function that stops it.
 */
export function startFontSync(
  deps: FontSyncDeps = {
    editor: editorStore,
    families: () => fontListStore.getState().families,
    onFamilies: (cb) => fontListStore.subscribe(cb),
    assetsFor: (names) => window.tb.library.fonts.assetsFor(names),
  },
): () => void {
  let running = false;
  let again = false;

  const run = async (): Promise<void> => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        const { book, history, opening } = deps.editor.getState();
        if (book === null || opening || history.canRedo) continue;
        const names = missingFontFamilies(book, deps.families());
        if (names.length === 0) continue;
        const refs = await deps.assetsFor(names);
        const now = deps.editor.getState();
        if (now.book === null || now.history.canRedo) continue;
        if (refs.every((r) => now.book!.assets[r.id] !== undefined)) continue;
        now.apply((b) => withAssets(b, refs), fr.fonts.undoAdd);
      } while (again);
    } catch (error) {
      // The album falls back to another font; the next save copies the files again.
      console.error('Copying fonts into the album failed', error);
    } finally {
      running = false;
    }
  };

  // A change of book, or the end of an open (the book is shown while `opening` is still on).
  let last: { book: Book | null; opening: boolean } = { book: null, opening: false };
  const stopEditor = deps.editor.subscribe((state) => {
    if (state.book === last.book && state.opening === last.opening) return;
    last = { book: state.book, opening: state.opening };
    void run();
  });
  // A list that arrives after the album was opened may make a family known.
  const stopFamilies = deps.onFamilies(() => void run());
  void run();
  return () => {
    stopEditor();
    stopFamilies();
  };
}
