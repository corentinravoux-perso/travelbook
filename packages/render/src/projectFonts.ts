import { fontFaceOfAsset, type Book } from '@travelbook/core';
import { useLayoutEffect } from 'react';
import { fontFaceCss, type FontFile } from './fonts';
import type { AssetUrl } from './types';

/**
 * The faces of the fonts the album carries (assets of kind `font`, named by `fontFaceName`), as
 * files to declare. Assets whose name is not a face are left out.
 */
export function projectFontFiles(assets: Book['assets'], assetUrl: AssetUrl): FontFile[] {
  const files: FontFile[] = [];
  for (const asset of Object.values(assets)) {
    const face = fontFaceOfAsset(asset);
    if (face) files.push({ ...face, url: assetUrl(asset.id, 'export') });
  }
  return files.sort(
    (a, b) =>
      a.family.localeCompare(b.family) || a.weight - b.weight || a.style.localeCompare(b.style),
  );
}

/** One `<style>` per distinct set of `@font-face` rules, shared by every view that needs it. */
const installed = new Map<string, { element: HTMLStyleElement; users: number }>();

/**
 * Declare the album's own fonts to the document. The rules go to the end of `<head>`, after the
 * application's bundled and library fonts, so for a family the album carries its copy is the one
 * used: an album looks the same on a machine where the library font is missing or has changed.
 * Views drawing the same fonts share one `<style>`, removed with the last of them.
 */
export function useProjectFonts(files: readonly FontFile[]): void {
  const css = fontFaceCss([...files]);
  useLayoutEffect(() => {
    if (css === '') return;
    let entry = installed.get(css);
    if (entry === undefined) {
      const element = document.createElement('style');
      element.dataset['projectFonts'] = '';
      element.textContent = css;
      document.head.append(element);
      entry = { element, users: 0 };
      installed.set(css, entry);
    }
    entry.users++;
    const mine = entry;
    return () => {
      mine.users--;
      if (mine.users === 0) {
        mine.element.remove();
        installed.delete(css);
      }
    };
  }, [css]);
}
