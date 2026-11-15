import {
  frenchSpacing,
  newElement,
  type Rect,
  type TextElement,
  type TextRole,
} from '@travelbook/core';
import { BOOK_FONTS } from '../fonts/bookFonts';
import { fr } from '../strings/fr';

export type PresetId = 'title' | 'subtitle' | 'caption' | 'body' | 'quote';

export interface TextPreset {
  id: PresetId;
  label: string;
  /** The text a new element starts with, selected so the first keystroke replaces it. */
  sample: string;
  role?: TextRole;
  font: string;
  fontSizePt: number;
  bold: boolean;
  italic: boolean;
  align: TextElement['align'];
  /** Size of the new box, in mm. */
  size: { w: number; h: number };
}

const css = (family: string): string => BOOK_FONTS.find((f) => f.family === family)!.css;

const t = fr.text;

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'title',
    label: t.presetTitle,
    sample: t.presetTitle,
    role: 'title',
    font: css('Playfair Display'),
    fontSizePt: 32,
    bold: true,
    italic: false,
    align: 'center',
    size: { w: 120, h: 22 },
  },
  {
    id: 'subtitle',
    label: t.presetSubtitle,
    sample: t.presetSubtitle,
    font: css('Cormorant Garamond'),
    fontSizePt: 20,
    bold: false,
    italic: true,
    align: 'center',
    size: { w: 110, h: 12 },
  },
  {
    id: 'caption',
    label: t.presetCaption,
    sample: t.presetCaption,
    role: 'caption',
    font: css('Inter'),
    fontSizePt: 9,
    bold: false,
    italic: false,
    align: 'center',
    size: { w: 70, h: 8 },
  },
  {
    id: 'body',
    label: t.presetBody,
    sample: t.presetBody,
    role: 'body',
    font: css('Lora'),
    fontSizePt: 11,
    bold: false,
    italic: false,
    align: 'left',
    size: { w: 90, h: 30 },
  },
  {
    id: 'quote',
    label: t.presetQuote,
    sample: frenchSpacing(`« ${t.presetQuote} »`),
    font: css('Cormorant Garamond'),
    fontSizePt: 18,
    bold: false,
    italic: true,
    align: 'center',
    size: { w: 100, h: 16 },
  },
];

/** A new text element of `preset` placed at `rect` (its own size when `rect` has none). */
export function presetElement(
  preset: TextPreset,
  at: Pick<Rect, 'x' | 'y'> & Partial<Pick<Rect, 'w' | 'h'>>,
): TextElement {
  const el = newElement('text', {
    x: at.x,
    y: at.y,
    w: at.w ?? preset.size.w,
    h: at.h ?? preset.size.h,
  });
  if (preset.role) el.textRole = preset.role;
  el.style = {
    fontFamily: preset.font,
    fontSizePt: preset.fontSizePt,
    color: '#222222',
    lineHeight: preset.id === 'body' ? 1.4 : 1.2,
    letterSpacing: 0,
  };
  el.align = preset.align;
  const marks = [
    ...(preset.bold ? [{ type: 'bold' }] : []),
    ...(preset.italic ? [{ type: 'italic' }] : []),
  ];
  el.doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: preset.sample, ...(marks.length > 0 ? { marks } : {}) }],
      },
    ],
  };
  return el;
}

/** A blank text element drawn with the text tool: the body look, no text yet. */
export function blankTextElement(rect: Rect): TextElement {
  const body = TEXT_PRESETS.find((p) => p.id === 'body')!;
  const el = presetElement(body, rect);
  el.doc = { type: 'doc', content: [{ type: 'paragraph' }] };
  return el;
}
