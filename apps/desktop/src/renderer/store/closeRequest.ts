import type { CoverThumbs } from '../editor/coverThumb';
import type { EditorStore } from './editor';

/**
 * Main asks the renderer to save before the window closes (see `main/close-guard.ts`, which
 * allows 5 s for the answer). The answer is the book's save and nothing else: a rejection makes
 * main ask the user. The cover thumbnail is started alongside as a best effort. It is never
 * awaited, because it can take a while or never finish (a minimized window paints no frames),
 * and it must not make a saved book look like a failed save.
 */
export function answerCloseRequest(
  editor: EditorStore,
  thumbs: Pick<CoverThumbs, 'flush'>,
): Promise<void> {
  void thumbs.flush(); // never rejects
  return editor.getState().flush();
}
