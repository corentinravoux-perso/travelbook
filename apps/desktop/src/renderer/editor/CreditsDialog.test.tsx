// @vitest-environment jsdom
import { newBook, newElement, type Book } from '@travelbook/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { editorStore, findSpread } from '../store/editor';
import { fr } from '../strings/fr';
import { CreditsDialog, openCredits } from './CreditsDialog';

beforeAll(() => {
  // jsdom has no <dialog> behaviour.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

let book: Book;
beforeEach(async () => {
  (window as unknown as { tb: unknown }).tb = { project: { save: () => Promise.resolve() } };
  book = newBook({ title: 'T', innerSpreads: 2 });
  book.assets['s1'] = {
    id: 's1',
    kind: 'sticker',
    file: 'assets/s1.svg',
    originalName: 'Avion.svg',
    sha256: 's1',
    licence: {
      source: 'Iconify (noto)',
      author: 'Google',
      licence: 'Apache-2.0',
      url: 'https://x.org',
      requiresAttribution: false,
    },
  };
  book.assets['p1'] = {
    id: 'p1',
    kind: 'photo',
    file: 'originals/p1.jpg',
    originalName: 'IMG.jpg',
    sha256: 'p1',
  };
  book.spreads[1]!.elements = [
    { ...newElement('sticker', { x: 0, y: 0, w: 10, h: 10 }), assetId: 's1' },
    { ...newElement('photo', { x: 0, y: 20, w: 10, h: 10 }), assetId: 'p1' },
  ] as never;
  await editorStore.getState().openWith(() => Promise.resolve({ book }));
  editorStore.getState().goToSpread(book.spreads[1]!.id);
});
afterEach(() => {
  cleanup();
});

describe('CreditsDialog', () => {
  it('lists the licences of the assets the album uses, photos without licence left out', () => {
    render(<CreditsDialog />);
    act(() => openCredits());
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Avion, Google, Apache-2.0 (Iconify (noto))']);
  });

  it('says so when nothing needs a credit and disables the insert button', () => {
    editorStore.getState().apply((b) => ({ ...b, assets: {} }), 'x');
    render(<CreditsDialog />);
    act(() => openCredits());
    expect(screen.getByText(fr.credits.empty)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: fr.credits.insert }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('inserts the credits as a text on the current page in one undo step, and closes', () => {
    render(<CreditsDialog />);
    act(() => openCredits());
    const before = findSpread(editorStore.getState().book, book.spreads[1]!.id)!.elements.length;
    fireEvent.click(screen.getByRole('button', { name: fr.credits.insert }));
    const spread = findSpread(editorStore.getState().book, book.spreads[1]!.id)!;
    expect(spread.elements).toHaveLength(before + 1);
    const text = spread.elements.at(-1)!;
    expect(text.type).toBe('text');
    expect(JSON.stringify((text as { doc: unknown }).doc)).toContain('Apache-2.0');
    expect(editorStore.getState().selection).toEqual([text.id]);
    expect(editorStore.getState().history.labels.at(-1)).toBe(fr.credits.undoInsert);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
