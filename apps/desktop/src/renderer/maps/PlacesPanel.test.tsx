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
const { closeMapDialog, mapDialogStore, newMapBox, updateSpec } = await import('./dialogModel');
const { placePointMm } = await import('./placesModel');
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
const preview = () => within(dialog()).getByLabelText(t.preview);
const spec = () => mapDialogStore.getState().spec!;
const drawn = () => dialog().querySelector('[data-layer="land"]');

const places = () => within(dialog()).getByRole('group', { name: t.places.title });
const markers = () => Array.from(dialog().querySelectorAll('[data-place]'));
const labels = () => Array.from(dialog().querySelectorAll('[data-label]'));
const labelText = (name: string) => labels().find((n) => n.textContent === name);

async function ready() {
  await openFromPanel();
  await pick('thai', 'Thaïlande');
  await waitFor(() => expect(drawn()).not.toBeNull());
  await waitFor(() => expect(within(dialog()).queryByText(t.baking)).toBeNull());
  vi.mocked(bake).mockClear();
}
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 30)));

/** The preview scale (px per mm) and where a degree point is, in preview px. */
function pxOf(lon: number, lat: number): [number, number] {
  const s = editorStore.getState();
  const box = newMapBox(s.book!, s.currentSpreadId!, s.activePage)!;
  const k = parseFloat(preview().style.width) / box.w;
  const mm = placePointMm(GEOMETRY, box, spec(), lon, lat)!;
  return [mm[0] * k, mm[1] * k];
}
const click = (x: number, y: number) => {
  fireEvent.pointerDown(preview(), { clientX: x, clientY: y, pointerId: 1, button: 0 });
  fireEvent.pointerUp(window, { clientX: x, clientY: y, pointerId: 1 });
};

describe('the places list', () => {
  it('groups places in Villes and Sites, each with a tick', async () => {
    await ready();
    const p = within(places());
    expect(p.getByRole('heading', { name: t.places.cities })).toBeTruthy();
    expect(p.getByRole('heading', { name: t.places.sights })).toBeTruthy();
    const tick = p.getByRole('checkbox', { name: t.places.show('Bangkok') }) as HTMLInputElement;
    expect(tick.checked).toBe(true);
    // a city is listed with the cities
    const cities = p.getByRole('heading', { name: t.places.cities }).parentElement!;
    expect(within(cities).getByRole('checkbox', { name: t.places.show('Bangkok') })).toBeTruthy();
  });

  it('unticking a place hides its marker and its label, without baking', async () => {
    await ready();
    const id = spec().places.find((p) => p.label === 'Bangkok')!.id;
    expect(markers().some((n) => n.getAttribute('data-place') === id)).toBe(true);
    expect(labelText('Bangkok')).toBeTruthy();
    fireEvent.click(within(places()).getByRole('checkbox', { name: t.places.show('Bangkok') }));
    expect(spec().places.find((p) => p.id === id)!.shown).toBe(false);
    expect(markers().some((n) => n.getAttribute('data-place') === id)).toBe(false);
    expect(labelText('Bangkok')).toBeUndefined();
    await settle();
    expect(vi.mocked(bake)).not.toHaveBeenCalled();
  });

  it('the label tick hides the label only', async () => {
    await ready();
    fireEvent.click(
      within(places()).getByRole('checkbox', { name: t.places.labelShow('Bangkok') }),
    );
    expect(labelText('Bangkok')).toBeUndefined();
    expect(spec().places.find((p) => p.label === 'Bangkok')!.shown).toBe(true);
  });

  it('renames a place inline', async () => {
    await ready();
    fireEvent.change(within(places()).getByRole('textbox', { name: t.places.rename('Bangkok') }), {
      target: { value: 'Krung Thep' },
    });
    expect(spec().places.some((p) => p.label === 'Krung Thep')).toBe(true);
    expect(labelText('Krung Thep')).toBeTruthy();
  });

  it('"Ajouter un lieu" searches the bundled places of the subject, accents ignored', async () => {
    await ready();
    const before = spec().places.length;
    fireEvent.change(within(places()).getByRole('searchbox', { name: t.places.addLabel }), {
      target: { value: 'hat yai' },
    });
    // already on the map: not offered
    fireEvent.change(within(places()).getByRole('searchbox', { name: t.places.addLabel }), {
      target: { value: 'LAMPANG' },
    });
    const option = await within(places()).findByRole('option', { name: /Lampang/ });
    fireEvent.click(option);
    expect(spec().places.length).toBe(before + 1);
    const added = spec().places.at(-1)!;
    expect(added.label).toBe('Lampang');
    expect(added.source).toEqual({ kind: 'city', ref: 'ne:1159134391' });
    expect(added.shown).toBe(true);
    // the search is cleared; the place is no longer offered
    expect(
      (within(places()).getByRole('searchbox', { name: t.places.addLabel }) as HTMLInputElement)
        .value,
    ).toBe('');
    fireEvent.change(within(places()).getByRole('searchbox', { name: t.places.addLabel }), {
      target: { value: 'lampang' },
    });
    expect(within(places()).queryByRole('option', { name: /Lampang/ })).toBeNull();
    expect(within(places()).getByText(t.places.none)).toBeTruthy();
  });

  it('sets the size of a marker in mm; empty goes back to the size of the style', async () => {
    await ready();
    const field = () =>
      within(places()).getByLabelText(t.places.size('Bangkok')) as HTMLInputElement;
    // empty and showing the style size as a placeholder
    expect(field().value).toBe('');
    expect(field().placeholder).toBe(String(spec().style.sizes.marker));
    fireEvent.change(field(), { target: { value: '7.5' } });
    expect(spec().places.find((p) => p.label === 'Bangkok')!.markerSize).toBe(7.5);
    // out of 1..20 is clamped
    fireEvent.change(field(), { target: { value: '99' } });
    expect(spec().places.find((p) => p.label === 'Bangkok')!.markerSize).toBe(20);
    fireEvent.change(field(), { target: { value: '' } });
    expect(spec().places.find((p) => p.label === 'Bangkok')!.markerSize).toBeNull();
    expect(bake).not.toHaveBeenCalled();
  });

  it('removes a clicked place but keeps no delete button on bundled ones', async () => {
    await ready();
    expect(within(places()).queryByRole('button', { name: t.places.remove('Bangkok') })).toBeNull();
  });
});

