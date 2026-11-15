import { newBook, type Book } from '@travelbook/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerCloseRequest } from './closeRequest';
import { createEditorStore } from './editor';

const retitle = (book: Book): Book => ({ ...book, title: 'Changé' });

describe('answering the close request of main', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function setup() {
    const save = vi.fn<(book: Book) => Promise<void>>(() => Promise.resolve());
    const editor = createEditorStore({ save });
    await editor
      .getState()
      .openWith(() => Promise.resolve({ dir: '/x', book: newBook({ title: 'T' }) }));
    return { save, editor };
  }

  it('answers as soon as the book is saved, however long the thumbnail takes', async () => {
    const { save, editor } = await setup();
    editor.getState().apply(retitle, 'Renommer');
    const flush = vi.fn<() => Promise<void>>(() => new Promise(() => undefined)); // never settles
    const answered = vi.fn();
    void answerCloseRequest(editor, { flush }).then(answered);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(answered).toHaveBeenCalled();
    expect(flush).toHaveBeenCalledTimes(1);
    // Well past main's 5 s window: nothing the thumbnail does can change the answer now.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(answered).toHaveBeenCalledTimes(1);
  });

  it('starts the thumbnail without waiting for the save, and also when nothing is unsaved', async () => {
    const { editor } = await setup();
    const flush = vi.fn<() => Promise<void>>(() => Promise.resolve());
    await answerCloseRequest(editor, { flush });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('rejects when the book could not be saved, so that main asks the user', async () => {
    const { save, editor } = await setup();
    save.mockRejectedValue(new Error('disk full'));
    editor.getState().apply(retitle, 'Renommer');
    const flush = vi.fn<() => Promise<void>>(() => Promise.resolve());
    await expect(answerCloseRequest(editor, { flush })).rejects.toThrow('disk full');
  });
});
