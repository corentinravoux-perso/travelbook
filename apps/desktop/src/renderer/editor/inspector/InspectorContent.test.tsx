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
import { MASK_PRESETS } from '@travelbook/render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorStore } from '../../store/editor';
import { fr } from '../../strings/fr';
import { InspectorContent } from './InspectorContent';

const state = () => editorStore.getState();
const photos = (): PhotoElement[] => state().book!.spreads[1]!.elements as PhotoElement[];

describe('InspectorContent', () => {
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

  it('shows the inspector of the selected photo, and the hint when nothing is selected', () => {
    render(<InspectorContent />);
    expect(screen.getByTestId('photo-inspector')).toBeTruthy();
    act(() => state().select([]));
    expect(screen.queryByTestId('photo-inspector')).toBeNull();
    expect(screen.getByText('Sélectionnez un élément pour voir ses propriétés.')).toBeTruthy();
  });

  it('commits a typed value to the photo that was selected, not to the next one', () => {
    render(<InspectorContent />);
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
    render(<InspectorContent />);
    const width = screen.getByLabelText('Épaisseur') as HTMLInputElement;
    fireEvent.change(width, { target: { value: '7' } });
    expect(width.value).toBe('7');
    act(() => state().select([b.id]));
    expect((screen.getByLabelText('Épaisseur') as HTMLInputElement).value).toBe('0');
  });

  it('still applies a value typed and committed on the same photo', () => {
    render(<InspectorContent />);
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
      render(<InspectorContent />);
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
      render(<InspectorContent />);
      const img = tile('mono').querySelector('img');
      expect(img?.getAttribute('src')).toBe('tb://asset/x?v=thumb');
      expect(img?.style.filter).toBe('contrast(1.15) grayscale(1)');
      expect(tile('vignette').querySelector('.look-tile__vignette')).not.toBeNull();
      expect(tile('original').querySelector('.look-tile__vignette')).toBeNull();
    });

    it('applies a preset in one undo step, and marks it pressed', () => {
      render(<InspectorContent />);
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
      render(<InspectorContent />);
      fireEvent.click(tile('retro'));
      fireEvent.click(tile('mono'));
      expect(labels()).toEqual(['Appliquer un style', 'Appliquer un style']);
    });

    it('sets the vignette from its slider, one undo step for a whole drag', () => {
      render(<InspectorContent />);
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
      render(<InspectorContent />);
      fireEvent.click(tile('mono'));
      fireEvent.change(slider('Vignettage'), { target: { value: '0.3' } });
      expect(photos()[0]!.adjust).toEqual({ ...preset('mono').adjust, vignette: 0.3 });
    });

    it('sets the soft edge in mm from its slider, and 0 turns it off', () => {
      render(<InspectorContent />);
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
      render(<InspectorContent />);
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
      render(<InspectorContent />);
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
      render(<InspectorContent />);
      fireEvent.click(screen.getByRole('button', { name: 'Galet' }));
      fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }));
      expect(photos()[0]!.mask).toEqual({ kind: 'rect' });
      expect(screen.getByRole('button', { name: 'Galet' }).getAttribute('aria-pressed')).toBe(
        'false',
      );
    });
  });
});
