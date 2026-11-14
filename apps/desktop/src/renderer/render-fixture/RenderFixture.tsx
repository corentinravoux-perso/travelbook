import {
  newBook,
  newElement,
  visibleRect,
  type AssetRef,
  type Book,
  type Rect,
  type Spread,
} from '@travelbook/core';
import { SpreadView } from '@travelbook/render';
import { createRoot } from 'react-dom/client';

/**
 * Test-only page of the visual spec `e2e/render.spec.ts`: one fixed book drawn by `SpreadView` at
 * the three qualities, side by side, from images the spec made. Main loads it only when the app is
 * not packaged and `TB_RENDER_FIXTURE` is set (see `src/main/index.ts`).
 */

const PHOTO: AssetRef = {
  id: 'photo',
  kind: 'photo',
  file: 'originals/photo.jpg',
  originalName: 'photo.jpg',
  sha256: 'photo',
  pixel: { w: 1600, h: 1000 },
};
const STICKER: AssetRef = {
  id: 'sticker',
  kind: 'sticker',
  file: 'assets/sticker.svg',
  originalName: 'sticker.svg',
  sha256: 'sticker',
};

const CLIP: Rect = { x: 60, y: 20, w: 200, h: 130 };

function fixtureBook(): { book: Book; spread: Spread } {
  const book = newBook({ title: 'fixture', innerSpreads: 1 });
  book.assets = { photo: PHOTO, sticker: STICKER };
  const spread = book.spreads[1] as Spread;
  spread.background = { spread: { kind: 'color', color: '#f4efe6' } };
  const photo = {
    ...newElement('photo', { x: 70, y: 30, w: 90, h: 60 }),
    id: 'photo-1',
    assetId: 'photo',
    crop: { cx: 0.4, cy: 0.5, scale: 1.5 },
    rotation: 4,
    mask: { kind: 'rounded' as const, radius: 6 },
    border: { width: 1.5, color: '#ffffff' },
    shadow: { dx: 1, dy: 1.5, blur: 3, color: 'rgba(0,0,0,0.35)' },
  };
  const star = {
    ...newElement('photo', { x: 175, y: 35, w: 40, h: 40 }),
    id: 'photo-2',
    assetId: 'photo',
    mask: { kind: 'preset' as const, preset: 'star' },
    flipH: true,
  };
  const sticker = {
    ...newElement('sticker', { x: 220, y: 90, w: 30, h: 30 }),
    id: 'sticker-1',
    assetId: 'sticker',
  };
  const shape = {
    ...newElement('shape', { x: 80, y: 105, w: 70, h: 30 }),
    id: 'shape-1',
    shape: 'ellipse' as const,
    fill: '#3b82a0',
    stroke: { width: 1, color: '#12394a' },
  };
  spread.elements = [shape, photo, star, sticker];
  return { book, spread };
}

/** `thumb` and `preview` are the whole photo; `export` is one cropped derivative per photo element. */
export interface FixtureImages {
  thumb: string;
  preview: string;
  export: Record<string, string>;
  sticker: string;
}

declare global {
  interface Window {
    __fixture: {
      /** Source-pixel window of each photo of the fixture, for the export derivatives. */
      crops(): {
        id: string;
        sx: number;
        sy: number;
        sw: number;
        sh: number;
        w: number;
        h: number;
      }[];
      /** The clip, in mm. */
      clip: Rect;
      mount(images: FixtureImages): void;
    };
  }
}

export function installFixture(host: HTMLElement): void {
  const { book, spread } = fixtureBook();
  const root = createRoot(host);
  window.__fixture = {
    clip: CLIP,
    crops: () =>
      spread.elements.flatMap((el) =>
        el.type === 'photo' && PHOTO.pixel
          ? [{ id: el.id, ...visibleRect(PHOTO.pixel, el, el.crop), w: el.w, h: el.h }]
          : [],
      ),
    mount: (images) => {
      root.render(
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8mm', background: '#888' }}>
          {(['thumb', 'preview', 'export'] as const).map((quality) => (
            <div key={quality} data-testid={quality}>
              <SpreadView
                book={book}
                spread={spread}
                quality={quality}
                clip={CLIP}
                assetUrl={(id, q, el) =>
                  id === 'sticker'
                    ? images.sticker
                    : q === 'export'
                      ? (images.export[el?.id ?? ''] ?? '')
                      : images[q]
                }
              />
            </div>
          ))}
        </div>,
      );
    },
  };
}
