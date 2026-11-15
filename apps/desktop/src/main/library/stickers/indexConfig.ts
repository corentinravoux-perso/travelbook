import type { Options } from 'minisearch';

/** Lower case, accents removed: `Valisé`, `VALISE` and `valise` are the same word. */
export const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** What a sticker document holds. `id` is the icon's name inside its set. */
export interface StickerDoc {
  id: string;
  /** The icon's own name, `luggage-off`; the tokenizer splits it at the dashes. */
  name: string;
  category: string;
  /** French keywords, plus the names of the icon's aliases. */
  kw: string;
  title: string;
}

/**
 * The options of every sticker index. The build script and the app must use the very same ones:
 * a serialised MiniSearch index is only valid with the options that made it (minisearch's own
 * rule), so both import this object.
 */
export const INDEX_OPTIONS: Options<StickerDoc> = {
  fields: ['name', 'category', 'kw'],
  storeFields: ['title', 'category'],
  processTerm: (term) => fold(term),
  searchOptions: {
    boost: { name: 3, kw: 2 },
    prefix: true,
    combineWith: 'AND',
    processTerm: (term) => fold(term),
  },
};
