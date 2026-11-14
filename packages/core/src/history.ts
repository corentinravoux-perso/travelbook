import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import type { Book } from './schema';

enablePatches();

export interface History {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Labels of the steps `undo` can go back through, oldest first: the last is the next undone. */
  readonly labels: string[];
}

export interface HistoryController extends History {
  /**
   * Run `op` on `book` and record it as one undo step named `label`; returns the new book.
   * Applies in a row with the same `mergeKey` (a drag, a slider, typing) form one step, which
   * keeps the label of the first. The run ends at an apply with another key or none, at an undo
   * or redo that moves a step, and at `clear`: gestures that must stay apart need different keys.
   * An `op` that changes nothing, or throws, leaves the history as it was.
   */
  apply(book: Book, op: (book: Book) => Book, label: string, mergeKey?: string): Book;
  /** The book without the last step, or `book` itself when there is none. */
  undo(book: Book): Book;
  /** The book with the last undone step put back, or `book` itself when there is none. */
  redo(book: Book): Book;
  /** Forget every step. Call it when another document replaces the one being edited. */
  clear(): void;
}

interface Step {
  label: string;
  /** Patches that redo the step, then those that undo it, both in the order they apply. */
  redo: Patch[];
  undo: Patch[];
}

const replacesRoot = (p: Patch): boolean => p.op === 'replace' && p.path.length === 0;

/** Patches that come before the last replacement of the whole book cannot change the outcome. */
function compact(patches: Patch[]): Patch[] {
  const last = patches.findLastIndex(replacesRoot);
  return last > 0 ? patches.slice(last) : patches;
}

/**
 * Undo and redo for a book edited by `Book -> Book` operations, kept as Immer patches. An
 * operation is a function of the whole book, so each patch replaces the root: the book before
 * and the book after, which share their unchanged parts with every other version. Undo and redo
 * therefore hand back the very books that were there, not copies, and a long history costs
 * little. At most `limit` steps are kept; the oldest go first.
 */
export function createHistory(limit = 100): HistoryController {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`History limit must be a positive integer, got ${limit}.`);
  }
  const undoSteps: Step[] = [];
  const redoSteps: Step[] = [];
  /** Merge key of the step on top of `undoSteps`, while it still accepts merges. */
  let openKey: string | undefined;

  return {
    get canUndo() {
      return undoSteps.length > 0;
    },
    get canRedo() {
      return redoSteps.length > 0;
    },
    get labels() {
      return undoSteps.map((s) => s.label);
    },

    apply(book, op, label, mergeKey) {
      const next = op(book);
      if (next === book) return book;
      const [result, redo, undo] = produceWithPatches(book, () => next);
      redoSteps.length = 0;
      const top = undoSteps.at(-1);
      if (mergeKey !== undefined && mergeKey === openKey && top) {
        top.redo = compact([...top.redo, ...redo]);
        top.undo = compact([...undo, ...top.undo]);
      } else {
        undoSteps.push({ label, redo, undo });
        if (undoSteps.length > limit) undoSteps.shift();
      }
      openKey = mergeKey;
      return result;
    },

    undo(book) {
      const step = undoSteps.pop();
      if (!step) return book;
      openKey = undefined;
      redoSteps.push(step);
      return applyPatches(book, step.undo);
    },

    redo(book) {
      const step = redoSteps.pop();
      if (!step) return book;
      openKey = undefined;
      undoSteps.push(step);
      return applyPatches(book, step.redo);
    },

    clear() {
      undoSteps.length = 0;
      redoSteps.length = 0;
      openKey = undefined;
    },
  };
}
