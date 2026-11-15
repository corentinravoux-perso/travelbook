import { fontFaceCss, type FontFile } from '@travelbook/render';

/**
 * The six fonts the text presets and the first fonts of the editor use. They are part of the
 * bundled list (`resources/fonts.json`, Task 6.4): the files are those of `resources/fonts/`,
 * served as `tb://resource/fonts/...`, so no font file exists twice. The licence record is
 * `LICENCES.md` beside this file and `fonts.json`. The latin subset of each covers é è ê ç œ Œ « ».
 */
export interface BookFont {
  family: string;
  /** What is stored in `style.fontFamily` and in the font family mark of a text. */
  css: string;
  files: FontFile[];
}

/** The file of a bundled face: `tb://resource/fonts/<id>/<id>-latin-<weight>-<style>.woff2`. */
export const resourceFontUrl = (id: string, weight: number, style: FontFile['style']): string =>
  `tb://resource/fonts/${id}/${id}-latin-${weight}-${style}.woff2`;

const face = (family: string, id: string, weight: number, style: FontFile['style']): FontFile => ({
  family,
  weight,
  style,
  url: resourceFontUrl(id, weight, style),
});

export const BOOK_FONTS: BookFont[] = [
  {
    family: 'Inter',
    css: "'Inter', sans-serif",
    files: [
      face('Inter', 'inter', 400, 'normal'),
      face('Inter', 'inter', 400, 'italic'),
      face('Inter', 'inter', 700, 'normal'),
      face('Inter', 'inter', 700, 'italic'),
    ],
  },
  {
    family: 'Lora',
    css: "'Lora', serif",
    files: [
      face('Lora', 'lora', 400, 'normal'),
      face('Lora', 'lora', 400, 'italic'),
      face('Lora', 'lora', 700, 'normal'),
      face('Lora', 'lora', 700, 'italic'),
    ],
  },
  {
    family: 'Playfair Display',
    css: "'Playfair Display', serif",
    files: [
      face('Playfair Display', 'playfair-display', 400, 'normal'),
      face('Playfair Display', 'playfair-display', 400, 'italic'),
      face('Playfair Display', 'playfair-display', 700, 'normal'),
      face('Playfair Display', 'playfair-display', 700, 'italic'),
    ],
  },
  {
    family: 'Cormorant Garamond',
    css: "'Cormorant Garamond', serif",
    files: [
      face('Cormorant Garamond', 'cormorant-garamond', 400, 'normal'),
      face('Cormorant Garamond', 'cormorant-garamond', 400, 'italic'),
      face('Cormorant Garamond', 'cormorant-garamond', 700, 'normal'),
      face('Cormorant Garamond', 'cormorant-garamond', 700, 'italic'),
    ],
  },
  {
    family: 'Oswald',
    css: "'Oswald', sans-serif",
    files: [face('Oswald', 'oswald', 400, 'normal'), face('Oswald', 'oswald', 700, 'normal')],
  },
  {
    family: 'Caveat',
    css: "'Caveat', cursive",
    files: [face('Caveat', 'caveat', 400, 'normal'), face('Caveat', 'caveat', 700, 'normal')],
  },
];

/** The default font of a new text. */
export const DEFAULT_BOOK_FONT = BOOK_FONTS[1]!;

/** First family name of a CSS font-family list, without quotes. */
export function firstFamily(css: string): string {
  const first = css.split(',')[0] ?? '';
  return first.trim().replace(/^(["'])(.*)\1$/, '$2');
}

/** The bundled font a stored family names, if it is one of them. */
export function bookFontOf(css: string): BookFont | undefined {
  const name = firstFamily(css).toLowerCase();
  return BOOK_FONTS.find((f) => f.family.toLowerCase() === name);
}

let installed: HTMLStyleElement | null = null;

/** Declare the bundled fonts to the document, once. */
export function installBookFonts(): void {
  if (installed !== null) return;
  installed = document.createElement('style');
  installed.dataset['bookFonts'] = '';
  installed.textContent = fontFaceCss(BOOK_FONTS.flatMap((f) => f.files));
  document.head.append(installed);
}
