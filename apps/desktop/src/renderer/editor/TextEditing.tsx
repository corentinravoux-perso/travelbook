import { Editor, type JSONContent } from '@tiptap/core';
import { updateElements, type TextElement } from '@travelbook/core';
import { textBoxStyle } from '@travelbook/render';
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { bookFontsReady, firstFamily } from '../fonts/bookFonts';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';
import { leaveTextEdit } from './textActions';
import { isTooShort, neededHeightMm } from './textFit';
import { textExtensions } from './tiptap';

let sessions = 0;

/**
 * Tiptap mounted in place of the static text of `el`. The host is the `.tb-text` box itself,
 * styled by `textBoxStyle` and the content is the same `.tb-text__content` as `TextView`'s, so
 * edited and static text break lines identically (Task 4.2). The box is as tall as its content
 * when that is more than `el.h`, which is a minimum.
 *
 * Typing is committed as it happens, through `store.apply`, with one merge key for the whole
 * session: leaving edit mode leaves one undo step. A change of the document from outside (undo,
 * redo, a snapshot) replaces what the editor shows.
 */
export function TextEditing({
  el,
  spreadId,
  frenchTypography,
  selectAll,
  onEditor,
}: {
  el: TextElement;
  spreadId: string;
  frenchTypography: boolean;
  /** Start with all the text selected (a new preset), else with the caret at the end. */
  selectAll: boolean;
  /** The editor, once mounted; `null` when it is destroyed. The toolbar drives it. */
  onEditor(editor: Editor | null): void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  /** The document last given to or taken from the editor, as JSON: what `el.doc` is compared with. */
  const known = useRef(JSON.stringify(el.doc));
  const latest = useRef({ el, onEditor });
  useLayoutEffect(() => {
    latest.current = { el, onEditor };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const session = `text:${latest.current.el.id}:${++sessions}`;
    const editor = new Editor({
      element: host,
      content: latest.current.el.doc as JSONContent,
      extensions: textExtensions(frenchTypography),
      editorProps: { attributes: { class: 'tb-text__content', spellcheck: 'false' } },
      onUpdate: ({ editor: e }) => {
        const { el: current } = latest.current;
        const needed = neededHeightMm(host);
        const doc = e.getJSON();
        known.current = JSON.stringify(doc);
        const patch = {
          doc,
          ...(isTooShort(current.h, needed) ? { h: needed } : {}),
        };
        editorStore
          .getState()
          .apply(
            (b) => updateElements(b, spreadId, [current.id], patch),
            fr.text.undoEdit,
            session,
          );
      },
    });
    editorRef.current = editor;
    latest.current.onEditor(editor);
    editor.commands.focus(selectAll ? 'all' : 'end');
    // Text is laid out again when a face arrives; a face that never does is worth telling.
    void bookFontsReady([firstFamily(latest.current.el.style.fontFamily)]).catch(() =>
      editorStore.getState().notify(fr.text.fontsNotLoaded),
    );
    return () => {
      latest.current.onEditor(null);
      editorRef.current = null;
      editor.destroy();
    };
    // One editor per editing session: `el`, `selectAll` and the typography flag are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreadId, el.id]);

  // Undo, redo or a restored snapshot changed the text under the editor.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;
    const now = JSON.stringify(el.doc);
    if (now === known.current) return;
    known.current = now;
    editor.commands.setContent(el.doc as JSONContent, { emitUpdate: false });
  }, [el.doc]);

  const style: CSSProperties = {
    ...textBoxStyle(el),
    height: 'auto',
    minHeight: `${el.h}mm`,
  };
  return (
    <div
      ref={hostRef}
      className="tb-text tb-text--editing"
      data-element-id={el.id}
      data-element-type="text"
      data-testid="text-editor"
      style={style}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          leaveTextEdit();
        }
      }}
    />
  );
}
