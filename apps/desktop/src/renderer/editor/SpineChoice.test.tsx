// @vitest-environment jsdom
import { addElement, newBook, newElement, type Book } from '@travelbook/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';
import { CoverTools } from './CoverEditor';
import {
  forgetSpineWidth,
  parseSpineWidth,
  spineWidthToRestore,
  suggestedSpineWidth,
} from './SpineChoice';

const t = fr.spine;

describe('spine width helpers', () => {
  it('reads a width in mm, comma or point, inside 1 to 100 mm', () => {
    expect(parseSpineWidth('12')).toBe(12);
    expect(parseSpineWidth(' 8,5 ')).toBe(8.5);
    expect(parseSpineWidth('7.25')).toBe(7.3);
    expect(parseSpineWidth('')).toBeNull();
    expect(parseSpineWidth('0')).toBeNull();
    expect(parseSpineWidth('101')).toBeNull();
    expect(parseSpineWidth('dix')).toBeNull();
  });

  it('suggests boards plus paper, never under 6 mm, to the half millimetre', () => {
    const small = newBook({ title: 'T', innerSpreads: 1 });
    expect(suggestedSpineWidth(small)).toBe(6);
    const big = newBook({ title: 'T', innerSpreads: 49 });
    const w = suggestedSpineWidth(big);
    expect(w).toBeGreaterThan(14);
    expect(w * 2).toBe(Math.round(w * 2));
  });
});

describe('CoverTools spine choice', () => {
  let book: Book;
  const tools = () => {
    const b = editorStore.getState().book!;
    return render(<CoverTools book={b} spread={b.cover} />);
  };

  beforeEach(async () => {
    forgetSpineWidth();
    (window as unknown as { tb: unknown }).tb = { project: { save: () => Promise.resolve() } };
    book = { ...newBook({ title: 'Voyage', innerSpreads: 2 }), spineWidth: 10 };
    const front = book.format.width + 10;
    book = addElement(
      book,
      book.cover.id,
      newElement('text', { x: front + 20, y: 20, w: 60, h: 20 }),
    );
    await editorStore.getState().openWith(() => Promise.resolve({ book }));
  });
  afterEach(cleanup);

  it('"Sans tranche" removes the spine in one undo step and keeps the front content in place', () => {
    const view = tools();
    fireEvent.click(screen.getByRole('button', { name: t.without }));
    const after = editorStore.getState().book!;
    expect(after.spineWidth).toBe(0);
    expect(after.cover.elements[0]!.x).toBe(book.cover.elements[0]!.x - 10);
    expect(editorStore.getState().history.labels.at(-1)).toBe(t.undoWithout);
    view.unmount();
    tools();
    expect(
      (screen.getByRole('button', { name: fr.cover.spineText }) as HTMLButtonElement).disabled,
    ).toBe(true);
    // Back to "Avec tranche": the width the book had comes back.
    expect(spineWidthToRestore(after)).toBe(10);
    fireEvent.click(screen.getByRole('button', { name: t.with }));
    expect(editorStore.getState().book!.spineWidth).toBe(10);
    editorStore.getState().undo();
    editorStore.getState().undo();
    expect(editorStore.getState().book).toEqual(book);
  });

  it('changes the width on Enter, once, and refuses a width out of range', () => {
    tools();
    const width = screen.getByLabelText(t.width) as HTMLInputElement;
    expect(width.value).toBe('10');
    fireEvent.change(width, { target: { value: '14,5' } });
    expect(editorStore.getState().book!.spineWidth).toBe(10);
    fireEvent.keyDown(width, { key: 'Enter' });
    expect(editorStore.getState().book!.spineWidth).toBe(14.5);
    expect(editorStore.getState().history.labels.at(-1)).toBe(t.undoWith('14,5'));
    fireEvent.change(width, { target: { value: '400' } });
    fireEvent.blur(width);
    expect(screen.getByRole('alert').textContent).toBe(t.invalid(1, 100));
    expect(editorStore.getState().book!.spineWidth).toBe(14.5);
  });
});
