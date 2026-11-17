import { MM_TO_PX, type MapElement, type MapGeometry, type Spread } from '@travelbook/core';
import { SpreadView } from '@travelbook/render';
import { useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '../editor/assetUrl';
import { useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import { BakeCancelled, bake, debounceMs } from './bakeClient';
import { mapDialogStore, subjectBase, subjectPack, updateSpec, type MapSpec } from './dialogModel';
import { worldLand } from './mapActions';
import { panFrame, zoomFrame } from './previewFrame';
import { geometryKey, rememberBake, rememberedBake } from './previewBake';

/** The largest the preview is drawn, in CSS px. */
const MAX_W = 620;
const MAX_H = 440;
/** On a short window the preview takes this share of its height at most, so the buttons stay in view. */
const MAX_H_SHARE = 0.4;
/** One wheel notch (`deltaY` 100) zooms by this factor. */
const ZOOM_PER_NOTCH = Math.exp(0.15);
const DRAG_SLOP_PX = 2;

interface Settled {
  /** The geometry inputs this settles. */
  inputs: string;
  subjectId: string;
  /** `null` when the bake failed. */
  geometry: MapGeometry | null;
}

/**
 * The geometry of the map being edited, baked off the main thread (see `bakeClient`) after the
 * inputs that change it: subject, regions, layers, projection, rough outline, detail, far
 * territories. Colours, places and the frame never come here. While a bake runs the last
 * geometry of the same subject stays on screen.
 */
export function usePreviewGeometry(spec: MapSpec | null): {
  geometry: MapGeometry | null;
  busy: boolean;
  failed: boolean;
} {
  const [settled, setSettled] = useState<Settled | null>(null);
  // the last good geometry stays until a newer one replaces it
  const [kept, setKept] = useState<{ subjectId: string; geometry: MapGeometry } | null>(null);
  const latest = useRef(spec);
  const shown = useRef<string | null>(null);
  useEffect(() => {
    latest.current = spec;
    shown.current = kept?.subjectId ?? null;
  });
  const inputs = spec ? geometryKey(spec, false, false) : null;

  useEffect(() => {
    if (inputs === null) return;
    let live = true;
    const run = async () => {
      const now = latest.current;
      if (!now) return;
      const subjectId = now.subject.id;
      try {
        const [base, fine, world] = await Promise.all([
          subjectBase(subjectId),
          now.subject.regions.length > 0 ? subjectPack(subjectId) : null,
          worldLand(),
        ]);
        if (!live) return;
        const pack = fine?.pack ?? null;
        const key = geometryKey(now, pack !== null, world !== null);
        let geometry = rememberedBake(key);
        if (!geometry) {
          geometry = await bake({
            base,
            pack,
            world,
            subject: now.subject,
            projection: now.projection,
            rough: now.style.rough,
            detail: now.style.outline.detail,
          });
          if (!live) return;
          rememberBake(key, geometry);
        }
        setKept({ subjectId, geometry });
        setSettled({ inputs, subjectId, geometry });
      } catch (error) {
        // dropped on purpose (superseded, dialog closed): no failed state, nothing to report
        if (!live || error instanceof BakeCancelled) return;
        console.error('Baking the map preview failed', error);
        setSettled({ inputs, subjectId, geometry: null });
      }
    };
    // a new subject is baked at once; later changes wait for the user to stop clicking
    const wait = shown.current === latest.current?.subject.id ? debounceMs() : 0;
    const timer = setTimeout(() => void run(), wait);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [inputs]);

  const geometry = kept && spec && kept.subjectId === spec.subject.id ? kept.geometry : null;
  const busy = inputs !== null && settled?.inputs !== inputs;
  return { geometry, busy, failed: !busy && settled !== null && settled.geometry === null };
}

/**
 * The map as it will be placed, drawn by the real renderer in the proportions of its box. The
 * wheel zooms about the pointer, dragging pans; both set `frame` and never bake again.
 */
export function MapPreview({
  spec,
  box,
  geometry,
  busy,
}: {
  spec: MapSpec;
  /** The box the map will have, mm. */
  box: { w: number; h: number };
  geometry: MapGeometry | null;
  busy: boolean;
}) {
  const book = useEditor((s) => s.book);
  const surface = useRef<HTMLDivElement>(null);
  const maxH = Math.min(MAX_H, Math.max(220, Math.round(window.innerHeight * MAX_H_SHARE)));
  const zoomPx = Math.min(MAX_W / (box.w * MM_TO_PX), maxH / (box.h * MM_TO_PX));
  const pxPerMm = MM_TO_PX * zoomPx;
  const width = Math.round(box.w * pxPerMm);
  const height = Math.round(box.h * pxPerMm);

  // what the gestures read is the live spec: a gesture is a stream of events
  const live = useRef({ spec, geometry, box, pxPerMm });
  useEffect(() => {
    live.current = { spec, geometry, box, pxPerMm };
  });

  const element = useMemo<MapElement>(
    () => ({
      id: 'map-preview',
      x: 0,
      y: 0,
      w: box.w,
      h: box.h,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      name: '',
      type: 'map',
      geometryAssetId: 'preview',
      ...spec,
    }),
    [spec, box.w, box.h],
  );
  const spread = useMemo<Spread>(
    () => ({ id: 'map-preview', kind: 'inner', background: {}, elements: [element] }),
    [element],
  );

  useEffect(() => {
    const node = surface.current;
    if (!node) return;
    // not passive: a wheel turn over the preview must not scroll the dialog
    const onWheel = (e: WheelEvent) => {
      const { geometry: g, box: b, pxPerMm: k } = live.current;
      const s = mapDialogStore.getState().spec;
      e.preventDefault();
      if (!g || !s) return;
      const rect = node.getBoundingClientRect();
      const factor = Math.pow(ZOOM_PER_NOTCH, -e.deltaY / 100);
      const at: [number, number] = [(e.clientX - rect.left) / k, (e.clientY - rect.top) / k];
      void updateSpec({
        frame: zoomFrame(g, b, s.frame, s.subject.includeRemote, factor, at),
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !live.current.geometry) return;
    let last = { x: e.clientX, y: e.clientY };
    let moved = false;
    const move = (ev: PointerEvent) => {
      const { geometry: g, box: b, pxPerMm: k } = live.current;
      // the frame is read from the store: the previous move may not have been rendered yet
      const s = mapDialogStore.getState().spec;
      if (!g || !s) return;
      const dx = ev.clientX - last.x;
      const dy = ev.clientY - last.y;
      if (!moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
      moved = true;
      last = { x: ev.clientX, y: ev.clientY };
      void updateSpec({
        frame: panFrame(g, b, s.frame, s.subject.includeRemote, dx / k, dy / k),
      });
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  if (!book) return null;
  return (
    <div
      ref={surface}
      className="map-preview"
      role="group"
      aria-label={fr.maps.preview}
      aria-busy={busy}
      style={{ width, height }}
      onPointerDown={onPointerDown}
    >
      <div className="map-preview__paper" style={{ transform: `scale(${zoomPx})` }}>
        <SpreadView
          book={book}
          spread={spread}
          clip={{ x: 0, y: 0, w: box.w, h: box.h }}
          quality="thumb"
          mapGeometry={() => geometry}
          assetUrl={assetUrl}
        />
      </div>
      {busy && <span className="map-preview__busy">{fr.maps.baking}</span>}
    </div>
  );
}
