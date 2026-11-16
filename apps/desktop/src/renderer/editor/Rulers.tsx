import {
  addGuide,
  boundingBox,
  moveGuide,
  pageBox,
  removeGuide,
  spreadSize,
  type Book,
  type Element,
  type GuideAxis,
  type Spread,
} from '@travelbook/core';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { createStore, useStore } from 'zustand';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';
import { guidePosition, rulerLabel, rulerSteps, rulerTicks } from './rulerModel';

/** A guide being pulled out of a ruler: drawn on the page until the pointer is released. */
interface Draft {
  axis: GuideAxis;
  at: number;
}
const draftStore = createStore<{ draft: Draft | null }>(() => ({ draft: null }));

/** Pointer position in client px over the canvas (or `null`): what the rulers mark. */
const pointerStore = createStore<{ at: { x: number; y: number } | null }>(() => ({ at: null }));

/** Past the spread, a guide line runs this far into the margin of the stage, in px. */
const OVERHANG = 24;

const mmText = (mm: number): string =>
  (Math.round(mm * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

interface Colors {
  ground: string;
  page: string;
  margin: string;
  line: string;
  tick: string;
  text: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
}

function readColors(): Colors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    ground: v('--sunken'),
    page: v('--chrome'),
    margin: `color-mix(in srgb, ${v('--sunken')} 55%, ${v('--chrome')})`,
    line: v('--line'),
    tick: v('--ink-3'),
    text: v('--ink-2'),
    accent: v('--accent'),
    accentSoft: v('--accent-soft'),
    onAccent: v('--on-accent'),
  };
}

/** The extent of the selected elements along one axis, rotated ones by their box. */
function extent(selected: Element[], horizontal: boolean): [number, number] | null {
  if (selected.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const el of selected) {
    const box = el.rotation % 180 === 0 ? el : boundingBox(el);
    const a = horizontal ? box.x : box.y;
    const size = horizontal ? box.w : box.h;
    lo = Math.min(lo, a);
    hi = Math.max(hi, a + size);
  }
  return [lo, hi];
}

interface DrawInput {
  canvas: HTMLCanvasElement;
  horizontal: boolean;
  page: DOMRect;
  scale: number;
  book: Book;
  spread: Spread;
  selected: Element[];
  pointer: { x: number; y: number } | null;
  draft: Draft | null;
  colors: Colors;
}

/**
 * One ruler: the pages in white with their safe margins tinted (as Word shows its margins), the
 * selection as a lagoon band, millimetre ticks and numbers, the ruler guides as small marks, and
 * the pointer as a lagoon line with its position.
 */
