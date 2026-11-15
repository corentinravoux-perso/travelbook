import type { Editor } from '@tiptap/core';
import { spreadSize } from '@travelbook/core';
import { SpreadView } from '@travelbook/render';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { editorStore, findSpread, useEditor } from '../store/editor';
import { MissingNotice } from './MissingNotice';
import { fr } from '../strings/fr';
import { assetUrl } from './assetUrl';
import { CoverTools, SpineZone } from './CoverEditor';
import { CropBar, CropOverlay, useCrop } from './CropMode';
import { DpiBadges } from './DpiBadge';
import { Guides } from './Guides';
import { usePhotoDrop, usePhotoSwap } from './PhotoDrop';
import { spreadName } from './pages';
import { Selection, frame } from './Selection';
import { addDrawnShape, isSegment } from './shapeActions';
import { addDrawnText, leaveTextEdit } from './textActions';
import { TextEditing } from './TextEditing';
import { TextToolbar } from './TextToolbar';
import { MIN_DRAWN_MM, roundRect } from './draw';
import { useDraw } from './useDraw';
import { useShortcuts } from './shortcuts';
import {
  elementAt,
  enclosedBy,
  normalizedRect,
  pointInElement,
  withGroups,
  type Pt,
} from './transform';
import { DRAG_SLOP_PX, useTransform } from './useTransform';
import { useZoomPan } from './useZoomPan';
import type { Element, PhotoElement, Rect } from '@travelbook/core';
import './PhotoEditing.css';

/** How long a notice stays up, in ms. */
const NOTICE_MS = 5000;
/** Size of a text box made by a click with the text tool, in mm. */
const DEFAULT_TEXT_W = 60;
const DEFAULT_TEXT_H = 12;

/**
 * The current spread, editable: click, Shift-click and marquee select; handles move, resize and
 * rotate; Ctrl+wheel and the keys zoom; Space-drag pans; overlays show the print guides and the
 * resolution of each photo. Photos drop on it (from the tray, or as files from the system),
 * a click on an empty frame opens the photo picker, a double-click crops a photo, and Ctrl-drag
 * swaps two photos. The document is drawn by `SpreadView`; everything here sits on top of it, in
 * screen px.
 */
