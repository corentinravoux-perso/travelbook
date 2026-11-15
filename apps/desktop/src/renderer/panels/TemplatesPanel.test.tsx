// @vitest-environment jsdom
import {
  newBook,
  newElement,
  type Book,
  type PhotoElement,
  type Template,
  type Theme,
} from '@travelbook/core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import covers from '../../../resources/templates/covers.json';
import openings from '../../../resources/templates/openings.json';
import photos from '../../../resources/templates/photos.json';
import spreads from '../../../resources/templates/spreads.json';
import texte from '../../../resources/templates/texte.json';
import shippedThemes from '../../../resources/templates/themes.json';
import { editorStore, findSpread } from '../store/editor';
import { templatesStore } from '../store/templates';
import { fr } from '../strings/fr';
import { NO_FILTERS } from './templatesModel';
import { TemplatesPanel } from './TemplatesPanel';

const bundled = [photos, covers, openings, texte, spreads].flat() as unknown as Template[];
const themes = shippedThemes as Theme[];

let stored: Template[];
const user = {
  list: vi.fn(() => Promise.resolve([...stored])),
  save: vi.fn((t: Template) => {
    stored = [...stored.filter((s) => s.id !== t.id), t];
    return Promise.resolve();
  }),
  delete: vi.fn((id: string) => {
    stored = stored.filter((s) => s.id !== id);
    return Promise.resolve();
  }),
};

const photo = (id: string, y: number, assetId: string): PhotoElement => ({
  ...newElement('photo', { x: 20, y, w: 40, h: 40 }),
  id,
  assetId,
});

let book: Book;
async function open(innerPhotos = 3): Promise<void> {
  book = newBook({ title: 'T', innerSpreads: 2 });
  book.spreads[1]!.elements = Array.from({ length: innerPhotos }, (_, i) =>
    photo(`p${i}`, 10 + i * 50, `asset${i}`),
  );
  await editorStore.getState().openWith(() => Promise.resolve({ book }));
  editorStore.getState().goToSpread(book.spreads[1]!.id);
  editorStore.getState().setActivePage('left');
}

const spreadNow = () => findSpread(editorStore.getState().book, book.spreads[1]!.id)!;
const framesNow = () => spreadNow().elements.filter((e) => e.type === 'photo');

beforeEach(async () => {
  stored = [];
  // The editor saves the book a second after a change: the main process is stubbed too.
  (window as unknown as { tb: unknown }).tb = {
    project: { save: () => Promise.resolve() },
    library: {
      bundledTemplates: () => Promise.resolve({ templates: bundled, themes }),
      userTemplates: user,
    },
  };
  templatesStore.setState({
    status: 'idle',
    bundled: [],
    user: [],
    tab: 'classic',
    filters: NO_FILTERS,
    margin: null,
    gap: 4,
    last: {},
    saved: null,
  });
  await open();
});
afterEach(() => {
  cleanup();
});

async function show() {
  render(<TemplatesPanel />);
  await screen.findByRole('tablist');
}
const tiles = () => Array.from(document.querySelectorAll<HTMLElement>('.tpl-tile'));

