import type { ChainedCommands, Editor } from '@tiptap/core';
import { boundingBox, updateElements, type TextElement } from '@travelbook/core';
import { useEffect, useReducer, type ReactNode } from 'react';
import { FontSelect } from './FontSelect';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import type { IconName } from '../theme/icons';
import { splitColor } from './inspector/color';
import { ColorField, NumberField } from './inspector/controls';
import './TextEditing.css';

const t = fr.text;

type Align = TextElement['align'];

const ALIGNS: [Align, IconName, string][] = [
  ['left', 'align-left', t.alignLeft],
  ['center', 'align-center', t.alignCenter],
  ['right', 'align-right', t.alignRight],
  ['justify', 'align-justified', t.alignJustify],
];

/** A toggle that keeps the caret in the text: pressing it must not take the focus. */
function Tool({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onClick(): void;
}): ReactNode {
  return (
    <button
      type="button"
      className="icon-button insp-toggle"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

/**
 * The floating toolbar over the text being edited: font, size, colour, bold, italic, underline,
 * lists and alignment, for the selection. With nothing selected, the font, size and colour go to
 * the whole text, as the inspector sets them, so that both show the same. It sits above the box
 * (below it near the top of the page); `scale` is px per mm of the canvas.
 */
export function TextToolbar({
  editor,
  element,
  spreadId,
  scale,
}: {
  editor: Editor;
  element: TextElement;
  spreadId: string;
  scale: number;
}) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    editor.on('transaction', redraw);
    return () => void editor.off('transaction', redraw);
  }, [editor]);

  const box = boundingBox(element);
  const above = box.y * scale > 56;
  const run = () => editor.chain().focus();

  /**
   * Font, size or colour: on the selected text; with nothing selected, on all of it, the caret
   * staying where it is. A box with no text yet takes it as its style: there is no run to set.
   * `focus` is false for the colour, whose system picker a change of focus would close.
   */
  const restyle = (
    set: (chain: ChainedCommands) => ChainedCommands,
    style: Partial<TextElement['style']>,
    label: string,
    focus = true,
    mergeKey?: string,
  ) => {
    const start = focus ? editor.chain().focus() : editor.chain();
    const { empty, from, to } = editor.state.selection;
    if (!empty) return void set(start).run();
    if (editor.isEmpty) {
      editorStore
        .getState()
        .apply(
          (b) =>
            updateElements(b, spreadId, [element.id], { style: { ...element.style, ...style } }),
          label,
          mergeKey,
        );
      return void (focus && editor.commands.focus());
    }
    set(start.selectAll()).setTextSelection({ from, to }).run();
  };

  const marks = editor.getAttributes('textStyle') as {
    fontFamily?: string | null;
    fontSize?: string | null;
    color?: string | null;
  };
  const family = marks.fontFamily ?? element.style.fontFamily;
  const sizePt = marks.fontSize ? parseFloat(marks.fontSize) : element.style.fontSizePt;
  const color = marks.color ?? element.style.color;
  const paragraph = editor.getAttributes('paragraph') as { textAlign?: Align | null };
  const align = paragraph.textAlign ?? element.align;

  return (
    <div
      className="text-toolbar"
      role="toolbar"
      aria-label={t.toolbar}
      data-testid="text-toolbar"
      style={{
        left: box.x * scale,
        top: above ? box.y * scale : (box.y + box.h) * scale,
        transform: above ? 'translateY(calc(-100% - 8px))' : 'translateY(8px)',
      }}
      // A press here is the toolbar's: the canvas behind must not read it as a click outside.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <FontSelect
        className="input text-toolbar__font"
        label={t.font}
        value={family}
        onChange={(css) =>
          restyle((c) => c.setFontFamily(css), { fontFamily: css }, fr.textInspector.undoFont)
        }
      />
      <span
        className="text-toolbar__size"
        // Enter ends the entry, committed or not: the caret goes back to the text.
        onKeyDown={(e) => {
          if (e.key === 'Enter') setTimeout(() => editor.commands.focus(), 0);
        }}
      >
        <NumberField
          label={t.size}
          unit={t.sizeUnit}
          value={Math.round(sizePt * 10) / 10}
          min={1}
          max={400}
          onCommit={(pt) =>
            restyle((c) => c.setFontSize(`${pt}pt`), { fontSizePt: pt }, fr.textInspector.undoSize)
          }
        />
      </span>
      <span className="text-toolbar__color">
        <ColorField
          label={t.color}
          value={splitColor(color).hex}
          onChange={(hex, gesture) =>
            restyle(
              (c) => c.setColor(hex),
              { color: hex },
              fr.textInspector.undoColor,
              false,
              gesture,
            )
          }
        />
      </span>
      <span className="text-toolbar__sep" />
      <Tool
        icon="bold"
        label={t.bold}
        active={editor.isActive('bold')}
        onClick={() => run().toggleBold().run()}
      />
      <Tool
        icon="italic"
        label={t.italic}
        active={editor.isActive('italic')}
        onClick={() => run().toggleItalic().run()}
      />
      <Tool
        icon="underline"
        label={t.underline}
        active={editor.isActive('underline')}
        onClick={() => run().toggleUnderline().run()}
      />
      <span className="text-toolbar__sep" />
      <Tool
        icon="list"
        label={t.bulletList}
        active={editor.isActive('bulletList')}
        onClick={() => run().toggleBulletList().run()}
      />
      <Tool
        icon="list-numbers"
        label={t.orderedList}
        active={editor.isActive('orderedList')}
        onClick={() => run().toggleOrderedList().run()}
      />
      <span className="text-toolbar__sep" />
      {ALIGNS.map(([value, icon, label]) => (
        <Tool
          key={value}
          icon={icon}
          label={label}
          active={align === value}
          onClick={() => run().setTextAlign(value).run()}
        />
      ))}
    </div>
  );
}
