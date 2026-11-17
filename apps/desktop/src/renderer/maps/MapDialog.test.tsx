// @vitest-environment jsdom
import { addElement, newBook, type Book, type MapGeometry } from '@travelbook/core';
import { mapElement } from '@travelbook/core/src/map/test-helpers';
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
const { MapInspector } = await import('../editor/inspector/MapInspector');
const { closeMapDialog, mapDialogStore, openMapDialog, updateSpec } = await import('./dialogModel');
const { setSubjectIndex } = await import('./subjects');

const t = fr.maps;
const RESOURCES = join(import.meta.dirname, '../../../resources/maps');
const read = (file: string) => readFileSync(join(RESOURCES, file), 'utf8');
const index = JSON.parse(read('index.json')) as Parameters<typeof setSubjectIndex>[0];

let packReply: { ok: true; json: string } | { ok: false; reason: 'offline' };
const listStyles = vi.fn(async () => [] as { id: string; name: string; style: unknown }[]);
const loadPack = vi.fn(async (): Promise<unknown> => packReply);

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
  loadPack.mockClear();
  loadPack.mockImplementation(async () => packReply);
  packReply = { ok: false, reason: 'offline' };
  setSubjectIndex(index);
  (window as unknown as { tb: unknown }).tb = {
    project: { save: () => Promise.resolve() },
    maps: { loadPack, listStyles },
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

describe('opening from the Cartes panel', () => {
  it('shows search, the six presets, the layer switches and a transparent background', async () => {
    await openFromPanel();
    const d = within(dialog());
    expect(d.getByRole('searchbox', { name: t.searchLabel })).toBeTruthy();
    const chips = d.getByRole('group', { name: t.presetsGroup });
    expect(
      within(chips)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Ardoise', 'Safran', 'Carnet', 'Encre', 'Crayon', 'Pastel']);
    expect(d.getByRole('checkbox', { name: t.layerRegions })).toBeTruthy();
    expect(d.getByRole('checkbox', { name: t.layerNeighbours })).toBeTruthy();
    expect(d.getByRole('checkbox', { name: t.layerRemote })).toBeTruthy();
    expect((d.getByRole('checkbox', { name: t.transparent }) as HTMLInputElement).checked).toBe(
      true,
    );
    // nothing to place before a subject is chosen
    expect((d.getByRole('button', { name: t.place }) as HTMLButtonElement).disabled).toBe(true);
    expect(d.getByText(t.pickFirst)).toBeTruthy();
  });

  it('lists the user styles after the built-in ones', async () => {
    listStyles.mockResolvedValueOnce([{ id: 'user-1', name: 'Mon style', style: {} }]);
    await openFromPanel();
    const chips = within(dialog()).getByRole('group', { name: t.presetsGroup });
    await waitFor(() =>
      expect(within(chips).getByRole('button', { name: 'Mon style' })).toBeTruthy(),
    );
    const names = within(chips)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names.slice(-2)).toEqual(['Pastel', 'Mon style']);
  });

  it('finds a country by an unaccented query and previews it', async () => {
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    await waitFor(() => expect(drawn()).not.toBeNull());
    expect(spec().subject.id).toBe('TH');
    expect(vi.mocked(bake)).toHaveBeenCalledTimes(1);
    expect(within(dialog()).getByText('Thaïlande')).toBeTruthy();
    expect(
      (within(dialog()).getByRole('button', { name: t.place }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('draws the preview in the aspect ratio of the box the map will have', async () => {
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    await waitFor(() => expect(drawn()).not.toBeNull());
    const frame = preview() as HTMLElement;
    const [w, h] = [parseFloat(frame.style.width), parseFloat(frame.style.height)];
    const drawnBox = dialog().querySelector<HTMLElement>('[data-element-type="map"]')!;
    expect(parseFloat(drawnBox.style.width) / parseFloat(drawnBox.style.height)).toBeCloseTo(
      w / h,
      2,
    );
    const page = book.format;
    expect(w / h).toBeCloseTo(
      (page.width - 2 * book.safeMargin) / (page.height - 2 * book.safeMargin),
      2,
    );
  });
});

describe('the enlarged preview', () => {
  it('hides the search, the templates and the layers, and gives them back', async () => {
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    const d = within(dialog());
    fireEvent.click(await d.findByRole('button', { name: t.enlarge }));
    expect(d.queryByRole('group', { name: t.presetsGroup })).toBeNull();
    expect(d.queryByRole('searchbox', { name: t.searchLabel })).toBeNull();
    expect(d.queryByRole('checkbox', { name: t.layerNeighbours })).toBeNull();
    // the preview and the tabs stay
    expect(d.getByLabelText(t.preview)).toBeTruthy();
    expect(d.getByRole('tab', { name: t.tabNames.places })).toBeTruthy();
    fireEvent.click(d.getByRole('button', { name: t.shrink }));
    expect(d.getByRole('group', { name: t.presetsGroup })).toBeTruthy();
    expect(d.getByRole('checkbox', { name: t.layerNeighbours })).toBeTruthy();
  });
});

describe('preset chips', () => {
  const chip = (name: string) =>
    within(dialog()).getByRole('button', { name }) as HTMLButtonElement;

  it('marks the preset the style equals, and none once the style is edited', async () => {
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    // a new map starts in carnet
    await waitFor(() => expect(chip('Carnet').getAttribute('aria-pressed')).toBe('true'));
    expect(chip('Ardoise').getAttribute('aria-pressed')).toBe('false');
    await waitFor(() => expect(chip('Ardoise').disabled).toBe(false));
    fireEvent.click(chip('Ardoise'));
    await waitFor(() => expect(chip('Ardoise').getAttribute('aria-pressed')).toBe('true'));
    expect(chip('Carnet').getAttribute('aria-pressed')).toBe('false');
    const style = spec().style;
    await act(() => updateSpec({ style: { ...style, land: { ...style.land, fill: '#123456' } } }));
    await waitFor(() => expect(chip('Ardoise').getAttribute('aria-pressed')).toBe('false'));
    for (const name of ['Safran', 'Carnet', 'Encre', 'Crayon', 'Pastel']) {
      expect(chip(name).getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('a chip brings colours, fonts and marker shapes; the sizes the user chose are kept', async () => {
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    await waitFor(() => expect(chip('Safran').disabled).toBe(false));
    const style = spec().style;
    await act(() =>
      updateSpec({
        style: {
          ...style,
          sizes: { marker: 7, badge: 9, vehicle: 11 },
          label: { ...style.label, sizePt: 14 },
          rough: { seed: 4, roughness: 2 },
        },
      }),
    );
    fireEvent.click(chip('Safran'));
    await waitFor(() => expect(chip('Safran').getAttribute('aria-pressed')).toBe('true'));
    const after = spec().style;
    expect(after.sizes).toEqual({ marker: 7, badge: 9, vehicle: 11 });
    expect(after.label.sizePt).toBe(14);
    expect(after.label.case).toBe(style.label.case);
    // Safran's typeface and pins
    expect(after.label.font).toBe('Bebas Neue');
    expect(after.markers.city.kind).toBe('pin');
    expect(after.outline.width).toBe(style.outline.width);
    expect(after.rough).toEqual({ seed: 4, roughness: 2 });
    // the colours are Safran's
    expect(after.land.fill).not.toBe(style.land.fill);
  });

  it('a fresh dialog starts in carnet, whatever the last one used', async () => {
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    await waitFor(() => expect(chip('Pastel').disabled).toBe(false));
    fireEvent.click(chip('Pastel'));
    await waitFor(() => expect(chip('Pastel').getAttribute('aria-pressed')).toBe('true'));
    cleanup();
    closeMapDialog();
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    // a pick keeps the style the user had set in the same dialog, a fresh dialog starts in carnet
    await waitFor(() => expect(chip('Carnet').getAttribute('aria-pressed')).toBe('true'));
  });
});

describe('a bake that was cancelled', () => {
  it('is not a failure: no alert, nothing logged', async () => {
    const { BakeCancelled } = await import('./bakeClient');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(bake).mockRejectedValueOnce(new BakeCancelled('Superseded'));
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    await waitFor(() => expect(vi.mocked(bake)).toHaveBeenCalledTimes(1));
    await act(() => new Promise<void>((r) => setTimeout(r, 30)));
    expect(within(dialog()).queryByText(t.bakeFailed)).toBeNull();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('a real bake error is shown', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(bake).mockRejectedValueOnce(new Error('boom'));
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    expect(await within(dialog()).findByText(t.bakeFailed)).toBeTruthy();
    error.mockRestore();
  });
});

describe('the native cancel of the dialog', () => {
  it('is blocked while the map is being placed, and closes the dialog otherwise', async () => {
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    mapDialogStore.setState({ status: 'applying' });
    const blocked = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);
    mapDialogStore.setState({ status: 'idle' });
    const free = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);
  });
});

describe('what re-bakes and what does not', () => {
  async function ready() {
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    await waitFor(() => expect(drawn()).not.toBeNull());
    await waitFor(() => expect(within(dialog()).queryByText(t.baking)).toBeNull());
    vi.mocked(bake).mockClear();
  }
  const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 30)));

  it('a preset changes the style without baking again', async () => {
    await ready();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Ardoise' }));
    await waitFor(() => expect(spec().style.land.fill).not.toBe('#f4e7c9'));
    await settle();
    expect(vi.mocked(bake)).not.toHaveBeenCalled();
  });

  it('a preset keeps the outline the user has: Crayon does not turn hand-drawn, no bake', async () => {
    await ready();
    const crayon = within(dialog()).getByRole('button', { name: 'Crayon' }) as HTMLButtonElement;
    await waitFor(() => expect(crayon.disabled).toBe(false));
    fireEvent.click(crayon);
    await waitFor(() => expect(crayon.getAttribute('aria-pressed')).toBe('true'));
    expect(spec().style.rough).toBeNull();
    await settle();
    expect(vi.mocked(bake)).not.toHaveBeenCalled();
  });

  it('the neighbours switch bakes again', async () => {
    await ready();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: t.layerNeighbours }));
    expect(spec().subject.showNeighbours).toBe(false);
    await waitFor(() => expect(vi.mocked(bake)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(bake).mock.calls[0]![0].subject.showNeighbours).toBe(false);
  });

  it('the regions switch bakes again', async () => {
    await ready();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: t.layerRegions }));
    expect(spec().subject.showRegions).toBe(false);
    await waitFor(() => expect(vi.mocked(bake)).toHaveBeenCalledTimes(1));
  });

  it('"Inclure les territoires éloignés" is off by default and bakes again when ticked', async () => {
    await ready();
    const box = within(dialog()).getByRole('checkbox', { name: t.layerRemote }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(spec().subject.includeRemote).toBe(true);
    await waitFor(() => expect(vi.mocked(bake)).toHaveBeenCalledTimes(1));
  });

  it('the background and its colour do not bake', async () => {
    await ready();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: t.transparent }));
    expect(spec().background).toBe('#ffffff');
    fireEvent.change(within(dialog()).getByLabelText(t.backgroundColor), {
      target: { value: '#ffeecc' },
    });
    expect(spec().background).toBe('#ffeecc');
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: t.transparent }));
    expect(spec().background).toBeNull();
    await settle();
    expect(vi.mocked(bake)).not.toHaveBeenCalled();
  });

  it('pan, zoom and recentre do not bake', async () => {
    await ready();
    fireEvent.wheel(preview(), { deltaY: -100, clientX: 10, clientY: 10 });
    await settle();
    expect(vi.mocked(bake)).not.toHaveBeenCalled();
  });
});

