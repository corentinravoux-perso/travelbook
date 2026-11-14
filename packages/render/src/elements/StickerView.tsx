import type { StickerElement } from '@travelbook/core';
import type { ReactElement } from 'react';
import type { AssetUrl, Quality } from '../types';
import { cssUrl } from '../units';
import { elementBoxStyle, flipTransform } from './boxStyle';

export interface StickerViewProps {
  el: StickerElement;
  quality: Quality;
  assetUrl: AssetUrl;
}

export function StickerView({ el, quality, assetUrl }: StickerViewProps): ReactElement {
  const src = assetUrl(el.assetId, quality, el);
  const transform = flipTransform(el.flipH, el.flipV);
  return (
    <div data-element-id={el.id} data-element-type="sticker" style={elementBoxStyle(el)}>
      {el.tint === null ? (
        <img
          src={src}
          alt=""
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'contain', transform }}
        />
      ) : (
        // The sticker is the stencil, the tint the paint: this recolours a single-colour sticker.
        <div
          data-role="tint"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: el.tint,
            maskImage: cssUrl(src),
            maskSize: 'contain',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
            transform,
          }}
        />
      )}
    </div>
  );
}
