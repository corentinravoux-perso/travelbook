import { setCrop, type AssetRef, type Book, type Crop, type PhotoElement } from '@travelbook/core';
import { imagePlacement } from '@travelbook/render';
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { editorStore, findSpread, useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import { assetUrl } from './assetUrl';
import { MAX_SCALE, MIN_SCALE, dimClip, panCrop, zoomCrop } from './cropMath';
import { frame } from './Selection';
import { rotatePoint } from './transform';
import type { ToMm } from './useTransform';

/** Wheel notches zoom by this factor per pixel of `deltaY`: about 1.2x for a mouse notch. */
const WHEEL_ZOOM = 0.0018;

export interface CropControls {
  /** The photo frame being cropped; `null` while crop mode is off. */
  element: PhotoElement | null;
  asset: AssetRef | undefined;
  /** Start dragging the image inside the frame from a press on it. */
  startPan(e: { clientX: number; clientY: number }): void;
  setScale(scale: number): void;
  /** Leave crop mode. */
  leave(): void;
}

let sessions = 0;

/**
 * Crop mode of the canvas: the frame being cropped (`cropId` of the store), its pan and zoom
 * as edits of `crop` (`cx`, `cy`, `scale`), and the keys and wheel that go with it. All the edits
 * of one visit to crop mode are one undo step. The canvas gives `host` (for the wheel) and `toMm`.
 */
export function useCrop(host: RefObject<HTMLElement | null>, toMm: ToMm): CropControls {
  const cropId = useEditor((s) => s.cropId);
  const book = useEditor((s) => s.book);
  const spreadId = useEditor((s) => s.currentSpreadId);
  const found = findSpread(book, spreadId)?.elements.find((el) => el.id === cropId);
  const element = found?.type === 'photo' && found.assetId !== null ? found : null;
  const asset = element?.assetId ? book?.assets[element.assetId] : undefined;

  const toMmRef = useRef(toMm);
  useLayoutEffect(() => {
    toMmRef.current = toMm;
  });
  // One key per visit: the pans and zooms of a visit merge into one undo step.
  const visit = useRef(0);
  useEffect(() => {
    if (cropId !== null) visit.current = ++sessions;
  }, [cropId]);

  // The frame can go while cropping (undo, delete) or lose its photo: nothing left to crop.
  const gone = cropId !== null && element === null;
  useEffect(() => {
    if (gone) editorStore.getState().exitCrop();
  }, [gone]);

  /** The frame as the store has it now, with its asset's pixel size, or null. */
  const live = useCallback(() => {
    const s = editorStore.getState();
    const el = findSpread(s.book, s.currentSpreadId)?.elements.find((e) => e.id === s.cropId);
    if (el?.type !== 'photo' || el.assetId === null) return null;
    const pixel = s.book?.assets[el.assetId]?.pixel;
    return pixel && s.currentSpreadId !== null ? { el, pixel, spreadId: s.currentSpreadId } : null;
  }, []);

  const write = useCallback(
    (crop: Crop) => {
      const now = live();
      if (!now) return;
      editorStore
        .getState()
        .apply(
          (b: Book) => setCrop(b, now.spreadId, now.el.id, crop),
          fr.photos.undoCrop,
          `crop:${now.el.id}:${visit.current}`,
        );
    },
    [live],
  );

  const startPan = useCallback(
    (first: { clientX: number; clientY: number }) => {
      const start = live();
      if (!start) return;
      const origin = toMmRef.current(first.clientX, first.clientY);
      const move = (ev: PointerEvent) => {
        const p = toMmRef.current(ev.clientX, ev.clientY);
        // The drag is measured along the frame's own axes, so a turned frame pans true.
        const d = rotatePoint({ x: p.x - origin.x, y: p.y - origin.y }, -start.el.rotation);
        write(
          panCrop(start.pixel, start.el, start.el.crop, d.x, d.y, {
            h: start.el.flipH,
            v: start.el.flipV,
          }),
        );
      };
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [live, write],
  );

  const setScale = useCallback(
    (scale: number) => {
      const now = live();
      if (now) write(zoomCrop(now.pixel, now.el, now.el.crop, scale));
    },
    [live, write],
  );

  const active = element !== null;
  // The plain wheel zooms the photo (Ctrl + wheel stays the canvas zoom, handled by the canvas).
  useEffect(() => {
    const el = host.current;
    if (!active || !el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      const now = live();
      if (!now) return;
      e.preventDefault();
      setScale(now.el.crop.scale * Math.exp(-e.deltaY * WHEEL_ZOOM));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [active, host, live, setScale]);

  // Enter and Escape leave. Handled first, and marked, so the canvas shortcuts leave them alone.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || (e.key !== 'Enter' && e.key !== 'Escape')) return;
      e.preventDefault();
      editorStore.getState().exitCrop();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);

  return {
    element,
    asset,
    startPan,
    setScale,
    leave: () => editorStore.getState().exitCrop(),
  };
}

/**
 * The whole image of the photo being cropped, dimmed, where it lies beyond the frame, with the
 * frame outlined. Drawn in screen px over the page. Dragging or zooming moves the image behind the
 * frame, which keeps showing the photo as the document renders it.
 */
export function CropOverlay({
  element,
  asset,
  scale,
}: {
  element: PhotoElement;
  asset: AssetRef | undefined;
  scale: number;
}) {
  const pixel = asset?.pixel;
  return (
    <div className="crop-layer" aria-hidden="true">
      <div
        className="crop-frame"
        data-testid="crop-frame"
        style={{ ...frame(element, scale), transform: `rotate(${element.rotation}deg)` }}
      >
        {pixel && asset && (
          <div
            className="crop-flip"
            style={{
              transform: `scale(${element.flipH ? -1 : 1}, ${element.flipV ? -1 : 1})`,
            }}
          >
            <img
              className="crop-image"
              src={assetUrl(asset.id, 'preview')}
              alt=""
              draggable={false}
              style={{
                ...imagePlacement(pixel, element, element.crop),
                clipPath: dimClip(pixel, element, element.crop),
              }}
            />
          </div>
        )}
        <div className="crop-outline" />
      </div>
    </div>
  );
}

/** The bar over the canvas while cropping: zoom slider, the value, and Terminer. */
export function CropBar({
  element,
  onScale,
  onDone,
}: {
  element: PhotoElement;
  onScale(scale: number): void;
  onDone(): void;
}) {
  const scale = element.crop.scale;
  return (
    <div className="crop-bar" role="group" aria-label={fr.crop.bar}>
      <Icon name="crop" />
      <input
        type="range"
        className="crop-bar__slider"
        aria-label={fr.crop.zoom}
        min={MIN_SCALE}
        max={MAX_SCALE}
        step={0.05}
        value={scale}
        onChange={(e) => onScale(Number(e.target.value))}
      />
      <output className="crop-bar__value">{fr.crop.zoomValue(scale)}</output>
      <button type="button" className="button button--small button--primary" onClick={onDone}>
        {fr.crop.done}
      </button>
      <p className="crop-bar__hint">{fr.crop.hint}</p>
    </div>
  );
}