describe('the preview click', () => {
  it('adds a custom place named after the nearest bundled place within 10 km', async () => {
    await ready();
    const before = spec().places.length;
    // 1 km from Hat Yai: named after it
    const [x, y] = pxOf(100.47, 7.0);
    click(x, y);
    await waitFor(() => expect(spec().places.length).toBe(before + 1));
    const added = spec().places.at(-1)!;
    expect(added.source).toEqual({ kind: 'custom' });
    expect(added.label).toBe('Hat Yai');
    expect(added.lon).toBeCloseTo(100.47, 0);
    expect(added.lat).toBeCloseTo(7.0, 0);
    expect(added.shown && added.labelShown).toBe(true);
    const added_group = () =>
      within(places().querySelector('.map-places__group:last-of-type') as HTMLElement);
    // listed apart, renamable
    fireEvent.change(added_group().getByRole('textbox', { name: t.places.rename('Hat Yai') }), {
      target: { value: 'Chez Lek' },
    });
    expect(spec().places.at(-1)!.label).toBe('Chez Lek');
    // and removable
    fireEvent.click(added_group().getByRole('button', { name: t.places.remove('Chez Lek') }));
    expect(spec().places.length).toBe(before);
  });

  it('is called "Nouveau lieu" when no bundled place is within 10 km', async () => {
    await ready();
    const [x, y] = pxOf(101.2, 16.0);
    click(x, y);
    await waitFor(() => expect(spec().places.at(-1)!.label).toBe(t.places.newPlace));
    expect(spec().places.at(-1)!.source).toEqual({ kind: 'custom' });
  });

  it('the end of a pan drag is not a click', async () => {
    await ready();
    const before = spec().places.length;
    fireEvent.pointerDown(preview(), { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientX: 130, clientY: 110, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 130, clientY: 110, pointerId: 1 });
    await settle();
    expect(spec().places.length).toBe(before);
    expect(spec().frame).not.toBeNull();
  });

  it('a click on a label does not add a place', async () => {
    await ready();
    const before = spec().places.length;
    const node = labelText('Bangkok')!;
    fireEvent.pointerDown(node, { clientX: 50, clientY: 50, pointerId: 1, button: 0 });
    fireEvent.pointerUp(window, { clientX: 50, clientY: 50, pointerId: 1 });
    await settle();
    expect(spec().places.length).toBe(before);
    expect(spec().places.find((p) => p.label === 'Bangkok')!.labelOffset).toBeNull();
  });
});