export function Canvas() {
  const book = useEditor((s) => s.book);
  const currentId = useEditor((s) => s.currentSpreadId);
  const selection = useEditor((s) => s.selection);
  const showGuides = useEditor((s) => s.guides);
  const zoom = useEditor((s) => s.zoom);
  const notice = useEditor((s) => s.notice);
  const tool = useEditor((s) => s.tool);
  const shapeKind = useEditor((s) => s.shapeKind);
  const editingId = useEditor((s) => s.editingId);
  const editSelectAll = useEditor((s) => s.editSelectAll);
  const [textEditor, setTextEditor] = useState<Editor | null>(null);
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
  const photoDrop = usePhotoDrop(toMm);
  const swap = usePhotoSwap(toMm);
  const crop = useCrop(hostRef, toMm);
  const draw = useDraw(toMm);
  useShortcuts();

  // The selection holds only elements of this spread that still exist (undo, delete, new spread).
  useEffect(() => {
    if (!spread) return;
    const alive = selection.filter((id) => spread.elements.some((el) => el.id === id));
    if (alive.length !== selection.length) editorStore.getState().select(alive);
  }, [spread, selection]);

  // The text being typed in is an element of this spread that still exists (undo, delete).
  useEffect(() => {
    if (editingId === null || !spread) return;
    if (!spread.elements.some((el) => el.id === editingId && el.type === 'text')) leaveTextEdit();
  }, [spread, editingId]);

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
    const at = toMm(e.clientX, e.clientY);
    // The text box being typed in is Tiptap's: the caret and the selection are its own.
    const editing =
      editingId === null ? undefined : spread.elements.find((el) => el.id === editingId);
    if (editing) {
      if (pointInElement(editing, at)) return;
      leaveTextEdit();
    }
    if (tool === 'shape') {
      draw.start(e, isSegment(shapeKind) ? 'line' : 'box', (from, to, dragged) =>
        addDrawnShape(shapeKind, from, to, dragged),
      );
      return;
    }
    if (tool === 'text') {
      draw.start(e, 'box', (from, to, dragged) => {
        const box = normalizedRect(from, to);
        const drawn = dragged && box.w >= MIN_DRAWN_MM && box.h >= MIN_DRAWN_MM;
        addDrawnText(
          roundRect(drawn ? box : { x: from.x, y: from.y, w: DEFAULT_TEXT_W, h: DEFAULT_TEXT_H }),
        );
      });
      return;
    }
    // Crop mode: a press on the frame drags the photo inside it, a press anywhere else leaves.
    if (crop.element) {
      if (pointInElement(crop.element, at)) crop.startPan(e);
      else crop.leave();
      return;
    }
    editorStore.getState().closePicker();
    const hit = elementAt(spread, at);
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
    // Ctrl-drag of a placed photo onto another frame swaps their photos instead of moving it.
    if ((e.ctrlKey || e.metaKey) && hit.type === 'photo' && hit.assetId !== null && !hit.locked) {
      select([hit.id]);
      swap.start(e, hit);
      return;
    }
    if (!selection.includes(hit.id)) select(group);
    transform.startMove(e);
    if (hit.type === 'photo' && hit.assetId === null && !hit.locked) armSlotClick(e, hit);
  };

  /** A press and release on an empty frame, without a drag, opens the photo picker for it. */
  const armSlotClick = (first: PointerEvent, slot: PhotoElement) => {
    const end = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const clicked =
        ev.type === 'pointerup' &&
        Math.hypot(ev.clientX - first.clientX, ev.clientY - first.clientY) < DRAG_SLOP_PX;
      if (clicked) editorStore.getState().openPicker(slot.id);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!spread || crop.element) return;
    const hit = elementAt(spread, toMm(e.clientX, e.clientY));
    if (hit?.type === 'photo' && hit.assetId !== null && !hit.locked) {
      editorStore.getState().enterCrop(hit.id);
    } else if (hit?.type === 'text' && hit.id !== editingId) {
      editorStore.getState().enterTextEdit(hit.id);
    }
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
  const editing = spread?.elements.find((el) => el.id === editingId);
  const lineDraft = draw.draft?.kind === 'line' ? draw.draft : null;

  /** The editor draws the text being typed in, in place of the static text. */
  const renderElement = useCallback(
    (el: Element, node: ReactNode): ReactNode =>
      el.type === 'text' && el.id === editingId && spread ? (
        <TextEditing
          key={el.id}
          el={el}
          spreadId={spread.id}
          frenchTypography={book?.settings.frenchTypography ?? false}
          selectAll={editSelectAll}
          onEditor={setTextEditor}
        />
      ) : (
        node
      ),
    [editingId, spread, book, editSelectAll],
  );

  return (
    <main className="shell-canvas" aria-label={fr.shell.canvas}>
      <MissingNotice />
      {book && spread && <CoverTools book={book} spread={spread} />}
      {crop.element && (
        <CropBar element={crop.element} onScale={crop.setScale} onDone={crop.leave} />
      )}
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
        data-cropping={crop.element ? '' : undefined}
        data-tool={tool === 'select' ? undefined : tool}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverId(null)}
        onDoubleClick={onDoubleClick}
        onDragOver={photoDrop.onDragOver}
        onDragLeave={photoDrop.onDragLeave}
        onDrop={photoDrop.onDrop}
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
                    renderElement={renderElement}
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
              <DpiBadges book={book} spread={spread} scale={scale} />
              {crop.element && (
                <CropOverlay element={crop.element} asset={crop.asset} scale={scale} />
              )}
              <Selection
                selected={crop.element || editing ? [] : selected}
                hover={crop.element ? undefined : hover}
                target={swap.target ?? photoDrop.hover}
                scale={scale}
                onResize={(handle, e) => transform.startResize(handle, e)}
                onRotate={(e) => transform.startRotate(e)}
              />
              {editing?.type === 'text' && (
                <div
                  className="text-edit-frame"
                  style={{ ...frame(editing, scale), transform: `rotate(${editing.rotation}deg)` }}
                />
              )}
              {editing?.type === 'text' && textEditor && (
                <TextToolbar editor={textEditor} element={editing} scale={scale} />
              )}
              {draw.draft?.kind === 'box' && (
                <div className="canvas-draft" style={frame(draw.draft.rect, scale)} />
              )}
              {lineDraft && (
                <svg className="canvas-draft-line" aria-hidden="true">
                  {['outer', 'inner'].map((layer) => (
                    <line
                      key={layer}
                      className={`canvas-draft-line__${layer}`}
                      x1={lineDraft.a.x * scale}
                      y1={lineDraft.a.y * scale}
                      x2={lineDraft.b.x * scale}
                      y2={lineDraft.b.y * scale}
                    />
                  ))}
                </svg>
              )}
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