describe('pan and zoom', () => {
  async function ready() {
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    await waitFor(() => expect(drawn()).not.toBeNull());
    // the wheel handler does nothing before the preview geometry is baked (aria-busy off)
    await waitFor(() =>
      expect(dialog().querySelector('.map-preview[aria-busy="false"]')).not.toBeNull(),
    );
  }

  it('the wheel zooms the preview and sets the frame', async () => {
    await ready();
    expect(spec().frame).toBeNull();
    fireEvent.wheel(preview(), { deltaY: -120, clientX: 20, clientY: 30 });
    expect(spec().frame!.scale).toBeGreaterThan(1);
    const zoomed = spec().frame!.scale;
    fireEvent.wheel(preview(), { deltaY: 240, clientX: 20, clientY: 30 });
    expect(spec().frame!.scale).toBeLessThan(zoomed);
  });

  it('dragging pans: the centre moves and the zoom stays', async () => {
    await ready();
    fireEvent.wheel(preview(), { deltaY: -120, clientX: 20, clientY: 30 });
    const before = structuredClone(spec().frame!);
    fireEvent.pointerDown(preview(), { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientX: 140, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 140, clientY: 120, pointerId: 1 });
    const after = spec().frame!;
    expect(after.scale).toBeCloseTo(before.scale, 9);
    expect(after.center).not.toEqual(before.center);
    // the land follows the pointer: right and down, so the centre goes left and up (north-west)
    expect(after.center[0]).toBeLessThan(before.center[0]);
    expect(after.center[1]).toBeGreaterThan(before.center[1]);
  });

  it('"Recentrer" gives back the default frame', async () => {
    await ready();
    const recenter = within(dialog()).getByRole('button', {
      name: t.recenter,
    }) as HTMLButtonElement;
    expect(recenter.disabled).toBe(true);
    fireEvent.wheel(preview(), { deltaY: -120, clientX: 20, clientY: 30 });
    expect(recenter.disabled).toBe(false);
    fireEvent.click(recenter);
    expect(spec().frame).toBeNull();
    expect(recenter.disabled).toBe(true);
  });
});

