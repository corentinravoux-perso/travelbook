import {
  pageBox,
  spreadSize,
  type Book,
  type Element,
  type Rect,
  type Side,
  type Spread,
} from '@travelbook/core';
import type { ReactElement, ReactNode } from 'react';
import { Background } from './Background';
import { MapView } from './elements/MapView';
import { PhotoView } from './elements/PhotoView';
import { ShapeView } from './elements/ShapeView';
import { StickerView } from './elements/StickerView';
import { TextView } from './elements/TextView';
import { projectFontFiles, useProjectFonts } from './projectFonts';
import type { SpreadViewProps } from './types';
import { mm } from './units';

/**
 * Trim box of a page grown by the bleed on its three outer edges; the spine edge stays where it
 * is, since the binding hides what is past it.
 */
function pageBackgroundBox(book: Book, spread: Spread, side: Side, bleed: number): Rect | null {
  const page = pageBox(book, spread, side);
  if (!page) return null;
  const x = side === 'left' ? page.x - bleed : page.x;
  return { x, y: page.y - bleed, w: page.w + bleed, h: page.h + 2 * bleed };
}

function drawElement(el: Element, p: SpreadViewProps): ReactElement | null {
  switch (el.type) {
    case 'photo':
      return (
        <PhotoView
          key={el.id}
          el={el}
          asset={el.assetId === null ? undefined : p.book.assets[el.assetId]}
          quality={p.quality}
          assetUrl={p.assetUrl}
          showEmptySlots={p.showEmptySlots ?? false}
        />
      );
    case 'sticker':
      return <StickerView key={el.id} el={el} quality={p.quality} assetUrl={p.assetUrl} />;
    case 'shape':
      return <ShapeView key={el.id} el={el} />;
    case 'text':
      return <TextView key={el.id} el={el} quality={p.quality} />;
    case 'map':
      return (
        <MapView
          key={el.id}
          el={el}
          geometry={p.mapGeometry?.(el.geometryAssetId) ?? null}
          quality={p.quality}
          assetUrl={p.assetUrl}
        />
      );
  }
}

/**
 * Draws a spread from the document: the only place where a document becomes pixels. The root is a
 * box in mm showing `clip`; the spread itself sits inside it, moved by minus the clip origin.
 * Zoom is the caller's: apply a CSS transform to the root.
 */
export function SpreadView(p: SpreadViewProps): ReactElement {
  const { book, spread, quality, assetUrl } = p;
  // The album's own fonts are declared before anything is drawn with them.
  useProjectFonts(projectFontFiles(book.assets, assetUrl));
  const size = spreadSize(book, spread);
  const clip = p.clip ?? { x: 0, y: 0, w: size.w, h: size.h };
  const bleed = spread.kind === 'cover' ? book.coverBleed : book.bleed;
  const backgrounds: ReactNode[] = [];
  const common = { assets: book.assets, quality, assetUrl };
  const { background } = spread;
  if (background.spread) {
    const box = { x: -bleed, y: -bleed, w: size.w + 2 * bleed, h: size.h + 2 * bleed };
    backgrounds.push(
      <Background
        key="spread"
        layer="spread"
        background={background.spread}
        box={box}
        tile={p.patternTile?.('spread')}
        {...common}
      />,
    );
  }
  for (const side of ['left', 'right'] as const) {
    const value = background[side];
    const box = value ? pageBackgroundBox(book, spread, side, bleed) : null;
    if (value && box)
      backgrounds.push(
        <Background
          key={side}
          layer={side}
          background={value}
          box={box}
          tile={p.patternTile?.(side)}
          {...common}
        />,
      );
  }

  const elements: ReactNode[] = [];
  for (const el of spread.elements) {
    if (el.hidden) continue;
    if (el.type === 'photo' && el.assetId === null && !p.showEmptySlots) continue;
    const node = drawElement(el, p);
    elements.push(
      p.renderElement ? <ElementSlot key={el.id}>{p.renderElement(el, node)}</ElementSlot> : node,
    );
  }

  return (
    <div
      data-spread-id={spread.id}
      data-quality={quality}
      style={{
        position: 'relative',
        width: mm(clip.w),
        height: mm(clip.h),
        overflow: 'hidden',
      }}
    >
      <div
        data-role="spread-layer"
        style={{
          position: 'absolute',
          left: mm(-clip.x),
          top: mm(-clip.y),
          width: mm(size.w),
          height: mm(size.h),
        }}
      >
        {backgrounds}
        {elements}
      </div>
    </div>
  );
}

/** Gives the node a renderElement hook returns a stable place in the list. */
function ElementSlot({ children }: { children: ReactNode }): ReactNode {
  return children;
}