function drawRuler(d: DrawInput): void {
  const { canvas, horizontal, page, scale, book, spread, colors } = d;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const box = canvas.getBoundingClientRect();
  const origin = horizontal ? page.left - box.left : page.top - box.top;
  const length = horizontal ? w : h;
  const thick = horizontal ? h : w;
  const px = (mm: number) => origin + mm * scale;
  /** A band across the ruler from `a` to `b` px along it. */
  const band = (a: number, b: number, inset = 0) => {
    if (horizontal) ctx.fillRect(a, inset, b - a, thick - 2 * inset);
    else ctx.fillRect(inset, a, thick - 2 * inset, b - a);
  };
  const across = (at: number, from: number, to: number) => {
    const p = Math.round(at) + 0.5;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(p, from);
      ctx.lineTo(p, to);
    } else {
      ctx.moveTo(from, p);
      ctx.lineTo(to, p);
    }
    ctx.stroke();
  };

  ctx.fillStyle = colors.ground;
  ctx.fillRect(0, 0, w, h);

  // The pages, and their safe margins.
  const m = book.safeMargin;
  for (const side of ['left', 'right'] as const) {
    const b = pageBox(book, spread, side);
    if (!b) continue;
    const [a, z] = horizontal ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
    ctx.fillStyle = colors.margin;
    band(px(a), px(z), 3);
    ctx.fillStyle = colors.page;
    band(px(a + m), px(z - m), 3);
  }

  // The selection.
  const sel = extent(d.selected, horizontal);
  if (sel) {
    ctx.fillStyle = colors.accentSoft;
    band(px(sel[0]), px(sel[1]));
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1;
    across(px(sel[0]), 0, thick);
    across(px(sel[1]), 0, thick);
  }

  // Ticks and numbers, on the edge that faces the page.
  const steps = rulerSteps(scale);
  ctx.strokeStyle = colors.tick;
  ctx.lineWidth = 1;
  ctx.fillStyle = colors.text;
  ctx.font = `600 9.5px ${getComputedStyle(canvas).fontFamily}`;
  ctx.textBaseline = 'top';
  for (const t of rulerTicks(origin, scale, length, steps)) {
    const len = t.kind === 'label' ? 9 : t.kind === 'half' ? 6 : 3.5;
    across(t.px, thick - len, thick);
    if (t.kind !== 'label') continue;
    const text = rulerLabel(t.mm);
    if (horizontal) {
      ctx.textAlign = 'left';
      ctx.fillText(text, Math.round(t.px) + 3, 3);
    } else {
      ctx.save();
      ctx.translate(3, Math.round(t.px) + 3);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'right';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }

  // The edge that meets the canvas.
  ctx.strokeStyle = colors.line;
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(0, h - 0.5);
    ctx.lineTo(w, h - 0.5);
  } else {
    ctx.moveTo(w - 0.5, 0);
    ctx.lineTo(w - 0.5, h);
  }
  ctx.stroke();

  // Ruler guides: a small lagoon wedge pointing at the page.
  const guides = horizontal ? spread.guides?.x : spread.guides?.y;
  ctx.fillStyle = colors.accent;
  for (const g of guides ?? []) {
    const p = px(g);
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(p - 4, thick - 6);
      ctx.lineTo(p + 4, thick - 6);
      ctx.lineTo(p, thick);
    } else {
      ctx.moveTo(thick - 6, p - 4);
      ctx.lineTo(thick - 6, p + 4);
      ctx.lineTo(thick, p);
    }
    ctx.fill();
  }

  // The pointer, or the guide being pulled out of the other ruler: a line and its position.
  let mark: number | null = null;
  if (d.draft && (d.draft.axis === 'x') === horizontal) mark = d.draft.at;
  else if (d.pointer) {
    mark = ((horizontal ? d.pointer.x - page.left : d.pointer.y - page.top) / scale) as number;
  }
  if (mark === null) return;
  const p = px(mark);
  if (p < 0 || p > length) return;
  ctx.strokeStyle = colors.accent;
  across(p, 0, thick);
  const text = `${mmText(mark)} mm`;
  ctx.font = `700 10px ${getComputedStyle(canvas).fontFamily}`;
  const tw = ctx.measureText(text).width + 10;
  const th = 15;
  // The tag sits after the line, or before it when the ruler ends.
  const start = p + 4 + tw > length ? p - 4 - tw : p + 4;
  ctx.fillStyle = colors.accent;
  ctx.save();
  if (horizontal) ctx.translate(start, (thick - th) / 2);
  else {
    ctx.translate((thick - th) / 2, start + tw);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.beginPath();
  ctx.roundRect(0, 0, tw, th, th / 2);
  ctx.fill();
  ctx.fillStyle = colors.onAccent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, tw / 2, th / 2 + 0.5);
  ctx.restore();
}

interface RulersProps {
  /** The scrolling workspace: the rulers follow its scroll and mark the pointer over it. */
  hostRef: RefObject<HTMLElement | null>;
  /** The spread on screen: its top left corner is 0 mm on both rulers. */
  pageRef: RefObject<HTMLElement | null>;
  scale: number;
  book: Book;
  spread: Spread;
  selected: Element[];
}

