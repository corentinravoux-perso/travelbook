import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { MM_TO_PX } from '@travelbook/core';
import { editorStore, MAX_ZOOM, MIN_ZOOM, useEditor } from '../store/editor';
import { isTypingTarget } from './shortcuts';

/** Free room kept around the page, in px. */
export const STAGE_MARGIN = 32;

/** The page keeps the point under the cursor fixed while the zoom changes. */
interface Anchor {
  clientX: number;
  clientY: number;
  /** The point of the page under the anchor, in mm. */
  mmX: number;
  mmY: number;
}

export interface ZoomPan {
  /** Space is held: a drag pans instead of selecting. */
  panning: boolean;
  /** Start a pan from a pointer press (Space-drag or middle button). */
  startPan(e: { clientX: number; clientY: number; pointerId: number }): void;
  /** Px per mm at the current zoom. */
  scale: number;
}

/**
 * Zoom and pan of the workspace `host` (a scroll container showing `pageRef`, a page of
 * `sizeMm`). Ctrl+wheel zooms about the cursor; Space-drag scrolls; in fit mode the zoom follows
 * the size of the host. The zoom itself lives in the store (`+`, `-`, `0` and the top bar set it).
 */
export function useZoomPan(
  host: RefObject<HTMLElement | null>,
  pageRef: RefObject<HTMLElement | null>,
  sizeMm: { w: number; h: number } | null,
): ZoomPan {
  const zoom = useEditor((s) => s.zoom);
  const fit = useEditor((s) => s.fit);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  const [panning, setPanning] = useState(false);
  const anchor = useRef<Anchor | null>(null);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => setRoom({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [host]);

  // Fit mode: the zoom is whatever shows the whole spread.
  const w = sizeMm?.w ?? 0;
  const h = sizeMm?.h ?? 0;
  useLayoutEffect(() => {
    if (!fit || w === 0 || room.w === 0) return;
    const wanted = Math.min(
      (room.w - 2 * STAGE_MARGIN) / (w * MM_TO_PX),
      (room.h - 2 * STAGE_MARGIN) / (h * MM_TO_PX),
    );
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, wanted));
    if (Math.abs(next - editorStore.getState().zoom) > 1e-6) editorStore.setState({ zoom: next });
  }, [fit, w, h, room.w, room.h]);

  // After a zoom, scroll so the anchored point is back under the cursor.
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = host.current;
    const page = pageRef.current;
    if (!a || !el || !page) return;
    anchor.current = null;
    const rect = page.getBoundingClientRect();
    const s = zoom * MM_TO_PX;
    el.scrollBy(rect.left + a.mmX * s - a.clientX, rect.top + a.mmY * s - a.clientY);
  }, [zoom, host, pageRef]);

  // Ctrl+wheel zooms about the cursor (a pinch arrives the same way); a plain wheel scrolls.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const page = pageRef.current;
      if (!page) return;
      const rect = page.getBoundingClientRect();
      const s = editorStore.getState().zoom * MM_TO_PX;
      anchor.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        mmX: (e.clientX - rect.left) / s,
        mmY: (e.clientY - rect.top) / s,
      };
      editorStore.getState().zoomBy(Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [host, pageRef]);

  // Space turns the pointer into a hand.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTypingTarget(e.target)) return;
      if (e.target instanceof HTMLElement && ['BUTTON', 'A'].includes(e.target.tagName)) return;
      e.preventDefault();
      setPanning(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setPanning(false);
    };
    const off = () => setPanning(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', off);
    };
  }, []);

  const startPan: ZoomPan['startPan'] = (e) => {
    const el = host.current;
    if (!el) return;
    const from = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    const move = (ev: PointerEvent) => {
      el.scrollLeft = from.left - (ev.clientX - from.x);
      el.scrollTop = from.top - (ev.clientY - from.y);
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

  return { panning, startPan, scale: zoom * MM_TO_PX };
}
