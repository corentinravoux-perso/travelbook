import { MM_TO_PX, updateElements } from '@travelbook/core';
import { editorStore } from '../store/editor';

/** Heights are kept to this step, in mm (0.01 mm is a twentieth of a pixel at 96 dpi). */
const STEP_MM = 0.01;
/** A box counts as too short only when it misses this much, in mm: no change for rounding noise. */
const TOLERANCE_MM = 0.005;

/**
 * The height in mm a text box (`.tb-text`) needs to show all its text: the laid-out content plus
 * the padding. It reads the computed height, which is unrotated, unscaled and not rounded to whole
 * pixels, so it is the same at any zoom.
 */
export function neededHeightMm(box: HTMLElement): number {
  const content = box.querySelector<HTMLElement>('.tb-text__content');
  if (!content) return 0;
  const style = getComputedStyle(box);
  const px =
    parseFloat(getComputedStyle(content).height) +
    parseFloat(style.paddingTop) +
    parseFloat(style.paddingBottom);
  if (!Number.isFinite(px)) return 0;
  return Math.ceil(px / MM_TO_PX / STEP_MM - 1e-9) * STEP_MM;
}

/** Is `height` (the box's own) too short for `needed`? */
export const isTooShort = (height: number, needed: number): boolean =>
  needed > height + TOLERANCE_MM;

/** The canvas box of text element `id`, drawn by `TextView` or by the editor. */
export function textBoxOf(id: string): HTMLElement | null {
  for (const box of document.querySelectorAll<HTMLElement>('.canvas-paper .tb-text')) {
    if (box.dataset['elementId'] === id) return box;
  }
  return null;
}

/**
 * Make text element `id` tall enough for its text, as one change (`mergeKey` lets a run of them
 * form one undo step). A box taller than its text keeps its height: that height is a minimum.
 */
export function growToFit(spreadId: string, id: string, label: string, mergeKey?: string): void {
  const box = textBoxOf(id);
  const { book } = editorStore.getState();
  if (!box || !book) return;
  const spread = [book.cover, ...book.spreads].find((s) => s.id === spreadId);
  const el = spread?.elements.find((e) => e.id === id);
  if (el?.type !== 'text') return;
  const needed = neededHeightMm(box);
  if (!isTooShort(el.h, needed)) return;
  editorStore
    .getState()
    .apply((b) => updateElements(b, spreadId, [id], { h: needed }), label, mergeKey);
}
