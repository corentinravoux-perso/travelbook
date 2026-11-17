// @vitest-environment jsdom
import { newBook, type MapGeometry, type MapPreset } from '@travelbook/core';
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
const { styleTemplatesStore } = await import('./styleTemplates');
const { STYLE_GROUPS } = await import('./styleModel');
const { setSubjectIndex } = await import('./subjects');

const t = fr.maps;
const s = t.style;
const RESOURCES = join(import.meta.dirname, '../../../resources/maps');
const read = (file: string) => readFileSync(join(RESOURCES, file), 'utf8');
const index = JSON.parse(read('index.json')) as Parameters<typeof setSubjectIndex>[0];

let packReply: { ok: true; json: string } | { ok: false; reason: 'offline' };
let stored: MapPreset[];
const listStyles = vi.fn(async () => stored);
const saveStyle = vi.fn(async (name: string, style: unknown) => {
  const preset = { id: `user-${stored.length + 1}`, name, style } as MapPreset;
  stored = [...stored, preset];
  return preset;
});
const renameStyle = vi.fn(async (id: string, name: string) => {
  stored = stored.map((p) => (p.id === id ? { ...p, name } : p));
});
const deleteStyle = vi.fn(async (id: string) => {
  stored = stored.filter((p) => p.id !== id);
});
const loadPack = vi.fn(async () => packReply);

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(async () => {
  closeMapDialog();
  vi.mocked(bake).mockClear();
  vi.mocked(applyMap).mockClear();
  for (const f of [listStyles, saveStyle, renameStyle, deleteStyle, loadPack]) f.mockClear();
  stored = [];
  styleTemplatesStore.setState({ mine: [], error: false });
  packReply = { ok: false, reason: 'offline' };
  setSubjectIndex(index);
  (window as unknown as { tb: unknown }).tb = {
    project: { save: () => Promise.resolve() },
    maps: { loadPack, listStyles, saveStyle, renameStyle, deleteStyle },
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
  await editorStore
    .getState()
    .openWith(() => Promise.resolve({ book: newBook({ title: 'Voyage', innerSpreads: 2 }) }));
});
afterEach(() => {
  cleanup();
  closeMapDialog();
  vi.unstubAllGlobals();
});

const dialog = () => screen.getByRole('dialog', { name: t.title });
const spec = () => mapDialogStore.getState().spec!;
async function ready() {
  render(
    <>
      <MapsPanel />
      <MapDialog />
    </>,
  );
  fireEvent.click(screen.getByRole('button', { name: t.open }));
  await screen.findByRole('dialog', { name: t.title });
  fireEvent.change(within(dialog()).getByRole('searchbox', { name: t.searchLabel }), {
    target: { value: 'thai' },
  });
  fireEvent.click(await within(dialog()).findByRole('option', { name: 'Thaïlande' }));
  await waitFor(() => expect(dialog().querySelector('[data-layer="land"]')).not.toBeNull());
  fireEvent.click(within(dialog()).getByRole('tab', { name: t.tabNames.style }));
}
const panel = () => within(dialog()).getByRole('tabpanel', { name: t.tabNames.style });

describe('every token has a control that edits the style', () => {
  it('lists a control named after every control of the model', async () => {
    await ready();
    for (const g of STYLE_GROUPS)
      for (const c of g.controls) {
        expect(within(panel()).getAllByLabelText(c.label, { exact: true }).length).toBeGreaterThan(
          0,
        );
      }
  });

  it('a colour, a width, a select, a switch and a font change the map style', async () => {
    await ready();
    const p = within(panel());
    fireEvent.change(
      p.getByLabelText(`${s.groups.land} : ${s.fill}`, { selector: 'input[type=color]' }),
      {
        target: { value: '#123456' },
      },
    );
    expect(spec().style.land.fill).toBe('#123456');
    // the preview is drawn with it
    expect(dialog().querySelector('[data-layer="land"] path')?.getAttribute('fill')).toBe(
      '#123456',
    );
    fireEvent.change(p.getByLabelText(`${s.groups.land} : ${s.width}`), {
      target: { value: '1.2' },
    });
    expect(spec().style.land.width).toBeCloseTo(1.2);
    fireEvent.change(p.getByLabelText(s.case), { target: { value: 'upper' } });
    expect(spec().style.label.case).toBe('upper');
    fireEvent.click(p.getByLabelText(s.italicSights));
    expect(spec().style.label.italicSights).toBe(false);
    fireEvent.change(p.getByLabelText(`${s.groups.regions} : ${s.dash}`), {
      target: { value: 'dashed' },
    });
    expect(spec().style.regions.dash).toEqual([2.2, 1.5]);
    fireEvent.change(p.getByLabelText(s.font), { target: { value: 'Lora' } });
    expect(spec().style.label.font).toBe('Lora');
  });

  it('a nullable colour is switched off and back on', async () => {
    await ready();
    const p = within(panel());
    const off = p.getByLabelText(`${s.groups.land} : ${s.stroke} (${s.none})`);
    fireEvent.click(off);
    expect(spec().style.land.stroke).toBeNull();
    fireEvent.click(off);
    expect(spec().style.land.stroke).not.toBeNull();
  });

  it('the hand-drawn switch sets rough, with its roughness and a new seed', async () => {
    await ready();
    const p = within(panel());
    expect(spec().style.rough).toBeNull();
    fireEvent.click(p.getByLabelText(s.rough));
    expect(spec().style.rough).not.toBeNull();
    fireEvent.change(p.getByLabelText(s.roughness), { target: { value: '2' } });
    expect(spec().style.rough!.roughness).toBe(2);
    const seed = spec().style.rough!.seed;
    fireEvent.click(p.getByRole('button', { name: s.reroll }));
    expect(spec().style.rough!.seed).not.toBe(seed);
    fireEvent.click(p.getByLabelText(s.rough));
    expect(spec().style.rough).toBeNull();
  });

  it('editing a colour leaves the six chips pressed on none; a size or a case does not', async () => {
    await ready();
    const chips = within(dialog()).getByRole('group', { name: t.presetsGroup });
    fireEvent.change(within(panel()).getByLabelText(s.case), { target: { value: 'upper' } });
    await waitFor(() =>
      expect(within(chips).queryAllByRole('button', { pressed: true })).toHaveLength(1),
    );
    fireEvent.change(
      within(panel()).getByLabelText(`${s.groups.land} : ${s.fill}`, {
        selector: 'input[type=color]',
      }),
      { target: { value: '#123456' } },
    );
    expect(spec().style.land.fill).toBe('#123456');
    expect(within(chips).queryAllByRole('button', { pressed: true })).toHaveLength(0);
  });
});

describe('dashes, typed numbers and colours', () => {
  it('"Continu" can be chosen again after a dash', async () => {
    await ready();
    const dash = within(panel()).getByLabelText(`${s.groups.regions} : ${s.dash}`);
    fireEvent.change(dash, { target: { value: 'dashed' } });
    expect(spec().style.regions.dash).toEqual([2.2, 1.5]);
    fireEvent.change(dash, { target: { value: 'solid' } });
    expect(spec().style.regions.dash).toBeNull();
    const mode = within(panel()).getByLabelText(`${t.route.modes.voiture} : ${s.dash}`);
    fireEvent.change(mode, { target: { value: 'solid' } });
    expect(spec().style.route.voiture.dash).toBeNull();
  });

  it('the number fields keep the style editor class', async () => {
    await ready();
    const size = within(panel()).getByLabelText(s.sizePt);
    expect(size.classList.contains('map-style__number')).toBe(true);
    expect(size.classList.contains('input')).toBe(true);
  });

  it('typing "12" into a field whose minimum is 4 is not rewritten on the way', async () => {
    await ready();
    const size = within(panel()).getByLabelText(s.sizePt) as HTMLInputElement;
    fireEvent.change(size, { target: { value: '1' } });
    expect(size.value).toBe('1');
    expect(spec().style.label.sizePt).toBe(9.5);
    fireEvent.change(size, { target: { value: '12' } });
    expect(size.value).toBe('12');
    expect(spec().style.label.sizePt).toBe(12);
  });

  it('typing "0.5" into a marker scale (minimum 0.2) and "0,5" with a French comma', async () => {
    await ready();
    const scale = within(panel()).getByLabelText(
      `${s.markerKinds['city']} : ${s.scale}`,
    ) as HTMLInputElement;
    fireEvent.change(scale, { target: { value: '0.' } });
    expect(scale.value).toBe('0.');
    fireEvent.change(scale, { target: { value: '0.5' } });
    expect(scale.value).toBe('0.5');
    expect(spec().style.markers.city.scale).toBe(0.5);
    fireEvent.change(scale, { target: { value: '0,7' } });
    expect(scale.value).toBe('0,7');
    expect(spec().style.markers.city.scale).toBe(0.7);
  });

  it('a value out of range is clamped when the field is left, not before', async () => {
    await ready();
    const size = within(panel()).getByLabelText(s.sizePt) as HTMLInputElement;
    fireEvent.change(size, { target: { value: '99' } });
    expect(spec().style.label.sizePt).toBe(9.5);
    fireEvent.blur(size);
    expect(size.value).toBe('40');
    expect(spec().style.label.sizePt).toBe(40);
  });

  it('the field follows a change from outside (a preset)', async () => {
    await ready();
    const size = within(panel()).getByLabelText(s.sizePt) as HTMLInputElement;
    fireEvent.change(size, { target: { value: '12' } });
    await act(() =>
      updateSpec({ style: { ...spec().style, label: { ...spec().style.label, sizePt: 20 } } }),
    );
    expect(size.value).toBe('20');
  });

  it('"aucun" turned off restores the colour that was there, even a non-hex one', async () => {
    await ready();
    const st = spec().style;
    await act(() =>
      updateSpec({ style: { ...st, land: { ...st.land, stroke: 'rgb(10, 20, 30)' } } }),
    );
    const off = within(panel()).getByLabelText(`${s.groups.land} : ${s.stroke} (${s.none})`);
    fireEvent.click(off);
    expect(spec().style.land.stroke).toBeNull();
    fireEvent.click(off);
    expect(spec().style.land.stroke).toBe('rgb(10, 20, 30)');
  });
});

describe('the sliders', () => {
  it('"Taille des icônes": marker, badge and vehicle go from 1 to 20 mm', async () => {
    await ready();
    for (const [label, key] of [
      [s.sizeMarker, 'marker'],
      [s.sizeBadge, 'badge'],
      [s.sizeVehicle, 'vehicle'],
    ] as const) {
      const slider = within(panel()).getByLabelText(label) as HTMLInputElement;
      expect([slider.type, slider.min, slider.max]).toEqual(['range', '1', '20']);
      fireEvent.change(slider, { target: { value: '12' } });
      expect(spec().style.sizes[key]).toBe(12);
    }
    expect(within(panel()).getByRole('group', { name: s.groups.sizes })).toBeTruthy();
  });

  it('"Détail du contour" (0 to 1) bakes the geometry again; a colour does not', async () => {
    await ready();
    vi.mocked(bake).mockClear();
    fireEvent.change(
      within(panel()).getByLabelText(`${s.groups.land} : ${s.fill}`, {
        selector: 'input[type=color]',
      }),
      {
        target: { value: '#aa0000' },
      },
    );
    fireEvent.change(within(panel()).getByLabelText(s.sizeMarker), { target: { value: '8' } });
    await new Promise((r) => setTimeout(r, 30));
    expect(bake).not.toHaveBeenCalled();
    const detail = within(panel()).getByLabelText(s.detail) as HTMLInputElement;
    expect([detail.type, detail.min, detail.max]).toEqual(['range', '0', '1']);
    fireEvent.change(detail, { target: { value: '0.4' } });
    expect(spec().style.outline.detail).toBeCloseTo(0.4);
    await waitFor(() => expect(bake).toHaveBeenCalledTimes(1));
    expect(vi.mocked(bake).mock.calls[0]![0].detail).toBeCloseTo(0.4);
  });
});

describe('user templates', () => {
  it('"Enregistrer comme modèle…" saves a copy of the style and a chip appears after the presets', async () => {
    await ready();
    fireEvent.change(within(panel()).getByLabelText(s.case), { target: { value: 'upper' } });
    fireEvent.click(within(panel()).getByRole('button', { name: s.saveAs }));
    fireEvent.change(within(panel()).getByLabelText(s.templateName), {
      target: { value: 'Le mien' },
    });
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('button', { name: s.save }));
    });
    expect(saveStyle).toHaveBeenCalledTimes(1);
    expect(saveStyle.mock.calls[0]![0]).toBe('Le mien');
    expect((saveStyle.mock.calls[0]![1] as { label: { case: string } }).label.case).toBe('upper');
    const chips = within(dialog()).getByRole('group', { name: t.presetsGroup });
    await waitFor(() =>
      expect(within(chips).getByRole('button', { name: 'Le mien' })).toBeTruthy(),
    );
    expect(within(chips).getAllByRole('button').at(-1)!.textContent).toBe('Le mien');
    // the chip is the style of the map: pressed
    expect(
      within(chips).getByRole('button', { name: 'Le mien' }).getAttribute('aria-pressed'),
    ).toBe('true');
    // the template is a copy: editing the map afterwards leaves it as saved
    fireEvent.change(within(panel()).getByLabelText(s.case), { target: { value: 'lower' } });
    expect((stored[0]!.style as { label: { case: string } }).label.case).toBe('upper');
  });

  it('a template is renamed in place (no dialog box) and deleted after a second click', async () => {
    stored = [{ id: 'user-1', name: 'Vieux', style: {} } as MapPreset];
    await ready();
    const p = within(panel());
    await p.findByText('Vieux');
    fireEvent.click(p.getByRole('button', { name: s.rename('Vieux') }));
    const field = p.getByLabelText(s.renameField);
    fireEvent.change(field, { target: { value: 'Neuf' } });
    await act(async () => {
      fireEvent.keyDown(field, { key: 'Enter' });
    });
    expect(renameStyle).toHaveBeenCalledWith('user-1', 'Neuf');
    await p.findByText('Neuf');
    const chips = within(dialog()).getByRole('group', { name: t.presetsGroup });
    expect(within(chips).getByRole('button', { name: 'Neuf' })).toBeTruthy();
    // delete: the first click only asks
    fireEvent.click(p.getByRole('button', { name: s.remove('Neuf') }));
    expect(deleteStyle).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(p.getByRole('button', { name: s.confirmRemove('Neuf') }));
    });
    expect(deleteStyle).toHaveBeenCalledWith('user-1');
    await waitFor(() => expect(within(chips).queryByRole('button', { name: 'Neuf' })).toBeNull());
  });

  it('Escape leaves the name unchanged; picking a template copies it into the map', async () => {
    stored = [
      {
        id: 'user-1',
        name: 'Vieux',
        style: { label: { case: 'lower', sizePt: 14, color: '#123456' } },
      } as unknown as MapPreset,
    ];
    await ready();
    const p = within(panel());
    await p.findByText('Vieux');
    fireEvent.click(p.getByRole('button', { name: s.rename('Vieux') }));
    fireEvent.keyDown(p.getByLabelText(s.renameField), { key: 'Escape' });
    expect(renameStyle).not.toHaveBeenCalled();
    const chips = within(dialog()).getByRole('group', { name: t.presetsGroup });
    fireEvent.click(within(chips).getByRole('button', { name: 'Vieux' }));
    // its colours come in, completed from the defaults; the map's sizes and case stay
    await waitFor(() => expect(spec().style.label.color).toBe('#123456'));
    expect(spec().style.label.sizePt).toBe(9.5);
    expect(spec().style.label.case).toBe('none');
    expect(spec().style.land.width).toBeGreaterThan(0);
  });
});
