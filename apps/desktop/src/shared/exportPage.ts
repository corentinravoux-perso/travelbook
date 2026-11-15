import type { Book, Rect, Spread } from '@travelbook/core';

/**
 * What main hands the export window for one page (Task 7.2): the page is drawn by `SpreadView` at
 * `export` quality from this and nothing else. The window has no preload and no file path: images
 * are fetched from `tb://export/<token>/...`.
 */
export interface ExportPageJob {
  /** Names the running export in `tb://export/<token>/...`. */
  token: string;
  /** The album with no inner spreads: format, bleeds, assets. */
  book: Book;
  /** The spread the page is cut from, with only the elements that reach `clip`. */
  spread: Spread;
  /** The region of the spread to show, in mm. */
  clip: Rect;
  /** File name of the derivative of each photo element, by element id. */
  derivatives: Record<string, string>;
}

/** What `window.__tbExport` offers main (called with `webContents.executeJavaScript`). */
export interface ExportPageHandle {
  /** Draw a page and resolve once its fonts and images are loaded and decoded; rejects otherwise. */
  show(job: ExportPageJob): Promise<void>;
}
