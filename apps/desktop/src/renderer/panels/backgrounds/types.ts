import type { AssetRef, Background, Book, Spread } from '@travelbook/core';
import type { BundledBackground } from '../../../shared/api';
import type { Target } from './model';

export interface ApplyOptions {
  /** Assets the background uses that the book does not hold yet; added in the same undo step. */
  assets?: AssetRef[];
  /** Changes in a row with the same key are one undo step (a drag on a slider). */
  mergeKey?: string;
  /** The undo step's name; `fr.backgrounds.undoSet` when omitted. */
  label?: string;
}

/** What every tab of the backgrounds panel receives. */
export interface TabProps {
  book: Book;
  spread: Spread;
  target: Target;
  /** The background the target has now. */
  current: Background | undefined;
  bundled: BundledBackground[];
  apply(bg: Background, options?: ApplyOptions): void;
  /** Report a failure of main (an import, a copy): it is logged and told to the user. */
  fail(error: unknown): void;
}
