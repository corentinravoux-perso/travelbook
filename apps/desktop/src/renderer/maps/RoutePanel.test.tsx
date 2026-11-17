// @vitest-environment jsdom
import { newBook, type Book, type MapGeometry } from '@travelbook/core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';

const GEOMETRY: MapGeometry = {
  version: 1,
  projection: { kind: 'mercator', rotate: [0, 0, 0], k: 600, tx: 500, ty: 300 },
  bounds: [
    [0, 0],
    [1000, 600],
  ],
  remoteBounds: [
    [0, 0],
    [2000, 900],
  ],
  paths: {
    land: 'M0 0H1000V600H0Z',
    outline: 'M0 0H1000V600H0Z',
    regions: '',
    selected: '',
    neighbours: '',
    lakes: '',
  },
};

vi.mock('./bakeClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./bakeClient')>()),
  bake: vi.fn(async () => structuredClone(GEOMETRY)),
  debounceMs: () => 0,
}));
vi.mock('./mapActions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mapActions')>()),
  applyMap: vi.fn(async () => undefined),
}));
const { bake } = await import('./bakeClient');
const { applyMap } = await import('./mapActions');
const { MapDialog } = await import('./MapDialog');
const { MapsPanel } = await import('../panels/MapsPanel');
const { closeMapDialog, mapDialogStore, updateSpec } = await import('./dialogModel');
const { setSubjectIndex } = await import('./subjects');

const t = fr.maps;
const RESOURCES = join(import.meta.dirname, '../../../resources/maps');
const read = (file: string) => readFileSync(join(RESOURCES, file), 'utf8');
const index = JSON.parse(read('index.json')) as Parameters<typeof setSubjectIndex>[0];

let packReply: { ok: true; json: string } | { ok: false; reason: 'offline' };
const listStyles = vi.fn(async () => [] as { id: string; name: string; style: unknown }[]);

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
beforeEach(async () => {
  closeMapDialog();
  vi.mocked(bake).mockClear();
  vi.mocked(applyMap).mockClear();
  listStyles.mockClear();
  packReply = { ok: false, reason: 'offline' };
  setSubjectIndex(index);
  (window as unknown as { tb: unknown }).tb = {
    project: { save: () => Promise.resolve() },
    maps: { loadPack: vi.fn(async () => packReply), listStyles },
    library: { fonts: { list: async () => [] } },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      try {
        return new Response(read(String(url).replace('tb://resource/maps/', '')));
      } catch {
        return new Response('', { status: 404 });
      }
    }),
  );
  book = newBook({ title: 'Voyage', innerSpreads: 2 });
  await editorStore.getState().openWith(() => Promise.resolve({ book }));
});
afterEach(() => {
  cleanup();
  closeMapDialog();
  vi.unstubAllGlobals();
});

const dialog = () => screen.getByRole('dialog', { name: t.title });
async function openFromPanel() {
  render(
    <>
      <MapsPanel />
      <MapDialog />
    </>,
  );
  fireEvent.click(screen.getByRole('button', { name: t.open }));
  await screen.findByRole('dialog', { name: t.title });
}
async function pick(query: string, hit: string) {
  fireEvent.change(within(dialog()).getByRole('searchbox', { name: t.searchLabel }), {
    target: { value: query },
  });
  fireEvent.click(await within(dialog()).findByRole('option', { name: hit }));
}
const spec = () => mapDialogStore.getState().spec!;
const drawn = () => dialog().querySelector('[data-layer="land"]');

async function ready() {
  await openFromPanel();
  await pick('thai', 'Thaïlande');
  await waitFor(() => expect(drawn()).not.toBeNull());
  await waitFor(() => expect(within(dialog()).queryByText(t.baking)).toBeNull());
  fireEvent.click(within(dialog()).getByRole('tab', { name: t.tabNames.route }));
  vi.mocked(bake).mockClear();
}
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 30)));

