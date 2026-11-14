import { Editor, type JSONContent } from '@tiptap/core';
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import { TextAlign } from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import loraBold from '@fontsource/lora/files/lora-latin-700-normal.woff2?url';
import loraItalic from '@fontsource/lora/files/lora-latin-400-italic.woff2?url';
import loraRegular from '@fontsource/lora/files/lora-latin-400-normal.woff2?url';
import { newElement, type TextElement } from '@travelbook/core';
import {
  fontFaceCss,
  textBoxStyle,
  TextView,
  whenFontsReady,
  type FontFile,
} from '@travelbook/render';
import { createRoot } from 'react-dom/client';

/**
 * Test-only half of the visual spec `e2e/render.spec.ts` for text: the same document drawn by
 * `TextView` and by a mounted, non-focused Tiptap editor inside the same `text.css` classes, in
 * two OFL fonts served from @fontsource.
 */

const FONTS: FontFile[] = [
  { family: 'Inter', weight: 400, style: 'normal', url: interRegular },
  { family: 'Inter', weight: 700, style: 'normal', url: interBold },
  { family: 'Lora', weight: 400, style: 'normal', url: loraRegular },
  { family: 'Lora', weight: 400, style: 'italic', url: loraItalic },
  { family: 'Lora', weight: 700, style: 'normal', url: loraBold },
];

const t = (text: string, ...marks: JSONContent['marks'] & unknown[]) => ({
  type: 'text',
  text,
  marks,
});
const p = (...content: JSONContent[]) => ({ type: 'paragraph', content });
const lora = { type: 'textStyle', attrs: { fontFamily: 'Lora, serif' } };

const DOC: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [t('Lisbon, late summer')] },
    p(
      t('Yellow trams climb the hills of Alfama while we drink coffee and watch the river. '),
      t('Every street smells of grilled sardines', { type: 'italic' }, lora),
      t(' and the light is '),
      t('unbelievably', { type: 'bold' }),
      t(' soft, '),
      t('even at noon', { type: 'underline' }, { type: 'textStyle', attrs: { color: '#b03a2e' } }),
      t('. A very long unbreakable-looking-word-that-keeps-going-and-going-and-going follows.'),
    ),
    p(t('Centred line', { type: 'textStyle', attrs: { fontSize: '16pt' } })),
    { type: 'paragraph', attrs: { textAlign: 'right' }, content: [t('Right aligned')] },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [p(t('Pastel de nata, twice'))] },
        { type: 'listItem', content: [p(t('Tram 28 to the castle, with a long wait in the sun'))] },
      ],
    },
    { type: 'paragraph' },
    p(t('Last paragraph, '), { type: 'hardBreak' }, t('after a soft break.', lora)),
  ],
};

function textElement(): TextElement {
  return {
    ...(newElement('text', { x: 0, y: 0, w: 90, h: 120 }) as TextElement),
    id: 'text-1',
    doc: DOC,
    style: {
      fontFamily: "'Inter', sans-serif",
      fontSizePt: 11,
      color: '#222222',
      lineHeight: 1.35,
      letterSpacing: 0.01,
    },
    align: 'justify',
    vAlign: 'top',
    box: { fill: '#fffdf7', padding: 4 },
  };
}

export interface TextMeasure {
  /** Height of the box, and of the laid-out content inside it, in CSS px. */
  box: number;
  content: number;
  /** Text of each rendered line, in order. */
  lines: string[];
}

/** The lines of `root`: its characters grouped by the top of their rectangles. */
function lines(root: HTMLElement): string[] {
  const out: { top: number; text: string }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? '';
    for (let i = 0; i < text.length; i++) {
      range.setStart(n, i);
      range.setEnd(n, i + 1);
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      const last = out[out.length - 1];
      if (last && Math.abs(last.top - rect.top) < 2) last.text += text[i];
      else out.push({ top: rect.top, text: text[i] as string });
    }
  }
  return out.map((l) => l.text);
}

function measure(box: HTMLElement): TextMeasure {
  const content = box.querySelector('.tb-text__content') as HTMLElement;
  return {
    box: box.getBoundingClientRect().height,
    content: content.getBoundingClientRect().height,
    lines: lines(content),
  };
}

export interface TextFixture {
  mount(): Promise<void>;
  measure(): { view: TextMeasure; editor: TextMeasure };
}

export function installTextFixture(host: HTMLElement): TextFixture {
  const el = textElement();
  let editor: Editor | null = null;
  return {
    async mount() {
      const style = document.createElement('style');
      style.textContent = fontFaceCss(FONTS);
      document.head.append(style);
      const viewHost = document.createElement('div');
      viewHost.dataset['testid'] = 'text-view';
      const editorHost = document.createElement('div');
      editorHost.dataset['testid'] = 'text-editor';
      host.style.cssText =
        'display:flex;gap:8mm;padding:8mm;background:#888;align-items:flex-start';
      for (const h of [viewHost, editorHost]) {
        h.style.cssText = 'position:relative;width:90mm;height:120mm';
        host.append(h);
      }
      createRoot(viewHost).render(<TextView el={el} />);
      // The editor's host takes the box's own style; the content class is the static view's.
      const box = document.createElement('div');
      box.className = 'tb-text';
      for (const [key, value] of Object.entries(textBoxStyle(el))) {
        // Custom properties only go through setProperty.
        if (key.startsWith('--')) box.style.setProperty(key, String(value));
        else Object.assign(box.style, { [key]: value });
      }
      editorHost.append(box);
      editor?.destroy();
      editor = new Editor({
        element: box,
        content: DOC,
        extensions: [
          StarterKit.configure({
            heading: { levels: [1, 2, 3] },
            link: false,
            blockquote: false,
            code: false,
            codeBlock: false,
            horizontalRule: false,
            strike: false,
            dropcursor: false,
            gapcursor: false,
            trailingNode: false,
          }),
          TextStyle,
          FontFamily,
          FontSize,
          Color,
          TextAlign.configure({ types: ['heading', 'paragraph'] }),
        ],
        editorProps: { attributes: { class: 'tb-text__content' } },
      });
      await whenFontsReady(['Inter', 'Lora']);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    },
    measure() {
      const q = (id: string) =>
        document.querySelector(`[data-testid="${id}"] .tb-text`) as HTMLElement;
      return { view: measure(q('text-view')), editor: measure(q('text-editor')) };
    },
  };
}
