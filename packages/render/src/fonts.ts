import { cssUrl } from './units';

export interface FontFile {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  url: string;
}

const cssString = (s: string): string => `"${s.replace(/[\\"]/g, '\\$&').replace(/\n/g, '\\a ')}"`;

/** `@font-face` rules for the given files. The caller puts them in a `<style>` element. */
export function fontFaceCss(fonts: FontFile[]): string {
  return fonts
    .map((f) => {
      const weight = Number.isFinite(f.weight) ? Math.round(f.weight) : 400;
      const style = f.style === 'italic' ? 'italic' : 'normal';
      return (
        `@font-face{font-family:${cssString(f.family)};font-weight:${weight};` +
        `font-style:${style};font-display:block;src:${cssUrl(f.url)};}`
      );
    })
    .join('\n');
}

/** Faces asked for each family: regular, bold, italic and bold italic, whichever the family has. */
const FACES = ['400 16px', '700 16px', 'italic 400 16px', 'italic 700 16px'];

/**
 * Resolves once the browser has settled loading every face of every family (a family with no face
 * settles at once). Rejects with an Error naming the families if that takes more than `timeoutMs`.
 */
export async function whenFontsReady(families: string[], timeoutMs = 5000): Promise<void> {
  const unique = [...new Set(families)];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Fonts not ready after ${timeoutMs} ms: ${unique.join(', ')}`)),
      timeoutMs,
    );
  });
  const loading = Promise.allSettled(
    unique.flatMap((family) =>
      FACES.map((face) => document.fonts.load(`${face} ${cssString(family)}`)),
    ),
  ).then(() => undefined);
  try {
    await Promise.race([loading, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