const r = t.route;
const panel = () => within(dialog()).getByRole('group', { name: r.title });
const idOf = (label: string) => spec().places.find((p) => p.label === label)!.id;
const route = () => spec().route;
/** Show the Lieux tab to reach a place, then come back to the itinerary. */
const withPlaces = <T,>(act: (places: HTMLElement) => T): T => {
  fireEvent.click(within(dialog()).getByRole('tab', { name: t.tabNames.places }));
  const result = act(within(dialog()).getByRole('group', { name: t.places.title }));
  fireEvent.click(within(dialog()).getByRole('tab', { name: t.tabNames.route }));
  return result;
};
const addStopByName = (name: string) =>
  fireEvent.change(within(panel()).getByRole('combobox', { name: r.addLabel }), {
    target: { value: idOf(name) },
  });
const badge = (label: string) =>
  dialog().querySelector(`[data-badge="${idOf(label)}"]`)?.textContent ?? null;

describe('the itinerary panel', () => {
  it('starts empty; stops are chosen among the shown places', async () => {
    await ready();
    expect(route()).toBeNull();
    const select = within(panel()).getByRole('combobox', { name: r.addLabel });
    const names = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(names).toContain('Bangkok');
    withPlaces((p) =>
      fireEvent.click(within(p).getByRole('checkbox', { name: t.places.show('Hat Yai') })),
    );
    const after = Array.from(
      within(panel()).getByRole('combobox', { name: r.addLabel }).querySelectorAll('option'),
    ).map((o) => o.textContent);
    expect(after).not.toContain('Hat Yai');
  });

  it('adds stops in order, with one leg between each, numbered by default', async () => {
    await ready();
    addStopByName('Bangkok');
    addStopByName('Chiang Mai');
    addStopByName('Hat Yai');
    expect(route()!.stops).toEqual([idOf('Bangkok'), idOf('Chiang Mai'), idOf('Hat Yai')]);
    expect(route()!.legs).toHaveLength(2);
    expect(route()!.numbered).toBe(true);
    expect(badge('Chiang Mai')).toBe('2');
    expect(within(panel()).getAllByRole('group', { name: /^Trajet/ })).toHaveLength(2);
    await settle();
    expect(vi.mocked(bake)).not.toHaveBeenCalled();
  });

  it('a place added twice shows both numbers and no NaN is drawn (A, B, A)', async () => {
    await ready();
    addStopByName('Bangkok');
    addStopByName('Chiang Mai');
    addStopByName('Bangkok');
    // a stop the trip comes back to keeps its first number only
    expect(badge('Bangkok')).toBe('1');
    expect(dialog().querySelector('.map-preview')!.innerHTML).not.toMatch(/NaN/);
  });

  it('one stop only draws no leg and no NaN', async () => {
    await ready();
    addStopByName('Bangkok');
    expect(within(panel()).queryAllByRole('group', { name: /^Trajet/ })).toHaveLength(0);
    expect(badge('Bangkok')).toBe('1');
    expect(dialog().querySelector('.map-preview')!.innerHTML).not.toMatch(/NaN/);
  });

  it('two places at the same coordinates draw no NaN', async () => {
    await ready();
    const bk = spec().places.find((p) => p.label === 'Bangkok')!;
    const other = spec().places.find((p) => p.label === 'Chiang Mai')!;
    await act(() =>
      updateSpec({
        places: spec().places.map((p) =>
          p.id === other.id ? { ...p, lon: bk.lon, lat: bk.lat } : p,
        ),
      }),
    );
    addStopByName('Bangkok');
    addStopByName('Chiang Mai');
    expect(dialog().querySelector('.map-preview')!.innerHTML).not.toMatch(/NaN/);
    expect(badge('Chiang Mai')).toBe('2');
  });

  it('removes a stop with its button, keeping the leg of the previous stop', async () => {
    await ready();
    addStopByName('Bangkok');
    addStopByName('Chiang Mai');
    addStopByName('Hat Yai');
    fireEvent.change(within(panel()).getByLabelText(r.mode(1)), { target: { value: 'avion' } });
    fireEvent.click(within(panel()).getByRole('button', { name: r.remove(2, 'Chiang Mai') }));
    expect(route()!.stops).toEqual([idOf('Bangkok'), idOf('Hat Yai')]);
    expect(route()!.legs.map((l) => l.mode)).toEqual(['avion']);
    fireEvent.click(within(panel()).getByRole('button', { name: r.remove(1, 'Bangkok') }));
    fireEvent.click(within(panel()).getByRole('button', { name: r.remove(1, 'Hat Yai') }));
    expect(route()).toBeNull();
  });

  it('reorders with the up and down buttons; the first up and the last down are disabled', async () => {
    await ready();
    addStopByName('Bangkok');
    addStopByName('Chiang Mai');
    addStopByName('Hat Yai');
    expect(
      (within(panel()).getByRole('button', { name: r.up(1, 'Bangkok') }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(panel()).getByRole('button', { name: r.down(3, 'Hat Yai') }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(within(panel()).getByRole('button', { name: r.down(1, 'Bangkok') }));
    expect(route()!.stops).toEqual([idOf('Chiang Mai'), idOf('Bangkok'), idOf('Hat Yai')]);
    expect(badge('Bangkok')).toBe('2');
  });

  it('reorders by drag and drop', async () => {
    await ready();
    addStopByName('Bangkok');
    addStopByName('Chiang Mai');
    addStopByName('Hat Yai');
    const items = within(panel())
      .getAllByRole('listitem')
      .filter((n) => n.hasAttribute('draggable'));
    expect(items).toHaveLength(3);
    fireEvent.dragStart(items[0]!);
    fireEvent.dragOver(items[2]!);
    fireEvent.drop(items[2]!);
    expect(route()!.stops).toEqual([idOf('Chiang Mai'), idOf('Hat Yai'), idOf('Bangkok')]);
  });

  it('per leg: mode, glyph, curve and bend', async () => {
    await ready();
    addStopByName('Bangkok');
    addStopByName('Chiang Mai');
    addStopByName('Hat Yai');
    const select = (n: number) => within(panel()).getByLabelText(r.mode(n)) as HTMLSelectElement;
    expect(Array.from(select(1).options).map((o) => o.value)).toEqual([
      'voiture',
      'bus',
      'train',
      'avion',
      'bateau',
      'pied',
    ]);
    fireEvent.change(select(1), { target: { value: 'avion' } });
    fireEvent.change(select(2), { target: { value: 'bus' } });
    expect(route()!.legs.map((l) => l.mode)).toEqual(['avion', 'bus']);
    // glyph: hidden by default, shown when ticked
    expect(dialog().querySelector('[data-layer="route"] [data-vehicle]')).toBeNull();
    fireEvent.click(within(panel()).getByRole('checkbox', { name: r.icon(1) }));
    expect(route()!.legs[0]!.icon).toBe(true);
    expect(route()!.legs[1]!.icon).toBe(false);
    expect(dialog().querySelector('[data-layer="route"] [data-vehicle]')).not.toBeNull();
    fireEvent.click(within(panel()).getByRole('checkbox', { name: r.icon(1) }));
    expect(route()!.legs[0]!.icon).toBe(false);
    // curve: the slider needs a curve
    const bend = within(panel()).getByLabelText(r.bend(1)) as HTMLInputElement;
    expect(bend.disabled).toBe(true);
    fireEvent.change(within(panel()).getByLabelText(r.curve(1)), { target: { value: 'courbe' } });
    expect(route()!.legs[0]!.curve).toBe('courbe');
    // a curve with no bend would look straight: it starts with a gentle one
    expect(route()!.legs[0]!.bend).toBeCloseTo(0.3);
    expect(bend.disabled).toBe(false);
    fireEvent.change(bend, { target: { value: '0.6' } });
    expect(route()!.legs[0]!.bend).toBeCloseTo(0.6);
    const d = dialog().querySelector('[data-layer="route"] path')!.getAttribute('d')!;
    expect(d).toContain('Q');
  });

  it('"Numéroter" toggles the numbers', async () => {
    await ready();
    addStopByName('Bangkok');
    addStopByName('Chiang Mai');
    const tick = within(panel()).getByRole('checkbox', { name: r.numbered }) as HTMLInputElement;
    expect(tick.checked).toBe(true);
    fireEvent.click(tick);
    expect(route()!.numbered).toBe(false);
    expect(badge('Bangkok')).toBeNull();
    fireEvent.click(tick);
    expect(badge('Bangkok')).toBe('1');
  });

  it('a stop can go without a number; the next ones take the numbers it skipped', async () => {
    await ready();
    addStopByName('Bangkok');
    addStopByName('Chiang Mai');
    addStopByName('Hat Yai');
    const tick = (n: number, name: string) =>
      within(panel()).getByRole('checkbox', { name: r.stopNumbered(n, name) }) as HTMLInputElement;
    expect(tick(2, 'Chiang Mai').checked).toBe(true);
    fireEvent.click(tick(2, 'Chiang Mai'));
    expect(route()!.unnumbered).toEqual([false, true, false]);
    expect(badge('Chiang Mai')).toBeNull();
    expect(badge('Hat Yai')).toBe('2');
    const shown = Array.from(panel().querySelectorAll('.map-stop__n')).map((n) => n.textContent);
    expect(shown).toEqual(['1', r.noNumber, '2']);
    // the stop keeps its choice when moved
    fireEvent.click(within(panel()).getByRole('button', { name: r.down(2, 'Chiang Mai') }));
    expect(route()!.unnumbered).toEqual([false, false, true]);
    expect(badge('Hat Yai')).toBe('2');
    // with "Numéroter" off, the per-stop boxes are disabled
    fireEvent.click(within(panel()).getByRole('checkbox', { name: r.numbered }));
    expect(tick(1, 'Bangkok').disabled).toBe(true);
  });

  it('a hidden or deleted place that is a stop stays listed and is marked, not drawn', async () => {
    await ready();
    addStopByName('Bangkok');
    addStopByName('Chiang Mai');
    withPlaces((p) =>
      fireEvent.click(within(p).getByRole('checkbox', { name: t.places.show('Chiang Mai') })),
    );
    expect(route()!.stops).toHaveLength(2);
    const row = within(panel())
      .getByRole('button', { name: r.remove(2, 'Chiang Mai') })
      .closest('li')!;
    expect(row.textContent).toContain(r.hidden);
    expect(badge('Chiang Mai')).toBeNull();
    // a place removed from the map altogether
    await act(() => updateSpec({ places: spec().places.filter((p) => p.label !== 'Chiang Mai') }));
    expect(route()!.stops).toHaveLength(2);
    expect(within(panel()).getByText(r.missing)).toBeTruthy();
    expect(dialog().querySelector('.map-preview')!.innerHTML).not.toMatch(/NaN/);
  });

  it('a stored route with the wrong number of legs opens, and is repaired by the first edit', async () => {
    await ready();
    await act(() =>
      updateSpec({
        route: {
          stops: [idOf('Bangkok'), idOf('Chiang Mai'), idOf('Hat Yai')],
          legs: [],
          numbered: true,
        },
      }),
    );
    expect(within(panel()).getAllByRole('group', { name: /^Trajet/ })).toHaveLength(2);
    expect(route()!.legs).toHaveLength(0);
    fireEvent.change(within(panel()).getByLabelText(r.mode(2)), { target: { value: 'bateau' } });
    expect(route()!.legs.map((l) => l.mode)).toEqual(['voiture', 'bateau']);
  });
});
