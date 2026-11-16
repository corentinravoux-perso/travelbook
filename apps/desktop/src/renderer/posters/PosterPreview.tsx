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
import { useMapGeometryLookup } from '../maps/geometryCache';

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

/**
 * The front cover and the spine of `book` with the poster `spec` applied, drawn by the real
 * renderer, `height` px tall. The illustration is `svgUrl` (a blob of the recoloured drawing, or
 * its tb:// address), `ratio` its width over height. Decoration: the caller labels it.
 */
export function PosterPreview({
  book,
  spec,
  svgUrl,
  ratio,
  height,
}: {
  book: Book;
  spec: PosterSpec;
  svgUrl: string;
  ratio: number;
  height: number;
}) {
  const tick = useFontsTick([spec.font, 'Work Sans']);
  const mapGeometry = useMapGeometryLookup();
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
  const spine = book.spineWidth >= SPINE_TEXT_MIN ? book.spineWidth : 0;
  const clip = { x: W + book.spineWidth - spine, y: 0, w: spine + W, h: H };
  const scale = height / (H * MM_TO_PX);
  const width = Math.round((clip.w / H) * height);
  return (
    <span className="poster-preview" aria-hidden="true" style={{ width, height }}>
      <span className="poster-preview__paper" style={{ transform: `scale(${scale})` }}>
        <SpreadView
          book={preview}
          spread={preview.cover}
          clip={clip}
          quality="thumb"
          mapGeometry={mapGeometry}
          assetUrl={(id, quality, el) =>
            id === PREVIEW_ASSET_ID ? svgUrl : assetUrl(id, quality, el)
          }
        />
      </span>
      {spine > 0 && (
        <span className="poster-preview__spine" style={{ width: (spine / H) * height }} />
      )}
    </span>
  );
}
