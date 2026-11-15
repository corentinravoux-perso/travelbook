import {
  MM_TO_PX,
  applyPoster,
  posterLayout,
  recolorIllustration,
  type Licence,
  type MeasureText,
  type PosterIllustration,
  type PosterSpec,
} from '@travelbook/core';
import { whenFontsReady } from '@travelbook/render';
import { withAssets } from '../editor/photoImport';
import { svgRatio } from '../panels/stickers/model';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';

/** The licence of the bundled `affiches` set: our own drawings, under the repository's licence. */
export const AFFICHES_LICENCE: Licence = {
  source: 'travelbook',
  author: 'Corentin Ravoux',
  licence: 'MIT',
  url: 'https://github.com/corentinravoux/travelbook',
  requiresAttribution: false,
};

const REFERENCE_PX = 100;
let context: CanvasRenderingContext2D | null | undefined;

/**
 * Width in mm of a text in a face and size, measured on a canvas at a 100 px reference size.
 * Without a canvas (tests), an estimate of 0.55 em per character.
 */
export const measureText: MeasureText = (text, fontFamily, fontSizePt) => {
  const px = (fontSizePt * 96) / 72;
  if (context === undefined) {
    try {
      context = document.createElement('canvas').getContext('2d');
    } catch {
      context = null;
    }
  }
  if (!context) return (text.length * 0.55 * px) / MM_TO_PX;
  context.font = `400 ${REFERENCE_PX}px '${fontFamily}'`;
  return (context.measureText(text).width * (px / REFERENCE_PX)) / MM_TO_PX;
};

/** Where the SVG of an illustration is served: the offline sticker packs, or the user library. */
export function illustrationUrl(ill: PosterIllustration): string {
  return 'set' in ill ? `tb://sticker/${ill.set}/${ill.id}.svg` : `tb://library/${ill.itemId}`;
}

/** The SVG text of an illustration. Rejects when it cannot be read. */
export async function loadIllustrationSvg(ill: PosterIllustration): Promise<string> {
  const response = await fetch(illustrationUrl(ill));
  if (!response.ok) throw new Error(`Illustration unavailable (${response.status})`);
  const text = await response.text();
  if (!/<svg[\s>]/.test(text)) throw new Error('The illustration is not an SVG');
  return text;
}

/** Whether a drawing has colour roles the poster can change. */
export const RECOLOURABLE = /\sclass\s*=\s*["'][^"']*\btb-main\b/;

/**
 * Where a poster's drawing comes from, for the credits: a library sticker keeps its own title
 * and licence (none for the user's own file); the bundled drawings carry the `affiches` licence
 * and are named after the poster.
 */
export interface IllustrationOrigin {
  name?: string;
  licence?: Licence;
}

/**
 * Put a poster on the cover. Loads the illustration, recolours it when it has colour roles,
 * stores it as an album asset, lays the poster out, and applies everything in ONE
 * `store.apply`, so one undo restores the cover. Resolves to `false`, with a notice over the
 * canvas and the book unchanged, when anything fails.
 */
export async function applyPosterToCover(
  spec: PosterSpec,
  origin: IllustrationOrigin = { licence: AFFICHES_LICENCE },
): Promise<boolean> {
  if (editorStore.getState().book === null) return false;
  try {
    const raw = await loadIllustrationSvg(spec.illustration);
    const svg = RECOLOURABLE.test(raw) ? recolorIllustration(raw, spec.colors.illustration) : raw;
    const name =
      origin.name ?? `Affiche ${spec.title.trim().toLocaleUpperCase('fr') || 'sans titre'}`;
    const asset = await window.tb.assets.fromSvg(svg, {
      name,
      ...(origin.licence ? { licence: origin.licence } : {}),
    });
    const ratio = svgRatio(svg) ?? 1;
    await whenFontsReady([spec.font, 'Work Sans']).catch(() => undefined);
    const store = editorStore.getState();
    if (store.book === null) return false;
    store.apply((b) => {
      const withAsset = withAssets(b, [asset]);
      const result = posterLayout(withAsset, {
        spec,
        illustration: { assetId: asset.id, ratio },
        measure: measureText,
      });
      return applyPoster(withAsset, result);
    }, fr.poster.undoApply);
    return true;
  } catch (error) {
    console.error('Applying a poster failed', error);
    editorStore.getState().notify(fr.poster.applyFailed);
    return false;
  }
}
