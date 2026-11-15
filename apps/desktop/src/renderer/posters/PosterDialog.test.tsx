// @vitest-environment jsdom
import { addElement, newBook, newElement, pageBox, type Book } from '@travelbook/core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';
import { POSTER_DESTINATIONS, presetsOf } from './presets';

const apply = vi.fn(async () => true);
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

  it('warns when the title vanishes into the background', async () => {
    await openWith(book);
    fireEvent.change(screen.getByLabelText(t.colors.title), { target: { value: '#777777' } });
    fireEvent.change(screen.getByLabelText(t.colors.background), { target: { value: '#888888' } });
    expect(screen.getByText(t.contrast)).toBeTruthy();
  });
});