describe('TemplatesPanel', () => {
  it('asks for an album when none is open, and shows loading, then the list', async () => {
    render(<TemplatesPanel />);
    expect(screen.getByText(fr.templates.loading)).toBeTruthy();
    await screen.findByRole('tablist');
    expect(tiles().length).toBeGreaterThan(50);
  });

  it('says so when the templates cannot be read, and tries again', async () => {
    const bundledTemplates = vi
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue({ templates: bundled, themes });
    (window as unknown as { tb: unknown }).tb = {
      project: { save: () => Promise.resolve() },
      library: { bundledTemplates, userTemplates: user },
    };
    render(<TemplatesPanel />);
    await screen.findByText(fr.templates.loadFailed);
    fireEvent.click(screen.getByRole('button', { name: fr.templates.retry }));
    await screen.findByRole('tablist');
  });

  it('on an inner spread lists page templates and spread templates, never a cover', async () => {
    await show();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings.some((h) => h?.startsWith(fr.templates.sectionPages))).toBe(true);
    expect(headings.some((h) => h?.startsWith(fr.templates.sectionSpreads))).toBe(true);
    const ids = tiles().map((el) => el.dataset['templateId']);
    expect(ids.some((id) => id?.startsWith('b-c-'))).toBe(false);
  });

  it('a photo-count chip narrows the list to that count, and pressing it again lifts the filter', async () => {
    await show();
    const all = tiles().length;
    fireEvent.click(screen.getByRole('button', { name: fr.templates.chipName(3) }));
    expect(tiles().length).toBeGreaterThanOrEqual(12);
    expect(tiles().length).toBeLessThan(all);
    expect(tiles().every((el) => el.dataset['photos'] === '3')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: fr.templates.chipName(3) }));
    expect(tiles()).toHaveLength(all);
    fireEvent.click(screen.getByRole('button', { name: fr.templates.chipName(7) }));
    expect(tiles().every((el) => Number(el.dataset['photos']) >= 7)).toBe(true);
  });

  it('the category select narrows the list', async () => {
    await show();
    fireEvent.change(screen.getByLabelText(fr.templates.categoryLabel), {
      target: { value: 'texte' },
    });
    expect(tiles().length).toBeGreaterThanOrEqual(6);
    expect(tiles().every((el) => el.dataset['photos'] === '0')).toBe(true);
  });

  it('with the cover in view lists covers only, then pages too when asked', async () => {
    await show();
    act(() => editorStore.getState().goToSpread(book.cover.id));
    expect(screen.getByText(fr.templates.targetCover)).toBeTruthy();
    const ids = () => tiles().map((el) => el.dataset['templateId']!);
    expect(ids().length).toBeGreaterThanOrEqual(30);
    expect(ids().every((id) => bundled.find((t) => t.id === id)?.category === 'couverture')).toBe(
      true,
    );
    expect(screen.queryByLabelText(fr.templates.categoryLabel)).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: fr.templates.withPages }));
    expect(ids().some((id) => bundled.find((t) => t.id === id)?.category === 'photos')).toBe(true);
  });

  it('Thématique lists the themes, each with its cover first on the cover', async () => {
    await show();
    fireEvent.click(screen.getByRole('tab', { name: fr.templates.themed }));
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent ?? '');
    for (const theme of themes) expect(headings.some((h) => h.startsWith(theme.name))).toBe(true);
    act(() => editorStore.getState().goToSpread(book.cover.id));
    expect(tiles().map((el) => el.dataset['templateId'])).toEqual(
      themes.map((t) => t.coverTemplateId),
    );
  });

  it('clicking a tile lays it out on the page in view, as one undo step, and marks the tile', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: fr.templates.chipName(3) }));
    const tile = tiles()[0]!;
    fireEvent.click(tile);
    expect(framesNow()).toHaveLength(3);
    expect(framesNow().every((e) => e.x < 210)).toBe(true);
    expect(editorStore.getState().history.labels).toEqual([fr.templates.undoApply]);
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    expect(tiles().filter((el) => el.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('the gap slider re-applies the last grid template, one undo step for the drag', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: fr.templates.chipName(3) }));
    const grid = tiles().find(
      (el) => bundled.find((t) => t.id === el.dataset['templateId'])?.grid,
    )!;
    fireEvent.click(grid);
    const widths = () => framesNow().map((e) => [e.w, e.h]);
    const before = widths();
    const gap = screen.getByLabelText(fr.templates.gap) as HTMLInputElement;
    expect(gap.value).toBe('4');
    fireEvent.pointerDown(gap);
    fireEvent.change(gap, { target: { value: '10' } });
    expect(widths()).not.toEqual(before);
    fireEvent.change(gap, { target: { value: '14' } });
    expect(editorStore.getState().history.labels).toEqual([
      fr.templates.undoApply,
      fr.templates.undoSpacing,
    ]);
    expect(screen.getByLabelText(fr.templates.margin)).toBeTruthy();
  });

  it('saves the page as a model, lists it in Mes modèles, renames it and deletes it in two steps', async () => {
    await show();
    fireEvent.click(screen.getByRole('tab', { name: fr.templates.mine }));
    expect(screen.getByText(fr.templates.emptyMine)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: fr.templates.save }));
    await screen.findByText(fr.templates.saved(fr.templates.defaultName(1)));
    expect(screen.getByRole('tab', { name: fr.templates.mine }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id.startsWith('user-')).toBe(true);
    const row = document.querySelector<HTMLElement>('.tpl-mine')!;
    expect(within(row).getByText(fr.templates.defaultName(1))).toBeTruthy();

    fireEvent.click(
      within(row).getByRole('button', { name: fr.templates.rename(fr.templates.defaultName(1)) }),
    );
    const field = within(row).getByLabelText(fr.templates.nameField);
    fireEvent.change(field, { target: { value: 'Ma page' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(stored[0]!.name).toBe('Ma page'));
    await screen.findByText('Ma page');

    const remove = screen.getByRole('button', { name: fr.templates.remove('Ma page') });
    fireEvent.click(remove);
    expect(stored).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: fr.templates.confirmRemove('Ma page') }));
    await waitFor(() => expect(stored).toHaveLength(0));
    await screen.findByText(fr.templates.emptyMine);
  });

  it('Escape drops a rename', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: fr.templates.save }));
    await screen.findByText(fr.templates.saved(fr.templates.defaultName(1)));
    const row = document.querySelector<HTMLElement>('.tpl-mine')!;
    fireEvent.click(
      within(row).getByRole('button', { name: fr.templates.rename(fr.templates.defaultName(1)) }),
    );
    const field = within(row).getByLabelText(fr.templates.nameField);
    fireEvent.change(field, { target: { value: 'Autre' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(within(row).getByText(fr.templates.defaultName(1))).toBeTruthy();
    expect(stored[0]!.name).toBe(fr.templates.defaultName(1));
  });

  it('moves between the tabs with the arrow keys, and only the selected tab is in the tab order', async () => {
    await show();
    const tab = (name: string) => screen.getByRole('tab', { name });
    expect(tab(fr.templates.classic).getAttribute('tabindex')).toBe('0');
    expect(tab(fr.templates.mine).getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(tab(fr.templates.classic), { key: 'ArrowRight' });
    expect(tab(fr.templates.mine).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab(fr.templates.mine));
    fireEvent.keyDown(tab(fr.templates.mine), { key: 'ArrowRight' });
    expect(tab(fr.templates.themed).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab(fr.templates.themed), { key: 'ArrowLeft' });
    expect(tab(fr.templates.mine).getAttribute('aria-selected')).toBe('true');
  });

  it('offers to save the spread only on an inner spread', async () => {
    await show();
    expect(screen.getByRole('button', { name: fr.templates.saveSpread })).toBeTruthy();
    act(() => editorStore.getState().goToSpread(book.cover.id));
    expect(screen.queryByRole('button', { name: fr.templates.saveSpread })).toBeNull();
  });
});
