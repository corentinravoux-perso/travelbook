import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { clampWidth, PANEL_BOUNDS, type PanelSide } from './layout';

const KEY_STEP = 8;
const KEY_STEP_LARGE = 32;

interface Props {
  side: PanelSide;
  width: number;
  label: string;
  /** Id of the column it resizes. */
  controls: string;
  onResize(width: number): void;
}

/**
 * The window-splitter on a column's inner edge: drag it, or focus it and use the arrow keys
 * (Shift for larger steps, Home and End for the bounds). The panel grows to the right, the
 * inspector to the left.
 */
export function ResizeHandle({ side, width, label, controls, onResize }: Props) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const grow = side === 'panel' ? 1 : -1;
  const { min, max } = PANEL_BOUNDS[side];

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start) onResize(clampWidth(side, start.width + grow * (e.clientX - start.x)));
  };
  const onPointerEnd = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const next = {
      ArrowRight: width + grow * step,
      ArrowLeft: width - grow * step,
      Home: min,
      End: max,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onResize(clampWidth(side, next));
  };

  return (
    <div
      className={`resize-handle resize-handle--${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
    />
  );
}
