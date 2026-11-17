// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  LOOK_PRESETS,
  addElement,
  newBook,
  newElement,
  type Book,
  type PhotoElement,
} from '@travelbook/core';
import { mapElement } from '@travelbook/core/src/map/test-helpers';
import { MASK_PRESETS } from '@travelbook/render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorStore } from '../../store/editor';
import { ICONS } from '../../theme/icons';
import { fr } from '../../strings/fr';
import { Inspector } from './Inspector';

const state = () => editorStore.getState();
const photos = (): PhotoElement[] => state().book!.spreads[1]!.elements as PhotoElement[];

describe('Inspector', () => {
  let a: PhotoElement;
  let b: PhotoElement;

  beforeEach(async () => {
    vi.useFakeTimers();
    // The app's store saves through `window.tb`; these tests only look at the document.
    vi.stubGlobal('tb', { project: { save: () => Promise.resolve() } });
    let book: Book = newBook({ title: 'T', innerSpreads: 2 });
    const spreadId = book.spreads[1]!.id;
    a = newElement('photo', { x: 10, y: 10, w: 80, h: 60 });
    b = newElement('photo', { x: 100, y: 10, w: 80, h: 60 });
    for (const el of [a, b]) book = addElement(book, spreadId, el);
    await state().openWith(() => Promise.resolve({ dir: '/x', book }));
    state().goToSpread(spreadId);
    state().select([a.id]);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows the inspector of the selected photo, and the page when nothing is selected', () => {
    render(<Inspector />);
    expect(screen.getByTestId('photo-inspector')).toBeTruthy();
    act(() => state().select([]));
    expect(screen.queryByTestId('photo-inspector')).toBeNull();
    expect(screen.getByTestId('page-inspector')).toBeTruthy();
  });

  it('commits a typed value to the photo that was selected, not to the next one', () => {
    render(<Inspector />);
    const width = screen.getByLabelText('Épaisseur');
    fireEvent.focus(width);
    fireEvent.change(width, { target: { value: '5' } });
    expect(photos().map((p) => p.border)).toEqual([null, null]); // still a draft

    // Pressing on another photo of the canvas selects it first and blurs the field after.
    act(() => state().select([b.id]));
    fireEvent.blur(width);

    expect(photos().map((p) => p.border)).toEqual([null, null]);
  });

  it('starts every photo with fresh fields', () => {
    render(<Inspector />);
    const width = screen.getByLabelText('Épaisseur') as HTMLInputElement;
    fireEvent.change(width, { target: { value: '7' } });
    expect(width.value).toBe('7');
    act(() => state().select([b.id]));
    expect((screen.getByLabelText('Épaisseur') as HTMLInputElement).value).toBe('0');
  });

  it('still applies a value typed and committed on the same photo', () => {
    render(<Inspector />);
    const width = screen.getByLabelText('Épaisseur');
    fireEvent.change(width, { target: { value: '2,5' } });
    fireEvent.blur(width);
    expect(photos().map((p) => p.border?.width)).toEqual([2.5, undefined]);
  });

  describe('look', () => {
    const labels = () => state().history.labels;
    const slider = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
    const preset = (id: string) => LOOK_PRESETS.find((p) => p.id === id)!;
    const tile = (id: string) => screen.getByRole('button', { name: preset(id).name });

    it('offers every preset, with the neutral one pressed on a fresh photo', () => {
      render(<Inspector />);
      for (const p of LOOK_PRESETS) expect(tile(p.id)).toBeTruthy();
      expect(tile('original').getAttribute('aria-pressed')).toBe('true');
      expect(tile('mono').getAttribute('aria-pressed')).toBe('false');
    });

    it('shows each preset on the photo itself when the frame has one', () => {
      let book = state().book!;
      book = {
        ...book,
        assets: {
          x: {
            id: 'x',
            kind: 'photo',
            file: 'originals/x.jpg',
            originalName: 'x.jpg',
            sha256: 'x',
          },
        },
        spreads: book.spreads.map((s, i) =>
          i === 1
            ? {
                ...s,
                elements: s.elements.map((e) => (e.id === a.id ? { ...e, assetId: 'x' } : e)),
              }
            : s,
        ),
      };
      act(() => state().apply(() => book, 'Photo'));
      render(<Inspector />);
      const img = tile('mono').querySelector('img');
      expect(img?.getAttribute('src')).toBe('tb://asset/x?v=thumb');
      expect(img?.style.filter).toBe('contrast(1.15) grayscale(1)');
      expect(tile('vignette').querySelector('.look-tile__vignette')).not.toBeNull();
      expect(tile('original').querySelector('.look-tile__vignette')).toBeNull();
    });

    it('applies a preset in one undo step, and marks it pressed', () => {
      render(<Inspector />);
      fireEvent.click(tile('retro'));
      expect(photos()[0]!.adjust).toEqual(preset('retro').adjust);
      expect(photos()[1]!.adjust).toEqual(preset('original').adjust);
      expect(tile('retro').getAttribute('aria-pressed')).toBe('true');
      expect(tile('original').getAttribute('aria-pressed')).toBe('false');
      expect(labels()).toEqual(['Appliquer un style']);
      act(() => state().undo());
      expect(photos()[0]!.adjust).toEqual(preset('original').adjust);
    });

    it('takes two presets in a row as two steps', () => {
      render(<Inspector />);
      fireEvent.click(tile('retro'));
      fireEvent.click(tile('mono'));
      expect(labels()).toEqual(['Appliquer un style', 'Appliquer un style']);
    });

    it('sets the vignette from its slider, one undo step for a whole drag', () => {
      render(<Inspector />);
      const vignette = slider('Vignettage');
      fireEvent.pointerDown(vignette);
      for (const v of ['0.2', '0.4', '0.6']) fireEvent.change(vignette, { target: { value: v } });
      expect(photos()[0]!.adjust.vignette).toBe(0.6);
      expect(photos()[1]!.adjust.vignette).toBe(0);
      expect(labels()).toEqual(['Modifier le vignettage']);
      expect(screen.getByText('60 %')).toBeTruthy();
      act(() => state().undo());
      expect(photos()[0]!.adjust.vignette).toBe(0);
    });

    it('keeps the other adjustments when the vignette moves', () => {
      render(<Inspector />);
      fireEvent.click(tile('mono'));
      fireEvent.change(slider('Vignettage'), { target: { value: '0.3' } });
      expect(photos()[0]!.adjust).toEqual({ ...preset('mono').adjust, vignette: 0.3 });
    });

    it('sets the soft edge in mm from its slider, and 0 turns it off', () => {
      render(<Inspector />);
      const feather = slider('Bords adoucis');
      expect(feather.max).toBe('15');
      expect(photos()[0]!.edge).toBeNull();
      fireEvent.pointerDown(feather);
      fireEvent.change(feather, { target: { value: '2' } });
      fireEvent.change(feather, { target: { value: '4' } });
      expect(photos()[0]!.edge).toEqual({ feather: 4 });
      expect(screen.getByText('4 mm')).toBeTruthy();
      expect(labels()).toEqual(['Adoucir les bords']);
      fireEvent.pointerDown(feather);
      fireEvent.change(feather, { target: { value: '0' } });
      expect(photos()[0]!.edge).toBeNull();
      expect(labels()).toEqual(['Adoucir les bords', 'Adoucir les bords']);
    });

    it('does not reset the vignette with the adjustments', () => {
      render(<Inspector />);
      fireEvent.click(tile('dramatic'));
      fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
      expect(photos()[0]!.adjust).toEqual({ ...preset('original').adjust, vignette: 0.5 });
    });
  });

  describe('mask shapes', () => {
    it('has a French name for every preset mask and for nothing else', () => {
      expect(Object.keys(fr.photoInspector.shapeNames).sort()).toEqual([...MASK_PRESETS].sort());
    });

    it('offers every preset, the irregular ones included, and applies one', () => {
      render(<Inspector />);
      for (const id of MASK_PRESETS) {
        expect(
          screen.getByRole('button', { name: fr.photoInspector.shapeNames[id]! }),
        ).toBeTruthy();
      }
      const torn = screen.getByRole('button', { name: 'Bord déchiré' });
      expect(torn.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(torn);
      expect(photos()[0]!.mask).toEqual({ kind: 'preset', preset: 'torn' });
      expect(torn.getAttribute('aria-pressed')).toBe('true');
      expect(state().history.labels).toEqual(['Changer le masque']);
      // Pressed already: a second press changes nothing.
      fireEvent.click(torn);
      expect(state().history.labels).toEqual(['Changer le masque']);
    });

    it('goes back to a plain mask with the segmented control', () => {
      render(<Inspector />);
      fireEvent.click(screen.getByRole('button', { name: 'Galet' }));
      fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }));
      expect(photos()[0]!.mask).toEqual({ kind: 'rect' });
      expect(screen.getByRole('button', { name: 'Galet' }).getAttribute('aria-pressed')).toBe(
        'false',
      );
    });
  });

  describe('common section and tabs', () => {
    it('moves the selected element when X is typed, as one undo step', () => {
      render(<Inspector />);
      const x = screen.getByLabelText('X');
      fireEvent.focus(x);
      fireEvent.change(x, { target: { value: '30' } });
      fireEvent.blur(x);
      expect(photos()[0]!.x).toBe(30);
      expect(state().history.labels.at(-1)).toBe('Déplacer');
      act(() => state().undo());
      expect(photos()[0]!.x).toBe(10);
    });

    it('takes a decimal comma and rejects what is not a number', () => {
      render(<Inspector />);
      const y = screen.getByLabelText('Y') as HTMLInputElement;
      fireEvent.change(y, { target: { value: '12,5' } });
      fireEvent.blur(y);
      expect(photos()[0]!.y).toBe(12.5);
      fireEvent.change(y, { target: { value: 'abc' } });
      fireEvent.blur(y);
      expect(photos()[0]!.y).toBe(12.5);
      expect(y.value).toBe('12,5');
    });

    it('locks the element, and then refuses to move it from the fields', () => {
      render(<Inspector />);
      fireEvent.click(screen.getByRole('button', { name: 'Verrouiller' }));
      expect(photos()[0]!.locked).toBe(true);
      expect((screen.getByLabelText('X') as HTMLInputElement).disabled).toBe(true);
      expect(screen.getByRole('button', { name: 'Déverrouiller' })).toBeTruthy();
    });

    it('aligns one element to the page, and offers selection or page for several', () => {
      render(<Inspector />);
      fireEvent.click(screen.getByRole('button', { name: 'Aligner à gauche' }));
      // The first page of the first inner spread starts at x = 0 or at the spread's origin.
      expect(photos()[0]!.x).toBeLessThan(10);
      act(() => state().select([a.id, b.id]));
      expect(screen.getByRole('group', { name: 'Aligner sur' })).toBeTruthy();
      expect(screen.queryByLabelText('X')).toBeNull();
      expect(screen.getByText(fr.inspector.selection(2))).toBeTruthy();
      expect(
        (screen.getByRole('button', { name: 'Répartir horizontalement' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    it('switches between properties, layers and history', () => {
      vi.stubGlobal('tb', {
        project: { save: () => Promise.resolve(), listSnapshots: () => Promise.resolve([]) },
      });
      render(<Inspector />);
      fireEvent.click(screen.getByRole('tab', { name: 'Calques' }));
      expect(screen.getByTestId('layers')).toBeTruthy();
      fireEvent.click(screen.getByRole('tab', { name: 'Historique' }));
      expect(screen.getByTestId('history')).toBeTruthy();
      fireEvent.click(screen.getByRole('tab', { name: 'Propriétés' }));
      expect(screen.getByTestId('photo-inspector')).toBeTruthy();
    });
  });

  describe('map', () => {
    const map = { ...mapElement(), id: 'the-map' };
    beforeEach(() => {
      const spreadId = state().currentSpreadId!;
      act(() => {
        state().apply((book) => addElement(book, spreadId, map), 'Carte');
        state().select([map.id]);
      });
    });

    it('offers the common section and the way into the map dialog', () => {
      render(<Inspector />);
      expect(screen.getByRole('heading', { name: 'Carte' })).toBeTruthy();
      expect((screen.getByLabelText(fr.inspector.x) as HTMLInputElement).value).toBe('10');
      expect((screen.getByLabelText(fr.inspector.width) as HTMLInputElement).value).toBe('150');
      expect(screen.getByLabelText(fr.inspector.opacity)).toBeTruthy();
      expect(screen.getByRole('button', { name: fr.maps.edit })).toBeTruthy();
      expect(screen.queryByTestId('photo-inspector')).toBeNull();
      expect(screen.queryByLabelText('Épaisseur')).toBeNull();
    });

    it('lists the map in the layers with its own icon and its label', () => {
      vi.stubGlobal('tb', {
        project: { save: () => Promise.resolve(), listSnapshots: () => Promise.resolve([]) },
      });
      render(<Inspector />);
      fireEvent.click(screen.getByRole('tab', { name: 'Calques' }));
      const row = screen.getByText('Carte · TH').closest('li, [role="option"], div')!;
      const pathOf = (body: string) => /\sd="([^"]+)"/.exec(body)![1];
      expect(row.querySelector('svg.icon path')!.getAttribute('d')).toBe(pathOf(ICONS.map));
      expect(pathOf(ICONS.map)).not.toBe(pathOf(ICONS['layout-grid']));
    });

    it('sets the opacity of the map', () => {
      render(<Inspector />);
      fireEvent.change(screen.getByLabelText(fr.inspector.opacity), { target: { value: '0.4' } });
      const el = state().book!.spreads[1]!.elements.find((e) => e.id === map.id)!;
      expect(el.opacity).toBe(0.4);
    });

    it('resizes the map without keeping its ratio', () => {
      render(<Inspector />);
      const width = screen.getByLabelText(fr.inspector.width);
      fireEvent.change(width, { target: { value: '120' } });
      fireEvent.blur(width);
      const el = state().book!.spreads[1]!.elements.find((e) => e.id === map.id)!;
      expect([el.w, el.h]).toEqual([120, 200]);
    });
  });
});
