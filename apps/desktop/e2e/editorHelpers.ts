import { expect, type Page } from '@playwright/test';
import type { Book, Element } from '@travelbook/core';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFromHome } from './home';

/** The e2e build exposes the editor store (see `App.tsx`). */
export interface EditorHandle {
  getState(): {
    book: Book;
    zoom: number;
    selection: string[];
    currentSpreadId: string;
    tool: string;
    editingId: string | null;
    history: { labels: string[] };
    apply(op: (book: Book) => Book, label: string): void;
    flush(): Promise<void>;
    setZoom(zoom: number): void;
    select(ids: string[]): void;
  };
  setState(patch: { currentSpreadId?: string; selection?: string[] }): void;
}

/** Run `fn` in the page with the editor store and `arg` (a function and a JSON argument). */
export const evalEditor = <R, A>(page: Page, fn: (e: EditorHandle, arg: A) => R, arg: A) =>
  page.evaluate(
    ([source, a]) =>
      new Function('e', 'a', `return (${source})(e, a)`)(
        (window as unknown as { __tbEditor: EditorHandle }).__tbEditor,
        a,
      ) as R,
    [fn.toString(), arg] as const,
  );

export const MM_TO_PX = 96 / 25.4;

/**
 * Create an album on its first inner spread (two A4 pages) at zoom 1, with `elements` on it, and
 * wait for the layout to settle before anything is aimed at the page.
 */
export async function openAlbum(page: Page, title: string, elements: unknown[] = []) {
  await createFromHome(page, title);
  await expect(page.getByRole('img', { name: /Double page/ })).toBeVisible();
  await evalEditor(
    page,
    (e, els) => {
      const id = e.getState().book.spreads[1]!.id;
      e.setState({ currentSpreadId: id });
      if ((els as Element[]).length > 0) {
        e.getState().apply(
          (b) => ({
            ...b,
            spreads: b.spreads.map((s) =>
              s.id === id ? { ...s, elements: [...s.elements, ...(els as Element[])] } : s,
            ),
          }),
          'Ajouter',
        );
      }
      e.getState().setZoom(1);
    },
    elements,
  );
  await expect(page.getByRole('img', { name: 'Double page 2' })).toBeVisible();
  const paper = page.locator('.canvas-paper');
  let last = '';
  await expect
    .poll(async () => {
      const now = JSON.stringify(await paper.boundingBox());
      const settled = now === last;
      last = now;
      return settled;
    })
    .toBe(true);
}

/** A point of the page in mm, relative to the top left of `.canvas-paper`, in px. */
export async function pagePx(page: Page, mmX: number, mmY: number) {
  const zoom = await evalEditor(page, (e) => e.getState().zoom, null);
  return { x: mmX * MM_TO_PX * zoom, y: mmY * MM_TO_PX * zoom };
}

/** The book as saved on disk, once the pending save has been flushed. */
export async function savedBook(page: Page, albums: string, slug: string): Promise<Book> {
  await evalEditor(page, (e) => e.getState().flush(), null);
  return JSON.parse(
    await readFile(join(albums, `${slug}.travelbook`, 'book.json'), 'utf8'),
  ) as Book;
}
