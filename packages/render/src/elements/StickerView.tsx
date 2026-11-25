import type { StickerElement } from '@travelbook/core';
import { useId, type ReactElement } from 'react';
import type { AssetUrl, Quality } from '../types';
import { elementBoxStyle, flipTransform } from './boxStyle';

export interface StickerViewProps {
  el: StickerElement;
  quality: Quality;
  assetUrl: AssetUrl;
}

/**
 * A sticker fills its box, stretched when the box is not at the picture's ratio: a new sticker
 * is placed at its natural ratio, so it only stretches when the user pulls an edge handle.
 * An SVG sticker in an `<img>` keeps its own `preserveAspectRatio` whatever `object-fit` says,
 * so the picture is an `<image preserveAspectRatio="none">` in an SVG of the box's size, which
 * overrides it for SVG and raster files alike. The tint paints the sticker's silhouette in one
 * colour: a rect of the tint under an alpha mask of the sticker (a mask, not a filter, so the PDF
 * keeps the sticker's own pixels instead of a raster of the box).
 */
export function StickerView({ el, quality, assetUrl }: StickerViewProps): ReactElement {
  const src = assetUrl(el.assetId, quality, el);
  // Unique in the document: the same sticker can be drawn twice (canvas and thumbnails).
  const maskId = `tb-tint-${el.id}-${useId().replace(/[^\w-]/g, '')}`;
  const image = (role: string) => (
    <image data-role={role} href={src} width="100" height="100" preserveAspectRatio="none" />
  );
  return (
    <div data-element-id={el.id} data-element-type="sticker" style={elementBoxStyle(el)}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          transform: flipTransform(el.flipH, el.flipV),
        }}
      >
        {el.tint === null ? (
          image('sticker')
        ) : (
          <>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="100"
              height="100"
              style={{ maskType: 'alpha' }}
            >
              {image('mask')}
            </mask>
            <rect
              data-role="tint"
              width="100"
              height="100"
              fill={el.tint}
              mask={`url(#${maskId})`}
            />
          </>
        )}
      </svg>
    </div>
  );
}