describe('label position', () => {
  const bangkok = () => spec().places.find((p) => p.label === 'Bangkok')!;

  it('dragging a label stores labelOffset in mm from the point', async () => {
    await ready();
    const node = labelText('Bangkok')!;
    const [px, py] = pxOf(bangkok().lon, bangkok().lat);
    const s = editorStore.getState();
    const box = newMapBox(s.book!, s.currentSpreadId!, s.activePage)!;
    const k = parseFloat(preview().style.width) / box.w;
    const start = {
      dx: Number(node.getAttribute('x')) - px / k,
      dy: Number(node.getAttribute('y')) - py / k,
    };
    fireEvent.pointerDown(node, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientX: 120, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 120, clientY: 90, pointerId: 1 });
    const off = bangkok().labelOffset!;
    expect(off.dx).toBeCloseTo(start.dx + 20 / k, 1);
    expect(off.dy).toBeCloseTo(start.dy - 10 / k, 1);
    // the frame did not move (it was a label drag, not a pan)
    expect(spec().frame).toBeNull();
  });

  it('"Position automatique" resets the offset to null', async () => {
    await ready();
    const node = labelText('Bangkok')!;
    fireEvent.pointerDown(node, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientX: 120, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 120, clientY: 90, pointerId: 1 });
    expect(bangkok().labelOffset).not.toBeNull();
    fireEvent.click(
      within(places()).getByRole('button', { name: t.places.autoPositionOf('Bangkok') }),
    );
    expect(bangkok().labelOffset).toBeNull();
    // nothing to reset on an automatic label
    expect(
      (
        within(places()).getByRole('button', {
          name: t.places.autoPositionOf('Bangkok'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('arrow keys nudge the label by 0.5 mm (Shift 2 mm) without a mouse', async () => {
    await ready();
    const nudge = within(places()).getByRole('button', { name: t.places.nudge('Bangkok') });
    nudge.focus();
    fireEvent.keyDown(nudge, { key: 'ArrowRight' });
    const first = bangkok().labelOffset!;
    fireEvent.keyDown(nudge, { key: 'ArrowRight' });
    expect(bangkok().labelOffset!.dx).toBeCloseTo(first.dx + 0.5, 6);
    fireEvent.keyDown(nudge, { key: 'ArrowDown', shiftKey: true });
    expect(bangkok().labelOffset!.dy).toBeCloseTo(first.dy + 2, 6);
  });

  it('does not bake', async () => {
    await ready();
    const node = labelText('Bangkok')!;
    fireEvent.pointerDown(node, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientX: 120, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 120, clientY: 90, pointerId: 1 });
    await settle();
    expect(vi.mocked(bake)).not.toHaveBeenCalled();
  });
});

describe('bad specs', () => {
  it('shows and survives duplicate ids, a vanished ref and non-finite coordinates', async () => {
    await ready();
    const base = spec().places[0]!;
    await updateSpec({
      places: [
        base,
        { ...base, label: 'Doublon' },
        { ...base, id: 'gone', label: 'Disparu', source: { kind: 'city', ref: 'ne:0' } },
        { ...base, id: 'nan', label: 'Ailleurs', lon: Number.NaN },
        {
          ...base,
          id: 'odd',
          label: 'Étrange',
          source: { kind: 'sight', ref: 'ne:1' },
          lat: Infinity,
        },
      ],
    });
    const p = within(places());
    for (const name of ['Doublon', 'Disparu', 'Ailleurs', 'Étrange']) {
      expect(p.getByRole('checkbox', { name: t.places.show(name) })).toBeTruthy();
    }
    // acting on the second of two places with one id touches only that one
    fireEvent.change(p.getByRole('textbox', { name: t.places.rename('Doublon') }), {
      target: { value: 'Autre' },
    });
    expect(
      spec()
        .places.map((q) => q.label)
        .slice(0, 2),
    ).toEqual([base.label, 'Autre']);
    // search still works with a bad list
    fireEvent.change(p.getByRole('searchbox', { name: t.places.addLabel }), {
      target: { value: 'chiang' },
    });
    expect(await p.findByRole('option', { name: /Chiang Mai/ })).toBeTruthy();
  });
});

describe('places of a region subject', () => {
  it('offers the places of the chosen region first, the others of the country after', async () => {
    await openFromPanel();
    await pick('sicile', 'Sicile');
    await waitFor(() => expect(drawn()).not.toBeNull());
    // Sicily's own places are all on the map by default: take one off, it is offered first
    await updateSpec({ places: spec().places.filter((p) => p.label !== 'Syracuse') });
    const options = await within(places()).findAllByRole('option');
    expect(options[0]!.getAttribute('aria-label')).toBe('Syracuse');
    expect(options[0]!.textContent).not.toContain(t.places.outOfRegion);
    expect(options.slice(1).every((o) => o.textContent!.includes(t.places.outOfRegion))).toBe(true);
    fireEvent.change(within(places()).getByRole('searchbox', { name: t.places.addLabel }), {
      target: { value: 'rome' },
    });
    const rOption = await within(places()).findByRole('option', { name: /Rome/ });
    expect(rOption.textContent).toContain(t.places.outOfRegion);
    fireEvent.click(rOption);
    expect(spec().places.some((p) => p.label === 'Rome')).toBe(true);
  });
});