/**
 * Rulers in millimetres along the top and the left of the canvas, in the coordinates of the
 * inspector's X and Y (0 at the top left corner of the spread). They mark the pointer, the
 * extent of the selection and the ruler guides; a drag from a ruler onto the page lays a guide
 * (from the top ruler a horizontal one, from the left ruler a vertical one).
 */
export function Rulers({ hostRef, pageRef, scale, book, spread, selected }: RulersProps) {
  const top = useRef<HTMLCanvasElement>(null);
  const left = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);
  const latest = useRef({ scale, book, spread, selected });

  const draw = useCallback(() => {
    const page = pageRef.current?.getBoundingClientRect();
    if (!page) return;
    const { scale: s, book: b, spread: sp, selected: sel } = latest.current;
    const colors = readColors();
    const pointer = pointerStore.getState().at;
    const draft = draftStore.getState().draft;
    for (const [canvas, horizontal] of [
      [top.current, true],
      [left.current, false],
    ] as const) {
      if (canvas) {
        drawRuler({
          canvas,
          horizontal,
          page,
          scale: s,
          book: b,
          spread: sp,
          selected: sel,
          pointer,
          draft,
          colors,
        });
      }
    }
  }, [pageRef]);

  const schedule = useCallback(() => {
    if (frame.current !== 0) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      draw();
    });
  }, [draw]);

  // Every render may have moved something (zoom, selection, book): draw again.
  useLayoutEffect(() => {
    latest.current = { scale, book, spread, selected };
    schedule();
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const move = (e: PointerEvent) => pointerStore.setState({ at: { x: e.clientX, y: e.clientY } });
    const leave = () => pointerStore.setState({ at: null });
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerleave', leave);
    host.addEventListener('scroll', schedule, { passive: true });
    const unPointer = pointerStore.subscribe(schedule);
    const unDraft = draftStore.subscribe(schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(host);
    if (top.current) resize.observe(top.current);
    if (left.current) resize.observe(left.current);
    // The theme changes the colours, which are read when drawing.
    const theme = new MutationObserver(schedule);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
      host.removeEventListener('scroll', schedule);
      unPointer();
      unDraft();
      resize.disconnect();
      theme.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [hostRef, schedule]);

  /** Pull a guide out of a ruler: `axis` is the guide's (the top ruler lays `y` guides). */
  const pull = (axis: GuideAxis) => (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const spreadId = spread.id;
    const at = (ev: PointerEvent): number | null => {
      const host = hostRef.current?.getBoundingClientRect();
      const page = pageRef.current?.getBoundingClientRect();
      if (!host || !page) return null;
      // Still over the ruler: nothing would be laid.
      if (axis === 'y' ? ev.clientY < host.top : ev.clientX < host.left) return null;
      const s = latest.current.scale;
      return guidePosition(
        axis === 'y' ? (ev.clientY - page.top) / s : (ev.clientX - page.left) / s,
      );
    };
    const move = (ev: PointerEvent) => {
      pointerStore.setState({ at: { x: ev.clientX, y: ev.clientY } });
      const pos = at(ev);
      draftStore.setState({ draft: pos === null ? null : { axis, at: pos } });
    };
    const end = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      const pos = ev.type === 'pointerup' ? at(ev) : null;
      draftStore.setState({ draft: null });
      pointerStore.setState({ at: null });
      if (pos !== null) {
        editorStore.getState().apply((b) => addGuide(b, spreadId, axis, pos), fr.rulers.undoAdd);
      }
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  return (
    <>
      <div className="ruler-corner" title={fr.rulers.unit}>
        mm
      </div>
      <canvas
        ref={top}
        className="ruler ruler--top"
        data-ruler="top"
        title={fr.rulers.topHint}
        onPointerDown={pull('y')}
      />
      <canvas
        ref={left}
        className="ruler ruler--left"
        data-ruler="left"
        title={fr.rulers.leftHint}
        onPointerDown={pull('x')}
      />
    </>
  );
}

interface GuidesProps {
  book: Book;
  spread: Spread;
  scale: number;
  /** The scrolling workspace: a guide dropped outside it (on a ruler) is removed. */
  hostRef: RefObject<HTMLElement | null>;
}

/**
 * The ruler guides of the spread, on the page: thin lagoon lines that elements snap to. A guide
 * is dragged to move it, and dragged back onto its ruler, or double-clicked, to remove it. The
 * guide being pulled out of a ruler is drawn here too. Never printed: the page itself is drawn
 * by `SpreadView`, which knows nothing of them.
 */
export function RulerGuides({ book, spread, scale, hostRef }: GuidesProps) {
  const layer = useRef<HTMLDivElement>(null);
  const draft = useStore(draftStore, (s) => s.draft);
  /** The guide being moved, and where it is now (`null`: off the page, about to go). */
  const [moving, setMoving] = useState<{
    axis: GuideAxis;
    index: number;
    at: number | null;
  } | null>(null);
  const size = spreadSize(book, spread);

  const grab =
    (axis: GuideAxis, index: number, from: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // The canvas below must not start a selection or a marquee.
      e.stopPropagation();
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const spreadId = spread.id;
      const at = (ev: PointerEvent): number | null => {
        const host = hostRef.current?.getBoundingClientRect();
        const origin = layer.current?.getBoundingClientRect();
        if (!host || !origin) return null;
        if (axis === 'y' ? ev.clientY < host.top : ev.clientX < host.left) return null;
        return guidePosition(
          axis === 'y' ? (ev.clientY - origin.top) / scale : (ev.clientX - origin.left) / scale,
        );
      };
      let last: number | null = from;
      const move = (ev: PointerEvent) => {
        last = at(ev);
        pointerStore.setState({ at: { x: ev.clientX, y: ev.clientY } });
        setMoving({ axis, index, at: last });
      };
      const end = (ev: PointerEvent) => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', end);
        target.removeEventListener('pointercancel', end);
        setMoving(null);
        if (ev.type !== 'pointerup') return;
        const { apply } = editorStore.getState();
        if (last === null) {
          apply((b) => removeGuide(b, spreadId, axis, index), fr.rulers.undoRemove);
        } else if (last !== from) {
          const to = last;
          apply((b) => moveGuide(b, spreadId, axis, index, to), fr.rulers.undoMove);
        }
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', end);
      target.addEventListener('pointercancel', end);
    };

  const remove = (axis: GuideAxis, index: number) => {
    const spreadId = spread.id;
    editorStore
      .getState()
      .apply((b) => removeGuide(b, spreadId, axis, index), fr.rulers.undoRemove);
  };

  const line = (axis: GuideAxis, at: number) =>
    axis === 'x'
      ? { left: at * scale, top: -OVERHANG, height: size.h * scale + 2 * OVERHANG }
      : { top: at * scale, left: -OVERHANG, width: size.w * scale + 2 * OVERHANG };

  const guides = (['x', 'y'] as const).flatMap((axis) =>
    (spread.guides?.[axis] ?? []).map((at, index) => ({ axis, at, index })),
  );

  return (
    <div className="ruler-guides" ref={layer} aria-hidden="true">
      {guides.map(({ axis, at, index }) => {
        const now = moving?.axis === axis && moving.index === index ? moving : null;
        const pos = now ? (now.at ?? at) : at;
        return (
          <div
            key={`${axis}${index}`}
            className={`ruler-guide ruler-guide--${axis}`}
            data-guide={`${axis}:${at}`}
            data-leaving={now !== null && now.at === null ? '' : undefined}
            style={line(axis, pos)}
            title={fr.rulers.guide(axis, mmText(pos))}
            onPointerDown={grab(axis, index, at)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              remove(axis, index);
            }}
          />
        );
      })}
      {draft && (
        <div
          className={`ruler-guide ruler-guide--${draft.axis} ruler-guide--draft`}
          style={line(draft.axis, draft.at)}
        />
      )}
    </div>
  );
}