describe('reopening a map', () => {
  it('opens on the spec of the map with its name and subject', async () => {
    const el = { ...mapElement(), id: 'm1', name: 'Mon voyage' };
    el.subject.id = 'TH';
    el.frame = { center: [100, 14], scale: 2 };
    const withMap = addElement(book, book.spreads[0]!.id, el);
    await editorStore.getState().openWith(() => Promise.resolve({ book: withMap }));
    render(<MapDialog />);
    await act(() => openMapDialog({ spreadId: book.spreads[0]!.id, elementId: 'm1' }));
    const d = await screen.findByRole('dialog', { name: t.titleEdit });
    expect(within(d).getByText('Thaïlande')).toBeTruthy();
    expect(spec().frame).toEqual({ center: [100, 14], scale: 2 });
    expect(within(d).getByRole('button', { name: t.update })).toBeTruthy();
  });

  it('the Inspector button of a selected map opens it', async () => {
    const el = { ...mapElement(), id: 'm1' };
    el.subject.id = 'TH';
    const spreadId = book.spreads[0]!.id;
    await editorStore
      .getState()
      .openWith(() => Promise.resolve({ book: addElement(book, spreadId, el) }));
    render(<MapInspector spreadId={spreadId} element={el} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.edit }));
    });
    await waitFor(() => expect(mapDialogStore.getState().open).toBe(true));
    expect(mapDialogStore.getState().target).toEqual({ spreadId, elementId: 'm1' });
  });
});

