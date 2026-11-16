import {
  MM_TO_PX,
  SPINE_TEXT_MIN,
  applyPoster,
  posterLayout,
  type AssetRef,
  type Book,
  type PosterSpec,
} from '@travelbook/core';
import { SpreadView, whenFontsReady } from '@travelbook/render';
import { useEffect, useMemo, useState } from 'react';
import { assetUrl } from '../editor/assetUrl';
import { withAssets } from '../editor/photoImport';
import { measureText } from './posterActions';

export const PREVIEW_ASSET_ID = 'poster-preview';

const previewAsset: AssetRef = {
  id: PREVIEW_ASSET_ID,
  kind: 'sticker',
  file: 'poster-preview.svg',
  originalName: 'poster-preview.svg',
  sha256: '',
};

/** Re-renders once the faces of a poster are loaded, so the title is measured in them. */
function useFontsTick(families: string[]): number {
  const [tick, setTick] = useState(0);
  const key = families.join('|');
  useEffect(() => {
    let live = true;
    whenFontsReady(key.split('|'))
      .catch(() => undefined)
      .then(() => live && setTick((n) => n + 1));
    return () => {
      live = false;
    };
  }, [key]);
  return tick;
}

/** The spine face of the volume view is never narrower than this share of the front. */
const VOLUME_SPINE_MIN = 0.07;

/**
 * The front cover and the spine of `book` with the poster `spec` applied, drawn by the real
 * renderer, `height` px tall. The illustration is `svgUrl` (a blob of the recoloured drawing, or
 * its tb:// address), `ratio` its width over height. Decoration: the caller labels it.
 *
 * `volume` shows the same poster as a closed book seen from the left (CSS 3D, no extra
 * rendering): the spine folds back at the hinge, the front recedes, a light hinge crease and a
 * soft gloss sit on top, a contact shadow below. The flat view stays the default.
 */
export function PosterPreview({
  book,
  spec,
  svgUrl,
  ratio,
  height,
  volume = false,
}: {
  book: Book;
  spec: PosterSpec;
  svgUrl: string;
  ratio: number;
  height: number;
  volume?: boolean;
}) {
  const tick = useFontsTick([spec.font, 'Work Sans']);
  const preview = useMemo(() => {
    void tick;
    const b = withAssets(book, [previewAsset]);
    return applyPoster(
      b,
      posterLayout(b, {
        spec,
        illustration: { assetId: PREVIEW_ASSET_ID, ratio },
        measure: measureText,
      }),
    );
  }, [book, spec, ratio, tick]);
  const W = book.format.width;
  const H = book.format.height;
  const spine = book.spineWidth >= SPINE_TEXT_MIN || volume ? book.spineWidth : 0;
  const clip = { x: W + book.spineWidth - spine, y: 0, w: spine + W, h: H };
  const scale = height / (H * MM_TO_PX);
  const paper = () => (
    <span className="poster-preview__paper" style={{ transform: `scale(${scale})` }}>
      <SpreadView
        book={preview}
        spread={preview.cover}
        clip={clip}
        quality="thumb"
        assetUrl={(id, quality, el) =>
          id === PREVIEW_ASSET_ID ? svgUrl : assetUrl(id, quality, el)
        }
      />
    </span>
  );
  if (volume) {
    const k = height / H;
    const frontPx = W * k;
    const spinePx = spine * k;
    const face = Math.max(spinePx, VOLUME_SPINE_MIN * frontPx);
    return (
      <span
        className="poster-preview poster-book"
        aria-hidden="true"
        style={{ width: Math.round(frontPx + face), height }}
      >
        <span className="poster-book__shadow" />
        <span className="poster-book__body" style={{ transformOrigin: `${face}px 50%` }}>
          <span className="poster-book__front" style={{ left: face, width: frontPx, height }}>
            <span className="poster-book__shift" style={{ left: -spinePx }}>
              {paper()}
            </span>
            <span className="poster-book__gloss" />
          </span>
          <span
            className="poster-book__spine"
            style={{ width: face, height, background: spec.colors.background }}
          >
            {spinePx >= 1 && (
              <span
                className="poster-book__shift"
                style={{ transform: `scaleX(${face / spinePx})` }}
              >
                {paper()}
              </span>
            )}
            <span className="poster-book__spine-shade" />
          </span>
        </span>
      </span>
    );
  }
  const width = Math.round((clip.w / H) * height);
  return (
    <span className="poster-preview" aria-hidden="true" style={{ width, height }}>
      {paper()}
      {spine > 0 && (
        <span className="poster-preview__spine" style={{ width: (spine / H) * height }} />
      )}
    </span>
  );
}
