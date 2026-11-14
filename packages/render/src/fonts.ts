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
 * Resolves once every face of every family has loaded. Rejects with an Error naming the families
 * that failed to load, or that were not loaded within `timeoutMs`: drawing with them would silently
 * use a fallback font.
 */
export async function whenFontsReady(families: string[], timeoutMs = 5000): Promise<void> {
  const unique = [...new Set(families)];
  const failed = new Set<string>();
  const loadFamily = async (family: string): Promise<void> => {
    const results = await Promise.allSettled(
      FACES.map((face) => document.fonts.load(`${face} ${cssString(family)}`)),
    );
    const rejected = results.some((r) => r.status === 'rejected');
    if (rejected || !document.fonts.check(`16px ${cssString(family)}`)) failed.add(family);
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled = new Set<string>();
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  const loading = Promise.all(unique.map((f) => loadFamily(f).then(() => settled.add(f))));
  try {
    await Promise.race([loading, timeout]);
  } finally {
    clearTimeout(timer);
  }
  const bad = unique.filter((f) => failed.has(f) || !settled.has(f));
  if (bad.length > 0)
    throw new Error(`Fonts not loaded (${timeoutMs} ms limit): ${bad.join(', ')}`);
}
