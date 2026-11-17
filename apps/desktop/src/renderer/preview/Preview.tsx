import { MM_TO_PX, pageBox, spreadSize, type Rect } from '@travelbook/core';
import { SpreadView } from '@travelbook/render';
import { useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '../editor/assetUrl';
import { editorStore, useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import {
  clickDirection,
  cutZones,
  pagesLabel,
  previewPages,
  turn,
  type CutZones,
} from './previewModel';
import { useMapGeometryLookup } from '../maps/geometryCache';
import './Preview.css';

/** Room kept round the spread, in px. */
const MARGIN = 32;

const mmText = (mm: number): string => String(Math.round(mm * 10) / 10).replace('.', ',');

/**
 * Over the spread drawn with its bleed: what the cut removes, hatched; the trim line; the folds
 * dashed (spine edges, gutter); the spine band tinted. In mm, from the sheet's top left corner.
 */
function CutOverlay({ zones }: { zones: CutZones }) {
  const { box } = zones;
  const r = (q: Rect): string => `M${q.x} ${q.y}h${q.w}v${q.h}h${-q.w}z`;
  const veil = zones.veils.map((v) => r(v.outer) + r(v.inner)).join('');
  const trim = zones.veils.map((v) => r(v.inner)).join('');
  return (
    <svg
      className="preview__cut"
      aria-hidden="true"
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      preserveAspectRatio="none"
    >
      <defs>
        <pattern
          id="preview-cut-hatch"
          patternUnits="userSpaceOnUse"
          width="1.6"
          height="1.6"
          patternTransform="rotate(45)"
        >
          <rect width="1.6" height="1.6" fill="rgba(24, 28, 32, 0.55)" />
          <rect width="0.5" height="1.6" fill="rgba(255, 255, 255, 0.55)" />
        </pattern>
      </defs>
      {zones.spine && (
        <rect
          className="preview__cut-spine"
          x={zones.spine.x}
          y={zones.spine.y}
          width={zones.spine.w}
          height={zones.spine.h}
        />
      )}
      <path d={veil} fillRule="evenodd" fill="url(#preview-cut-hatch)" />
      <path d={trim} className="preview__cut-trim" vectorEffect="non-scaling-stroke" />
      {zones.folds.map((x) => (
        <line
          key={x}
          className="preview__cut-fold"
          x1={x}
          x2={x}
          y1={box.y}
          y2={box.y + box.h}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

const KEYS: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (i, n) => turn(i, 1, n),
  ArrowLeft: (i, n) => turn(i, -1, n),
  Home: () => 0,
  End: (_i, n) => n - 1,
};

/**
 * The album as it will be seen, over the whole window: the cover, then every spread, drawn by the
 * single renderer without frames for empty photo slots and without guides. "Zones rognées" (on
 * by default) also draws the bleed and hatches what the cut removes, with the folds dashed, so
 * the user sees which part of a photo the print trims off. The arrow keys, and a
 * click on the left or the right half of the stage, turn the pages; Escape (or the close button)
 * returns to the editor. It starts on the spread being edited, and leaves the editor where it was.
 * The editor behind it is inert.
 */
export function Preview() {
  const mapGeometry = useMapGeometryLookup();
  const book = useEditor((s) => s.book);
  const [index, setIndex] = useState(() => {
    const { book: b, currentSpreadId } = editorStore.getState();
    return b === null
      ? 0
      : Math.max(
          0,
          previewPages(b).findIndex((s) => s.id === currentSpreadId),
        );
  });
  const pages = useMemo(() => (book === null ? [] : previewPages(book)), [book]);
  const [showCut, setShowCut] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ w: number; h: number } | null>(null);
  const count = pages.length;
  const at = Math.min(index, Math.max(count - 1, 0));
  const countRef = useRef(count);
  useEffect(() => {
    countRef.current = count;
  }, [count]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        editorStore.getState().setPreview(false);
        return;
      }
      const go = KEYS[e.key];
      if (go === undefined) return;
      e.preventDefault();
      setIndex((i) => go(i, countRef.current));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRoom({ w: r.width, h: r.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const spread = pages[at];
  if (book === null || spread === undefined) return null;
  const size = spreadSize(book, spread);
  // With the cut zones shown, the whole printed sheet is drawn: trim plus bleed.
  const zones = showCut ? cutZones(book, spread) : null;
  const sheet = zones?.box ?? { x: 0, y: 0, w: size.w, h: size.h };
  const k =
    room === null
      ? 0
      : Math.max(
          0,
          Math.min(
            (room.w - 2 * MARGIN) / (sheet.w * MM_TO_PX),
            (room.h - 2 * MARGIN) / (sheet.h * MM_TO_PX),
          ),
        );
  const mm = MM_TO_PX * k;
  const sides = spread.kind === 'cover' ? null : (['left', 'right'] as const);

  return (
    <div
      ref={rootRef}
      className="preview"
      role="dialog"
      aria-modal="true"
      aria-label={fr.preview.title}
      tabIndex={-1}
    >
      <div
        ref={stageRef}
        className="preview__stage"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setIndex(turn(at, clickDirection(e.clientX, r.left + r.width / 2), count));
        }}
      >
        {k > 0 && (
          <div
            className="preview__spread"
            role="img"
            aria-label={fr.preview.stage}
            data-spread-id={spread.id}
            style={{ width: sheet.w * mm, height: sheet.h * mm }}
          >
            {/* Paper under each page that exists (with its bleed when shown); the cover is one sheet. */}
            {(zones
              ? zones.veils.map((v) => v.outer)
              : sides === null
                ? [sheet]
                : sides.flatMap((side) => pageBox(book, spread, side) ?? [])
            ).map((box) => (
              <div
                key={`${box.x}`}
                className="preview__paper"
                style={{
                  left: (box.x - sheet.x) * mm,
                  top: (box.y - sheet.y) * mm,
                  width: box.w * mm,
                  height: box.h * mm,
                }}
              />
            ))}
            <div style={{ transform: `scale(${k})`, transformOrigin: '0 0' }}>
              <SpreadView
                book={book}
                spread={spread}
                quality="preview"
                assetUrl={assetUrl}
                mapGeometry={mapGeometry}
                showEmptySlots={false}
                {...(zones ? { clip: sheet } : {})}
              />
            </div>
            {zones && <CutOverlay zones={zones} />}
          </div>
        )}
      </div>
      <footer className="preview__bar">
        <button
          type="button"
          className="icon-button"
          aria-label={fr.preview.previous}
          title={fr.preview.previous}
          disabled={at === 0}
          onClick={() => setIndex(turn(at, -1, count))}
        >
          <Icon name="chevron-left" />
        </button>
        <output className="preview__position" aria-live="polite">
          {fr.preview.position(pagesLabel(book, spread), at + 1, count)}
        </output>
        <button
          type="button"
          className="icon-button"
          aria-label={fr.preview.next}
          title={fr.preview.next}
          disabled={at === count - 1}
          onClick={() => setIndex(turn(at, 1, count))}
        >
          <Icon name="chevron-right" />
        </button>
        <label className="check preview__cut-toggle" title={fr.preview.cutHelp}>
          <input type="checkbox" checked={showCut} onChange={(e) => setShowCut(e.target.checked)} />
          {fr.preview.cut}
        </label>
        {zones ? (
          <span className="preview__hint">
            {fr.preview.cutLegend(mmText(zones.bleed))}
            {zones.folds.length > 0 && ` · ${fr.preview.foldLegend}`}
            {zones.spine && ` · ${fr.preview.spineLegend(mmText(zones.spine.w))}`}
          </span>
        ) : (
          <span className="preview__hint">{fr.preview.hint}</span>
        )}
        <span className="shell-top__grow" />
        <button
          type="button"
          className="icon-button"
          aria-label={fr.preview.close}
          title={fr.preview.close}
          onClick={() => editorStore.getState().setPreview(false)}
        >
          <Icon name="x" />
        </button>
      </footer>
    </div>
  );
}
