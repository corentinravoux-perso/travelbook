// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { addElement, newBook, newElement, type Book, type PhotoElement } from '@travelbook/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorStore } from '../../store/editor';
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
});
