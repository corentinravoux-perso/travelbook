import { type AssetRef, type Background as BackgroundValue, type Rect } from '@travelbook/core';
import { MM_TO_PX } from '@travelbook/core';
import type { CSSProperties, ReactElement } from 'react';
import { patternTileMm } from './patternTile';
import type { AssetUrl, Quality } from './types';
import { cssUrl, mm, pct, round } from './units';

export interface BackgroundProps {
  background: BackgroundValue;
  /** Which of the three backgrounds of a spread this is; only a label in the DOM. */
  layer: 'spread' | 'left' | 'right';
  /** The region it covers, in spread coordinates (mm). */
  box: Rect;
  assets: Record<string, AssetRef>;
  quality: Quality;
  assetUrl: AssetUrl;
  /** The pattern tile painted with the foreground colour, when the caller has made it. */
  tile?: string;
}

/** Pixels per inch at which a tiled image or a pattern keeps its natural size. */
const TILE_DPI = 300;

const FILL: CSSProperties = { position: 'absolute', inset: 0 };

function gradient(bg: Extract<BackgroundValue, { kind: 'gradient' }>): string {
  const stops = bg.stops.map((s) => `${s.color} ${pct(s.offset * 100)}`).join(', ');
  return bg.type === 'linear'
    ? `linear-gradient(${round(bg.angle)}deg, ${stops})`
    : `radial-gradient(ellipse at center, ${stops})`;
}

/** Size of a tile, in mm so that every quality draws it the same, whatever the file's pixels. */
function tileSize(asset: AssetRef | undefined): string {
  if (!asset?.pixel) return 'auto';
  const k = 25.4 / TILE_DPI;
  return `${mm(asset.pixel.w * k)} ${mm(asset.pixel.h * k)}`;
}

function Pattern({
  bg,
  quality,
  assetUrl,
  tile,
}: Omit<BackgroundProps, 'layer' | 'box' | 'background'> & {
  bg: Extract<BackgroundValue, { kind: 'pattern' }>;
}): ReactElement {
  const w = patternTileMm(bg);
  if (tile !== undefined) {
    return (
      <div
        data-role="pattern"
        style={{
          ...FILL,
          backgroundImage: cssUrl(tile),
          backgroundRepeat: 'repeat',
          backgroundSize: `${mm(w)} auto`,
          backgroundPosition: '0 0',
        }}
      />
    );
  }
  // The tile is a stencil: it is painted with `fg` over the `bg` colour of the root.
  return (
    <div
      data-role="pattern"
      style={{
        ...FILL,
        backgroundColor: bg.fg,
        maskImage: cssUrl(assetUrl(bg.assetId, quality)),
        maskRepeat: 'repeat',
        maskSize: `${mm(w)} auto`,
        maskPosition: '0 0',
      }}
    />
  );
}

function ImageLayers({
  bg,
  assets,
  quality,
  assetUrl,
}: Omit<BackgroundProps, 'layer' | 'box' | 'background'> & {
  bg: Extract<BackgroundValue, { kind: 'image' }>;
}): ReactElement {
  const url = cssUrl(assetUrl(bg.assetId, quality));
  const tile = bg.fit === 'tile';
  const size = tile ? tileSize(assets[bg.assetId]) : bg.fit;
  const repeat = tile ? 'repeat' : 'no-repeat';
  // A blurred layer is larger than the box, so that the blur does not fade at the edges; the
  // tiles are moved back so they stay where they would be without it.
  const grow = bg.blur > 0 ? 2 * bg.blur : 0;
  const position = tile ? `${mm(grow)} ${mm(grow)}` : 'center center';
  const inset = grow > 0 ? mm(-grow) : 0;
  return (
    <>
      <div
        data-role="image"
        style={{
          position: 'absolute',
          inset,
          backgroundImage: url,
          backgroundSize: size,
          backgroundRepeat: repeat,
          backgroundPosition: position,
          filter: bg.blur > 0 ? `blur(${round(bg.blur * MM_TO_PX)}px)` : undefined,
        }}
      />
      {bg.tint !== null ? (
        <div
          data-role="tint"
          style={{
            position: 'absolute',
            inset,
            backgroundColor: bg.tint,
            mixBlendMode: 'multiply',
            maskImage: url,
            maskSize: size,
            maskRepeat: repeat,
            maskPosition: position,
          }}
        />
      ) : null}
    </>
  );
}

/** One background of a spread: a box in mm that clips what it draws. */
export function Background({
  background: bg,
  layer,
  box,
  assets,
  quality,
  assetUrl,
  tile,
}: BackgroundProps): ReactElement {
  const style: CSSProperties = {
    position: 'absolute',
    left: mm(box.x),
    top: mm(box.y),
    width: mm(box.w),
    height: mm(box.h),
    overflow: 'hidden',
  };
  const common = { assets, quality, assetUrl };
  let content: ReactElement | null = null;
  switch (bg.kind) {
    case 'color':
      style.backgroundColor = bg.color;
      break;
    case 'gradient':
      style.backgroundImage = gradient(bg);
      break;
    case 'pattern':
      style.backgroundColor = bg.bg;
      content = <Pattern bg={bg} tile={tile} {...common} />;
      break;
    case 'image':
      if (bg.opacity !== 1) style.opacity = bg.opacity;
      if (bg.tint !== null) style.isolation = 'isolate';
      content = <ImageLayers bg={bg} {...common} />;
      break;
  }
  return (
    <div data-background={layer} data-background-kind={bg.kind} style={style}>
      {content}
    </div>
  );
}
