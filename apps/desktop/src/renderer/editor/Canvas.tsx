import { spreadSize } from '@travelbook/core';
import { SpreadView } from '@travelbook/render';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { editorStore, findSpread, useEditor } from '../store/editor';
import { MissingNotice } from './MissingNotice';
import { fr } from '../strings/fr';
import { assetUrl } from './assetUrl';
import { CoverTools, SpineZone } from './CoverEditor';
import { Guides } from './Guides';
import { spreadName } from './pages';
import { Selection } from './Selection';
import { useShortcuts } from './shortcuts';
import { elementAt, enclosedBy, normalizedRect, withGroups, type Pt } from './transform';
import { DRAG_SLOP_PX, useTransform } from './useTransform';
import { useZoomPan } from './useZoomPan';
import type { Rect } from '@travelbook/core';

/** How long a notice stays up, in ms. */
const NOTICE_MS = 5000;

/**
 * The current spread, editable: click, Shift-click and marquee select; handles move, resize and
 * rotate; Ctrl+wheel and the keys zoom; Space-drag pans; overlays show the print guides. The
 * document is drawn by `SpreadView`; everything here sits on top of it, in screen px.
 */
export function Canvas() {
  const book = useEditor((s) => s.book);
  const currentId = useEditor((s) => s.currentSpreadId);
  const selection = useEditor((s) => s.selection);
  const showGuides = useEditor((s) => s.guides);
  const zoom = useEditor((s) => s.zoom);
  const notice = useEditor((s) => s.notice);
  const hostRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const spread = findSpread(book, currentId);
  const size = book && spread ? spreadSize(book, spread) : null;
  const { panning, startPan, scale } = useZoomPan(hostRef, pageRef, size);

  const toMm = useCallback(
    (clientX: number, clientY: number): Pt => {
      const rect = pageRef.current?.getBoundingClientRect();
      return rect
        ? { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
        : { x: 0, y: 0 };
    },
    [scale],
  );
  const transform = useTransform(toMm, scale);
  useShortcuts();

  // The selection holds only elements of this spread that still exist (undo, delete, new spread).
  useEffect(() => {
    if (!spread) return;
    const alive = selection.filter((id) => spread.elements.some((el) => el.id === id));
    if (alive.length !== selection.length) editorStore.getState().select(alive);
  }, [spread, selection]);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => editorStore.getState().notify(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const startMarquee = (first: PointerEvent, additive: boolean) => {
    if (!spread) return;
    const base = additive ? selection : [];
    const from = toMm(first.clientX, first.clientY);
    let dragged = false;
    const move = (ev: globalThis.PointerEvent) => {
      if (
        !dragged &&
        Math.hypot(ev.clientX - first.clientX, ev.clientY - first.clientY) < DRAG_SLOP_PX
      ) {
        return;
      }
      dragged = true;
      const rect = normalizedRect(from, toMm(ev.clientX, ev.clientY));
      setMarquee(rect);
      const inside = withGroups(spread, enclosedBy(spread, rect));
      editorStore.getState().select([...new Set([...base, ...inside])]);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      setMarquee(null);
      if (!dragged && !additive) editorStore.getState().select([]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    if (!host || !spread) return;
    const box = host.getBoundingClientRect();
    // A press on a scroll bar is the scroll bar's.
    if (e.clientX >= box.left + host.clientWidth || e.clientY >= box.top + host.clientHeight)
      return;
    if (panning || e.button === 1) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    const hit = elementAt(spread, toMm(e.clientX, e.clientY));
    if (!hit) {
      startMarquee(e, e.shiftKey);
      return;
    }
    const { select } = editorStore.getState();
    const group = withGroups(spread, [hit.id]);
    if (e.shiftKey) {
      const all = group.every((id) => selection.includes(id));
      select(
        all
          ? selection.filter((id) => !group.includes(id))
          : [...new Set([...selection, ...group])],
      );
      return;
    }
    if (!selection.includes(hit.id)) select(group);
    transform.startMove(e);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!spread || e.buttons !== 0 || panning) return;
    const hit = elementAt(spread, toMm(e.clientX, e.clientY));
    setHoverId(hit?.id ?? null);
  };

  const selected = useMemo(
    () => (spread ? spread.elements.filter((el) => selection.includes(el.id)) : []),
    [spread, selection],
  );
  const hover = spread?.elements.find((el) => el.id === hoverId);

  return (
    <main className="shell-canvas" aria-label={fr.shell.canvas}>
      <MissingNotice />
      {book && spread && <CoverTools book={book} spread={spread} />}
      {notice !== null && (
        <p className="canvas-notice" role="status">
          {notice}
        </p>
      )}
      {book === null || spread === undefined || size === null ? (
        <p className="shell-canvas__empty">{fr.shell.noAlbum}</p>
      ) : null}
      <div
        className="canvas-scroller"
        ref={hostRef}
        data-panning={panning || undefined}
        data-over-selection={hoverId !== null && selection.includes(hoverId) ? '' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverId(null)}
      >
        {book && spread && size && (
          <div className="canvas-stage">
            <div
              className="canvas-page"
              ref={pageRef}
              style={{ width: size.w * scale, height: size.h * scale }}
            >
              <div
                className="canvas-paper"
                role="img"
                aria-label={spreadName(book, spread)}
                data-spread-id={spread.id}
              >
                <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
                  <SpreadView
                    book={book}
                    spread={spread}
                    quality="preview"
                    assetUrl={assetUrl}
                    showEmptySlots
                  />
                </div>
              </div>
              {spread.kind === 'cover' && <SpineZone book={book} scale={scale} />}
              <Guides
                book={book}
                spread={spread}
                show={showGuides}
                scale={scale}
                snap={transform.guides}
              />
              <Selection
                selected={selected}
                hover={hover}
                scale={scale}
                onResize={(handle, e) => transform.startResize(handle, e)}
                onRotate={(e) => transform.startRotate(e)}
              />
              {marquee && (
                <div
                  className="canvas-marquee"
                  style={{
                    left: marquee.x * scale,
                    top: marquee.y * scale,
                    width: marquee.w * scale,
                    height: marquee.h * scale,
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