describe('a region subject', () => {
  it('Italie ▸ Sicile selects the region and says when the fine outline is missing', async () => {
    await openFromPanel();
    await pick('sicile', 'Sicile');
    await waitFor(() => expect(spec().subject.regions.length).toBe(1));
    await waitFor(() =>
      expect(within(dialog()).getByRole('status').textContent).toBe(t.packFallback.offline),
    );
    expect(within(dialog()).getByText(/Italie/)).toBeTruthy();
  });

  it('says exactly "Contour détaillé indisponible hors ligne" and the map can still be placed', async () => {
    await openFromPanel();
    await pick('sicile', 'Sicile');
    await waitFor(() =>
      expect(within(dialog()).getByRole('status').textContent).toBe(
        'Contour détaillé indisponible hors ligne : contour du pays utilisé.',
      ),
    );
    await waitFor(() => expect(drawn()).not.toBeNull());
    const place = within(dialog()).getByRole('button', { name: t.place }) as HTMLButtonElement;
    expect(place.disabled).toBe(false);
    fireEvent.click(place);
    expect(vi.mocked(applyMap)).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['checksum', t.packFallback.checksum],
    ['unknown', t.packFallback.unknown],
  ])('a %s failure has its own sentence', async (reason, sentence) => {
    packReply = { ok: false, reason } as never;
    await openFromPanel();
    await pick('sicile', 'Sicile');
    await waitFor(() => expect(within(dialog()).getByRole('status').textContent).toBe(sentence));
    expect(sentence).not.toBe(t.packFallback.offline);
  });

  it('shows a progress line while the fine pack loads, then nothing once it is in', async () => {
    let release: (value: unknown) => void = () => undefined;
    loadPack.mockImplementationOnce(() => new Promise((r) => (release = r)));
    await openFromPanel();
    await pick('sicile', 'Sicile');
    await waitFor(() =>
      expect(within(dialog()).getByRole('status').textContent).toBe(t.packLoading),
    );
    await act(async () => release({ ok: false, reason: 'offline' }));
    await waitFor(() =>
      expect(within(dialog()).getByRole('status').textContent).toBe(t.packFallback.offline),
    );
  });

  it('choosing a region later calls maps.loadPack; a whole-country map never does', async () => {
    await openFromPanel();
    await pick('ital', 'Italie');
    await waitFor(() => expect(drawn()).not.toBeNull());
    expect(loadPack).not.toHaveBeenCalled();
    const region = (await mapDialogStore.getState().spec)!;
    await act(() => updateSpec({ subject: { ...region.subject, regions: ['IT-82'] } }));
    await waitFor(() => expect(loadPack).toHaveBeenCalledWith('IT'));
  });

  it('a whole-country map says nothing about a pack', async () => {
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    await waitFor(() => expect(drawn()).not.toBeNull());
    expect(within(dialog()).queryByRole('status')).toBeNull();
  });
});

