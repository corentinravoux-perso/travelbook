// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { textExtensions } from './tiptap';

let editor: Editor | null = null;
/** Every editor a test made: a live one keeps ProseMirror timers that fire after jsdom is gone. */
const made: Editor[] = [];
afterEach(() => {
  editor?.destroy();
  editor = null;
  const live = made.filter((e) => !e.isDestroyed).length;
  made.length = 0;
  expect(live).toBe(0);
});

/** Type `text` one character at a time through ProseMirror's text input path, as a keyboard does. */
function type(frenchTypography: boolean, text: string): string {
  editor?.destroy();
  editor = new Editor({
    element: document.createElement('div'),
    extensions: textExtensions(frenchTypography),
  });
  made.push(editor);
  const { view } = editor;
  for (const char of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, from, to, char, () => view.state.tr.insertText(char, from, to)),
    );
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
  }
  return editor.getText();
}

describe('French typography input rules', () => {
  it('sets no-break spaces while typing, when the book asks for it', () => {
    expect(type(true, 'Reykjavik\u0020: jour 1\u0020!')).toBe('Reykjavik\u00A0: jour 1\u202F!');
  });

  it('adds the space a mark is typed without', () => {
    expect(type(true, 'Vraiment?')).toBe('Vraiment\u202F?');
    expect(type(true, 'Ah;')).toBe('Ah\u202F;');
  });

  it('spaces guillemets', () => {
    expect(type(true, '«\u0020Salut\u0020»')).toBe('«\u00A0Salut\u202F»');
  });

  it('leaves a time and a web address alone', () => {
    expect(type(true, 'à 7:45')).toBe('à 7:45');
    expect(type(true, 'voir https://a.org/x?y=1')).toBe('voir https://a.org/x?y=1');
  });

  it('does nothing when the book does not ask for it', () => {
    expect(type(false, 'Reykjavik\u0020: jour 1\u0020!')).toBe('Reykjavik\u0020: jour 1\u0020!');
  });
});
