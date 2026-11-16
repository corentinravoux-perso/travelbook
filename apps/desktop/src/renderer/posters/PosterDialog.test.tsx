// @vitest-environment jsdom
import { addElement, newBook, newElement, pageBox, type Book } from '@travelbook/core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';
import { POSTER_DESTINATIONS, presetsOf } from './presets';

const apply = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true);
vi.mock('./posterActions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./posterActions')>()),
  applyPosterToCover: (...args: unknown[]) => apply(...(args as [])),
}));
const { PosterDialog, openPosterDialog } = await import('./PosterDialog');

const t = fr.poster;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

let book: Book;
async function openWith(b: Book) {
  await editorStore.getState().openWith(() => Promise.resolve({ book: b }));
  render(<PosterDialog />);
  act(() => openPosterDialog());
}

beforeEach(() => {
  apply.mockClear();
  (window as unknown as { tb: unknown }).tb = {
    project: { save: () => Promise.resolve() },
    library: { list: vi.fn(async () => []) },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => ({ ok: true, text: async () => '<svg viewBox="0 0 10 10"></svg>' }) as Response,
    ),
  );
  book = { ...newBook({ title: 'Été au Japon', innerSpreads: 2 }), spineWidth: 10 };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PosterDialog', () => {
  it('shows the 13 destination chips and "Toutes"', async () => {
    await openWith(book);
    const chips = within(screen.getByRole('group', { name: t.destinations })).getAllByRole(
      'button',
    );
    expect(chips.map((c) => c.textContent)).toEqual([
      t.all,
      ...POSTER_DESTINATIONS.map((d) => d.label),
    ]);
  });

  it('filters the gallery by destination', async () => {
    await openWith(book);
    fireEvent.click(screen.getByRole('button', { name: 'Kenya' }));
    const tiles = within(screen.getByRole('list', { name: t.gallery })).getAllByRole('button');
    expect(tiles).toHaveLength(presetsOf('kenya').length);
    expect(tiles.every((b) => b.getAttribute('aria-label')!.startsWith('Kenya'))).toBe(true);
  });

  it('fills "Lieu" from a clicked preset', async () => {
    await openWith(book);
    expect((screen.getByLabelText(t.place) as HTMLInputElement).value).toBe('ÉTÉ AU JAPON');
    fireEvent.click(screen.getByRole('button', { name: 'Chine' }));
    const first = presetsOf('chine')[0]!;
    fireEvent.click(screen.getByRole('button', { name: first.name }));
    expect((screen.getByLabelText(t.place) as HTMLInputElement).value).toBe('CHINE');
  });

  it('disables apply without a title', async () => {
    await openWith(book);
    fireEvent.change(screen.getByLabelText(t.place), { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: t.apply }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('applies at once on an empty front', async () => {
    await openWith(book);
    fireEvent.click(screen.getByRole('button', { name: t.apply }));
    expect(screen.queryByText(t.replaceQuestion)).toBeNull();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('asks before replacing what is on the front; only "Remplacer" applies', async () => {
    const front = pageBox(book, book.cover, 'right')!;
    const full = addElement(
      book,
      book.cover.id,
      newElement('text', { x: front.x + 10, y: 10, w: 40, h: 10 }),
    );
    await openWith(full);
    fireEvent.click(screen.getByRole('button', { name: t.apply }));
    expect(screen.getByText(t.replaceQuestion)).toBeTruthy();
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t.cancelReplace }));
    expect(apply).not.toHaveBeenCalled();
    expect(screen.queryByText(t.replaceQuestion)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t.apply }));
    fireEvent.click(screen.getByRole('button', { name: t.replace }));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('says inside the dialog when the poster could not be applied, and stays open', async () => {
    apply.mockResolvedValueOnce(false);
    await openWith(book);
    fireEvent.click(screen.getByRole('button', { name: t.apply }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.applyFailed);
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('open')).toBe(true);
  });

  it('disables apply and says so when the drawing cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as Response),
    );
    await openWith(book);
    expect((await screen.findByRole('alert')).textContent).toContain(t.illustrationMissing);
    expect((screen.getByRole('button', { name: t.apply }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('offers only SVG library stickers and applies one with its own title and licence', async () => {
    const cc = {
      source: 'Openverse',
      author: 'Ada',
      licence: 'CC-BY-4.0',
      url: 'https://example.org/a',
      requiresAttribution: true,
    };
    const item = (id: string, file: string, title: string, licence?: typeof cc) => ({
      id,
      kind: 'sticker',
      file,
      title,
      tags: [],
      addedAt: '2026-11-15T00:00:00Z',
      favourite: false,
      ...(licence ? { licence } : {}),
    });
    (window as unknown as { tb: { library: { list: unknown } } }).tb.library.list = vi.fn(
      async () => [
        item('sticker-a', 'files/sticker-a.svg', 'Avion', cc),
        item('sticker-b', 'files/sticker-b.png', 'Photo'),
      ],
    );
    await openWith(book);
    fireEvent.click(screen.getByRole('button', { name: t.otherSticker }));
    const avion = await screen.findByRole('button', { name: 'Avion' });
    expect(screen.queryByRole('button', { name: 'Photo' })).toBeNull();
    fireEvent.click(avion);
    fireEvent.click(screen.getByRole('button', { name: t.apply }));
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ illustration: { itemId: 'sticker-a' } }),
      { name: 'Avion', licence: cc },
      10,
    );
  });

  it('chooses the spine with the poster: "Sans tranche" turns the spine title off, applies 0', async () => {
    await openWith(book);
    const spineTitle = () => screen.getByRole('checkbox', { name: t.spine }) as HTMLInputElement;
    expect(spineTitle().disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: fr.spine.without }));
    expect(spineTitle().disabled).toBe(true);
    expect(screen.getByText(t.spineOff)).toBeTruthy();
    expect(screen.queryByLabelText(fr.spine.width)).toBeNull();
    // Nothing reaches the book before the poster is applied.
    expect(editorStore.getState().book!.spineWidth).toBe(10);
    fireEvent.click(screen.getByRole('button', { name: t.apply }));
    expect(apply).toHaveBeenCalledWith(expect.anything(), expect.anything(), 0);
  });

  it('"Avec tranche" on a book without spine offers a width the user can change', async () => {
    await openWith({ ...book, spineWidth: 0 });
    fireEvent.click(screen.getByRole('button', { name: fr.spine.with }));
    const width = screen.getByLabelText(fr.spine.width) as HTMLInputElement;
    expect(Number(width.value.replace(',', '.'))).toBeGreaterThanOrEqual(6);
    fireEvent.change(width, { target: { value: '12,5' } });
    fireEvent.keyDown(width, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: t.apply }));
    expect(apply).toHaveBeenCalledWith(expect.anything(), expect.anything(), 12.5);
  });

  it('warns when the title vanishes into the background', async () => {
    await openWith(book);
    fireEvent.change(screen.getByLabelText(t.colors.title), { target: { value: '#777777' } });
    fireEvent.change(screen.getByLabelText(t.colors.background), { target: { value: '#888888' } });
    expect(screen.getByText(t.contrast)).toBeTruthy();
  });
});
