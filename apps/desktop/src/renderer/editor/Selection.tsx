import type { Element, ResizeHandle } from '@travelbook/core';
import { boundingBox } from '@travelbook/core';
import type { CSSProperties, PointerEvent } from 'react';
import { fr } from '../strings/fr';
import { unionBox } from './transform';

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
/** Direction of each handle from the centre, degrees clockwise from up. */
const DIRECTION: Record<ResizeHandle, number> = {
  n: 0,
  ne: 45,
  e: 90,
  se: 135,
  s: 180,
  sw: 225,
  w: 270,
  nw: 315,
};
const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'];

/** The resize cursor along a handle's direction once the frame is turned by `rotation`. */
function cursorFor(handle: ResizeHandle, rotation: number): string {
  const angle = (((DIRECTION[handle] + rotation) % 180) + 180) % 180;
  return CURSORS[Math.round(angle / 45) % 4]!;
}

interface Props {
  /** The selected elements of the spread. */
  selected: Element[];
  /** The element under the pointer, drawn lightly. */
  hover: Element | undefined;
  /** The frame a drag is about to drop onto (a photo from the tray, a swap), outlined. */
  target?: Element | null;
  /** Px per mm. */
  scale: number;
  onResize(handle: ResizeHandle, e: PointerEvent): void;
  onRotate(e: PointerEvent): void;
}

/** The box of a rect of the page (mm) over the page drawn at `s` px per mm. */
export const frame = (
  r: { x: number; y: number; w: number; h: number },
  s: number,
): CSSProperties => ({
  left: r.x * s,
  top: r.y * s,
  width: r.w * s,
  height: r.h * s,
});

/**
 * Selection overlay, drawn over the page in screen px so that outlines and handles keep their
 * size at any zoom: a double outline on each selected element, and for the whole selection a box
 * with 8 handles and a rotation handle. A locked element is outlined and has no handles.
 */
export function Selection({ selected, hover, target, scale, onResize, onRotate }: Props) {
  if (selected.length === 0 && !hover && !target) return null;
  const editable = selected.length > 0 && selected.every((el) => !el.locked);
  const single = selected.length === 1 ? selected[0]! : null;
  // One element is handled in its own, possibly turned, frame; several in the box around them.
  const box = single ?? (selected.length > 1 ? unionBox(selected.map(boundingBox)) : null);
  const rotation = single?.rotation ?? 0;

  return (
    <div className="sel-layer" aria-hidden="true">
      {hover && !selected.includes(hover) && (
        <div
          className="sel-hover"
          style={{ ...frame(hover, scale), transform: `rotate(${hover.rotation}deg)` }}
        />
      )}
      {target && (
        <div
          className="sel-target"
          data-testid="drop-target"
          style={{ ...frame(target, scale), transform: `rotate(${target.rotation}deg)` }}
        />
      )}
      {selected.map((el) => (
        <div
          key={el.id}
          className="sel-outline"
          style={{ ...frame(el, scale), transform: `rotate(${el.rotation}deg)` }}
        />
      ))}
      {box && editable && (
        <div
          className="sel-box"
          data-testid="selection-box"
          style={{ ...frame(box, scale), transform: `rotate(${rotation}deg)` }}
        >
          {HANDLES.map((handle) => (
            <div
              key={handle}
              className={`sel-handle sel-handle--${handle}`}
              data-handle={handle}
              style={{ cursor: cursorFor(handle, rotation) }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                e.preventDefault();
                onResize(handle, e);
              }}
            />
          ))}
          <div
            className="sel-rotate"
            data-handle="rotate"
            title={fr.canvas.rotateHandle}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              e.preventDefault();
              onRotate(e);
            }}
          />
        </div>
      )}
    </div>
  );
}
