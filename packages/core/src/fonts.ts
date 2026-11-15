import type { AssetRef, Book } from './schema';

/** First family name of a CSS font-family list, without quotes: `'Playfair Display', serif` gives `Playfair Display`. */
export function firstFontFamily(css: string): string {
  const first = css.split(',')[0] ?? '';
  return first.trim().replace(/^(["'])(.*)\1$/, '$2');
}

/** Family names found in the marks of a Tiptap document. */
function collectMarkFamilies(node: unknown, out: Set<string>): void {
  if (typeof node !== 'object' || node === null) return;
  const { marks, content } = node as { marks?: unknown; content?: unknown };
  if (Array.isArray(marks)) {
    for (const mark of marks) {
      if (typeof mark !== 'object' || mark === null) continue;
      const { type, attrs } = mark as { type?: unknown; attrs?: { fontFamily?: unknown } };
      if (type === 'textStyle' && typeof attrs?.fontFamily === 'string') {
        const family = firstFontFamily(attrs.fontFamily);
        if (family !== '') out.add(family);
      }
    }
  }
  if (Array.isArray(content)) for (const child of content) collectMarkFamilies(child, out);
}

/**
 * The font families the text of the book draws with: the base family of every text element and
 * every family set by a mark inside its document, by name, sorted. Generic families
 * (`serif`, `sans-serif`...) are names too: callers match the ones they know.
 */
export function fontFamiliesUsed(book: Book): string[] {
  const families = new Set<string>();
  for (const spread of [book.cover, ...book.spreads]) {
    for (const el of spread.elements) {
      if (el.type !== 'text') continue;
      const base = firstFontFamily(el.style.fontFamily);
      if (base !== '') families.add(base);
      collectMarkFamilies(el.doc, families);
    }
  }
  return [...families].sort();
}

/** One face of a font family, as the book and the library name it. */
export interface FontFaceName {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

/**
 * The name a font file goes by in the library (its title) and in an album (the `originalName` of
 * its asset, plus the extension): `Lora|700|italic`. One string, so that an album carries what it
 * needs to declare the face (`@font-face`) without any other record.
 */
export const fontFaceName = (face: FontFaceName): string =>
  `${face.family}|${face.weight}|${face.style}`;

/** The face a name written by `fontFaceName` stands for (with or without a file extension); `null` for any other text. */
export function parseFontFaceName(name: string): FontFaceName | null {
  const match = /^(.+)\|(\d{3})\|(normal|italic)(?:\.[A-Za-z0-9]{1,5})?$/.exec(name);
  if (!match) return null;
  return {
    family: match[1] as string,
    weight: Number(match[2]),
    style: match[3] as 'normal' | 'italic',
  };
}

/** The face an asset of kind `font` is, from its original name; `null` for any other asset. */
export function fontFaceOfAsset(asset: AssetRef): FontFaceName | null {
  return asset.kind === 'font' ? parseFontFaceName(asset.originalName) : null;
}
