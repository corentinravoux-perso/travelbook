import { MM_TO_PX, type AssetRef, type PhotoElement } from '@travelbook/core';
import type { CSSProperties, ReactElement } from 'react';
import { featherCss, maskCss } from '../masks';
import type { AssetUrl, Quality } from '../types';
import { mm, round } from '../units';
import { elementBoxStyle, flipTransform } from './boxStyle';
import { adjustFilter, imagePlacement, vignetteGradient } from './photoStyle';

export interface PhotoViewProps {
  el: PhotoElement;
  /** The album's record of `el.assetId`; its pixel size places the image. */
  asset: AssetRef | undefined;
  quality: Quality;
  assetUrl: AssetUrl;
  /** Draw a placeholder for a frame that has no photo; without it such a frame draws nothing. */
  showEmptySlots: boolean;
}

const FILL: CSSProperties = { position: 'absolute', inset: 0 };

/** The image inside the frame: placed from `visibleRect`, or filling it when it is already cropped. */
function imageStyle(
  el: PhotoElement,
  asset: AssetRef | undefined,
  quality: Quality,
): CSSProperties {
  // The export derivative has the adjustments baked in (Task 7.1): drawing them again would
  // apply them twice. The editor's own qualities draw them as CSS.
  const filter = quality === 'export' ? undefined : adjustFilter(el.adjust);
  const common: CSSProperties = { position: 'absolute', maxWidth: 'none', filter };
  if (quality === 'export') {
    // The export derivative is the visible window already: it is the frame.
    return { ...common, left: 0, top: 0, width: '100%', height: '100%', objectFit: 'fill' };
  }
  if (asset?.pixel) {
    return { ...common, ...imagePlacement(asset.pixel, el, el.crop), objectFit: 'fill' };
  }
  // The size of the image is unknown: cover the frame around the crop centre, zoomed from there.
  const focus = `${round(el.crop.cx * 100, 3)}% ${round(el.crop.cy * 100, 3)}%`;
  return {
    ...common,
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: focus,
    transform: `scale(${el.crop.scale})`,
    transformOrigin: focus,
  };
}

/** The "+" drawn in an empty frame, sized to the frame. */
function EmptySlot({ el }: { el: PhotoElement }): ReactElement {
  const size = Math.min(10, el.w / 3, el.h / 3);
  return (
    <div
      data-role="empty-slot"
      style={{
        ...FILL,
        background: 'rgba(120, 120, 130, 0.16)',
        outline: '0.3mm dashed rgba(90, 90, 100, 0.7)',
        outlineOffset: '-0.3mm',
      }}
    >
      <svg
        viewBox="0 0 10 10"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: mm(size),
          height: mm(size),
          transform: 'translate(-50%, -50%)',
        }}
      >
        <path d="M5 1V9M1 5H9" stroke="rgba(90, 90, 100, 0.8)" strokeWidth={1} fill="none" />
      </svg>
    </div>
  );
}

/** The border, drawn inside the frame so that the element never grows past its box. */
function Border({
  border,
  mask,
}: {
  border: NonNullable<PhotoElement['border']>;
  mask: ReturnType<typeof maskCss>;
}): ReactElement {
  if (mask.outline === undefined) {
    return (
      <div
        data-role="border"
        style={{
          ...FILL,
          boxShadow: `inset 0 0 0 ${mm(border.width)} ${border.color}`,
          borderRadius: mask.borderRadius,
        }}
      />
    );
  }
  // A preset has no border-radius to follow: stroke its outline twice as wide as asked and let
  // the clip-path of the layer cut away the outer half.
  return (
    <div data-role="border" style={{ ...FILL, clipPath: mask.clipPath }}>
      <svg
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
        }}
      >
        <g transform={`scale(${MM_TO_PX})`}>
          <path
            d={mask.outline}
            fill="none"
            stroke={border.color}
            strokeWidth={round(2 * border.width)}
          />
        </g>
      </svg>
    </div>
  );
}

export function PhotoView({
  el,
  asset,
  quality,
  assetUrl,
  showEmptySlots,
}: PhotoViewProps): ReactElement | null {
  const empty = el.assetId === null;
  if (empty && !showEmptySlots) return null;
  const mask = maskCss(el.mask, el);
  const { shadow } = el;
  // Vignette and feather, like the filter, are in the export derivative: only the editor draws them.
  const styled = !empty && quality !== 'export';
  const vignette = styled ? el.adjust.vignette : 0;
  const feather = styled && el.edge ? featherCss(el.mask, el, el.edge.feather) : undefined;
  return (
    <div data-element-id={el.id} data-element-type="photo" style={elementBoxStyle(el)}>
      <div
        data-role="shadow"
        style={{
          ...FILL,
          // `drop-shadow` follows the clipped shape; its blur is a standard deviation, the half
          // of the blur radius that box-shadow and text-shadow take.
          filter: shadow
            ? `drop-shadow(${mm(shadow.dx)} ${mm(shadow.dy)} ${mm(shadow.blur / 2)} ${shadow.color})`
            : undefined,
        }}
      >
        <div
          data-role="frame"
          style={{
            ...FILL,
            overflow: 'hidden',
            borderRadius: mask.borderRadius,
            clipPath: mask.clipPath,
            ...feather,
          }}
        >
          {empty ? (
            <EmptySlot el={el} />
          ) : (
            <div
              data-role="flip"
              style={{
                ...FILL,
                // The export derivative is mirrored already (Task 7.1).
                transform: quality === 'export' ? undefined : flipTransform(el.flipH, el.flipV),
              }}
            >
              <img
                src={assetUrl(el.assetId as string, quality, el)}
                alt=""
                draggable={false}
                style={imageStyle(el, asset, quality)}
              />
            </div>
          )}
          {vignette > 0 && (
            <div
              data-role="vignette"
              style={{
                ...FILL,
                backgroundImage: vignetteGradient(vignette),
                pointerEvents: 'none',
              }}
            />
          )}
          {el.border && el.border.width > 0 ? <Border border={el.border} mask={mask} /> : null}
        </div>
      </div>
    </div>
  );
}
