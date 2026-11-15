// @vitest-environment jsdom
import { newBook, newElement, type Book, type PhotoElement, type Template } from '@travelbook/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexTemplates, NO_FILTERS } from '../panels/templatesModel';
import { editorStore, findSpread } from '../store/editor';
import { templatesStore } from '../store/templates';
import { fr } from '../strings/fr';
import { PageBar } from './PageBar';

const frame = (n: number): Template => ({
  id: `b-r${n}`,
  name: `R${n}`,
  category: 'photos',
  scope: 'page',
  photoCount: 2,
  origin: 'bundled',
  grid: {
    root: { split: 'col', weights: [1, 1], children: [{ slot: 'photo' }, { slot: 'photo' }] },
    fullBleed: false,
  },
});
const other = { ...frame(2), id: 'b-r2', grid: { ...frame(2).grid!, fullBleed: true } } as Template;

let book: Book;
const photo = (id: string, x: number, assetId: string | null): PhotoElement => ({
  ...newElement('photo', { x, y: 20, w: 40, h: 40 }),
  id,
  assetId,
});

beforeEach(async () => {
  (window as unknown as { tb: unknown }).tb = { project: { save: () => Promise.resolve() } };
  book = newBook({ title: 'T', innerSpreads: 2 });
  book.spreads[1]!.elements = [photo('a', 20, 'A'), photo('b', 80, 'B')];
  await editorStore.getState().openWith(() => Promise.resolve({ book }));
  editorStore.getState().goToSpread(book.spreads[1]!.id);
  editorStore.getState().setActivePage('left');
  const bundled = [frame(1), other];
  templatesStore.setState({
    status: 'ready',
    bundled,
    user: [],
    index: indexTemplates(bundled),
    tab: 'classic',
    filters: NO_FILTERS,
    last: {},
    saved: null,
  });
});
afterEach(cleanup);

const shown = (id: string) => {
  const current = editorStore.getState().book!;
  return { book: current, spread: findSpread(current, id)! };
};

describe('PageBar', () => {
  it('names the two pages of an inner spread and points the templates at the one clicked', () => {
    const { book: b, spread } = shown(book.spreads[1]!.id);
    render(<PageBar book={b} spread={spread} scale={1} />);
    const left = screen.getByRole('button', { name: fr.templates.pointAtPage('Page 2') });
    const right = screen.getByRole('button', { name: fr.templates.pointAtPage('Page 3') });
    expect(left.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(right);
    expect(editorStore.getState().activePage).toBe('right');
    expect(right.getAttribute('aria-pressed')).toBe('true');
    expect(left.getAttribute('aria-pressed')).toBe('false');
  });

  it('has one page on the first spread and the front on the cover, with nothing to point at', () => {
    const first = shown(book.spreads[0]!.id);
    const { unmount } = render(<PageBar book={first.book} spread={first.spread} scale={1} />);
    expect(screen.getByText('Page 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Cibler/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Mise en page aléatoire/ })).toHaveLength(1);
    unmount();
    const cover = shown(book.cover.id);
    render(<PageBar book={cover.book} spread={cover.spread} scale={1} />);
    expect(screen.getByText(fr.templates.coverLabel)).toBeTruthy();
  });

  it('"Mise en page aléatoire" is off for a page without photos and lays the page out again otherwise', () => {
    const { book: b, spread } = shown(book.spreads[1]!.id);
    render(<PageBar book={b} spread={spread} scale={1} />);
    const randomRight = screen.getByRole('button', { name: fr.templates.randomFor('Page 3') });
    expect((randomRight as HTMLButtonElement).disabled).toBe(true);
    const randomLeft = screen.getByRole('button', { name: fr.templates.randomFor('Page 2') });
    expect((randomLeft as HTMLButtonElement).disabled).toBe(false);
    // Two photos on the left page, two templates with two photos: the first lands, the next differs.
    act(() => templatesStore.getState().apply(frame(1)));
    const lastId = () => templatesStore.getState().last[`${book.spreads[1]!.id}:left`];
    expect(lastId()).toBe('b-r1');
    fireEvent.click(randomLeft);
    expect(lastId()).toBe('b-r2');
    fireEvent.click(randomLeft);
    expect(lastId()).toBe('b-r1');
    expect(editorStore.getState().history.labels).toEqual([
      fr.templates.undoApply,
      fr.templates.undoRandom,
      fr.templates.undoRandom,
    ]);
  });
});