describe('placing', () => {
  it('"Placer la carte" applies the dialog state and "Annuler" closes without applying', async () => {
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    await waitFor(() => expect(spec().subject.id).toBe('TH'));
    fireEvent.click(within(dialog()).getByRole('button', { name: t.place }));
    expect(vi.mocked(applyMap)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(applyMap).mock.calls[0]![0].spec?.subject.id).toBe('TH');
    fireEvent.click(within(dialog()).getByRole('button', { name: t.cancel }));
    await waitFor(() => expect(mapDialogStore.getState().open).toBe(false));
    expect(vi.mocked(applyMap)).toHaveBeenCalledTimes(1);
  });
});

describe('the sections of the dialog', () => {
  async function thai() {
    await openFromPanel();
    await pick('thai', 'Thaïlande');
    await waitFor(() => expect(drawn()).not.toBeNull());
  }
  const tab = (name: string) => within(dialog()).getByRole('tab', { name });

  it('is a tablist of Lieux, Itinéraire and Style; one panel at a time, Lieux first', async () => {
    await thai();
    const list = within(dialog()).getByRole('tablist', { name: t.tabs });
    expect(
      within(list)
        .getAllByRole('tab')
        .map((n) => n.textContent),
    ).toEqual(['Lieux', 'Itinéraire', 'Style']);
    expect(tab('Lieux').getAttribute('aria-selected')).toBe('true');
    const panel = within(dialog()).getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('Lieux').id);
    expect(tab('Lieux').getAttribute('aria-controls')).toBe(panel.id);
    expect(within(dialog()).queryByRole('group', { name: t.route.title })).toBeNull();
    fireEvent.click(tab('Itinéraire'));
    expect(within(dialog()).getByRole('group', { name: t.route.title })).toBeTruthy();
    expect(within(dialog()).queryByRole('group', { name: t.places.title })).toBeNull();
  });

  it('arrow keys, Home and End move between the tabs (roving tabindex)', async () => {
    await thai();
    expect([tab('Lieux').tabIndex, tab('Itinéraire').tabIndex, tab('Style').tabIndex]).toEqual([
      0, -1, -1,
    ]);
    fireEvent.keyDown(tab('Lieux'), { key: 'ArrowRight' });
    expect(tab('Itinéraire').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('Itinéraire'), { key: 'End' });
    expect(tab('Style').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('Style'), { key: 'ArrowRight' });
    expect(tab('Lieux').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('Lieux'), { key: 'ArrowLeft' });
    expect(tab('Style').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('Style'), { key: 'Home' });
    expect(tab('Lieux').getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the preview, the layers and the actions in view whichever tab is open', async () => {
    await thai();
    for (const name of ['Itinéraire', 'Style', 'Lieux']) {
      fireEvent.click(tab(name));
      expect(preview()).toBeTruthy();
      expect(within(dialog()).getByRole('checkbox', { name: t.layerRegions })).toBeTruthy();
      expect(within(dialog()).getByRole('button', { name: t.place })).toBeTruthy();
    }
  });
});
