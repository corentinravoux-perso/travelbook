// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newBook } from '@travelbook/core';
import { editorStore, useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import { AlbumTitle } from './AlbumTitle';

/** The top bar's title as the shell mounts it: it follows the book. */
function Title() {
  const title = useEditor((s) => s.book?.title);
  return title === undefined ? null : <AlbumTitle title={title} />;
}

const title = () => editorStore.getState().book?.title;
const field = () => screen.getByRole('textbox', { name: fr.shell.titleField });

beforeEach(async () => {
  (window as unknown as { tb: unknown }).tb = {
    project: { save: vi.fn(() => Promise.resolve()) },
  };
  await editorStore
    .getState()
    .openWith(() => Promise.resolve({ book: newBook({ title: 'Pérou' }) }));
});
afterEach(cleanup);

describe('AlbumTitle', () => {
  it('renames the album on Enter, as one undo step', () => {
    render(<Title />);
    fireEvent.click(screen.getByRole('button', { name: fr.shell.rename('Pérou') }));
    fireEvent.change(field(), { target: { value: '  Pérou - Alex  ' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(title()).toBe('Pérou - Alex');
    expect(screen.getByRole('button', { name: fr.shell.rename('Pérou - Alex') })).toBeTruthy();
    editorStore.getState().undo();
    expect(title()).toBe('Pérou');
  });

  it('keeps the new title when the field loses the focus, once', () => {
    render(<Title />);
    fireEvent.click(screen.getByRole('button', { name: fr.shell.rename('Pérou') }));
    fireEvent.change(field(), { target: { value: 'Lima' } });
    fireEvent.blur(field());
    expect(title()).toBe('Lima');
    editorStore.getState().undo();
    expect(title()).toBe('Pérou');
    expect(editorStore.getState().history.canUndo).toBe(false);
  });

  it('drops the edit on Escape, and a blank or unchanged title changes nothing', () => {
    render(<Title />);
    for (const [value, key] of [
      ['Lima', 'Escape'],
      ['   ', 'Enter'],
      ['Pérou', 'Enter'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: fr.shell.rename('Pérou') }));
      fireEvent.change(field(), { target: { value } });
      fireEvent.keyDown(field(), { key });
      expect(title()).toBe('Pérou');
    }
    expect(editorStore.getState().history.canUndo).toBe(false);
  });
});
