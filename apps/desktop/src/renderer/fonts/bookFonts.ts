import cormorantBold from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff2?url';
import cormorantBoldItalic from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-italic.woff2?url';
import cormorantItalic from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff2?url';
import cormorantRegular from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2?url';
import caveatBold from '@fontsource/caveat/files/caveat-latin-700-normal.woff2?url';
import caveatRegular from '@fontsource/caveat/files/caveat-latin-400-normal.woff2?url';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';
import interBoldItalic from '@fontsource/inter/files/inter-latin-700-italic.woff2?url';
import interItalic from '@fontsource/inter/files/inter-latin-400-italic.woff2?url';
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import loraBold from '@fontsource/lora/files/lora-latin-700-normal.woff2?url';
import loraBoldItalic from '@fontsource/lora/files/lora-latin-700-italic.woff2?url';
import loraItalic from '@fontsource/lora/files/lora-latin-400-italic.woff2?url';
import loraRegular from '@fontsource/lora/files/lora-latin-400-normal.woff2?url';
import oswaldBold from '@fontsource/oswald/files/oswald-latin-700-normal.woff2?url';
import oswaldRegular from '@fontsource/oswald/files/oswald-latin-400-normal.woff2?url';
import playfairBold from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2?url';
import playfairBoldItalic from '@fontsource/playfair-display/files/playfair-display-latin-700-italic.woff2?url';
import playfairItalic from '@fontsource/playfair-display/files/playfair-display-latin-400-italic.woff2?url';
import playfairRegular from '@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff2?url';
import { fontFaceCss, whenFontsReady, type FontFile } from '@travelbook/render';

/**
 * The fonts bundled for the book text, until Task 6.4 brings the full list. All are OFL; the
 * record is `LICENCES.md` beside this file. The latin subset of each covers é è ê ç œ Œ « ».
 */
export interface BookFont {
  family: string;
  /** What is stored in `style.fontFamily` and in the font family mark of a text. */
  css: string;
  files: FontFile[];
}

const face = (family: string, weight: number, style: FontFile['style'], url: string): FontFile => ({
  family,
  weight,
  style,
  url,
});

export const BOOK_FONTS: BookFont[] = [
  {
    family: 'Inter',
    css: "'Inter', sans-serif",
    files: [
      face('Inter', 400, 'normal', interRegular),
      face('Inter', 400, 'italic', interItalic),
      face('Inter', 700, 'normal', interBold),
      face('Inter', 700, 'italic', interBoldItalic),
    ],
  },
  {
    family: 'Lora',
    css: "'Lora', serif",
    files: [
      face('Lora', 400, 'normal', loraRegular),
      face('Lora', 400, 'italic', loraItalic),
      face('Lora', 700, 'normal', loraBold),
      face('Lora', 700, 'italic', loraBoldItalic),
    ],
  },
  {
    family: 'Playfair Display',
    css: "'Playfair Display', serif",
    files: [
      face('Playfair Display', 400, 'normal', playfairRegular),
      face('Playfair Display', 400, 'italic', playfairItalic),
      face('Playfair Display', 700, 'normal', playfairBold),
      face('Playfair Display', 700, 'italic', playfairBoldItalic),
    ],
  },
  {
    family: 'Cormorant Garamond',
    css: "'Cormorant Garamond', serif",
    files: [
      face('Cormorant Garamond', 400, 'normal', cormorantRegular),
      face('Cormorant Garamond', 400, 'italic', cormorantItalic),
      face('Cormorant Garamond', 700, 'normal', cormorantBold),
      face('Cormorant Garamond', 700, 'italic', cormorantBoldItalic),
    ],
  },
  {
    family: 'Oswald',
    css: "'Oswald', sans-serif",
    files: [
      face('Oswald', 400, 'normal', oswaldRegular),
      face('Oswald', 700, 'normal', oswaldBold),
    ],
  },
  {
    family: 'Caveat',
    css: "'Caveat', cursive",
    files: [
      face('Caveat', 400, 'normal', caveatRegular),
      face('Caveat', 700, 'normal', caveatBold),
    ],
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

/** Resolves when the faces of `families` are loaded, so text drawn now is measured with them. */
export function bookFontsReady(families: string[]): Promise<void> {
  installBookFonts();
  const bundled = families.map(firstFamily).filter((f) => BOOK_FONTS.some((b) => b.family === f));
  return whenFontsReady(bundled);
}
