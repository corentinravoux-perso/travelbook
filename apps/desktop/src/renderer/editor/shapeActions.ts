import { addElement, newElement, type Rect, type ShapeElement } from '@travelbook/core';
import { editorStore, type ShapeKind } from '../store/editor';
import { fr } from '../strings/fr';
import { lineBox, MIN_DRAWN_MM, roundRect } from './draw';
import { normalizedRect, type Pt } from './transform';

/** The six kinds the shape tool draws, in panel order. */
export const SHAPE_KINDS: ShapeKind[] = ['rect', 'ellipse', 'line', 'arrow', 'polygon', 'star'];

/** What a new shape looks like: a soft blue-grey fill, or a dark stroke for lines and arrows. */
const NEW_FILL = '#8fa3b5';
const NEW_STROKE = { width: 1, color: '#222222' };
/** Sides of a new polygon (a hexagon) and branches of a star. */
const NEW_POLYGON_POINTS = 6;
const NEW_STAR_POINTS = 5;
/**
 * A line or arrow is a box as long as the segment: a line is `LINE_THICKNESS` mm high so that it
 * can be picked, an arrow `ARROW_HEAD` mm, which is the size of its head.
 */
export const LINE_THICKNESS = 3;
export const ARROW_HEAD = 6;
/** Size of a shape made by a click, in mm. */
const DEFAULT_SIZE = 40;

export const isSegment = (kind: ShapeKind): boolean => kind === 'line' || kind === 'arrow';

/** A new shape of `kind` in `rect`, with the look of its kind. */
export function shapeElement(kind: ShapeKind, rect: Rect, rotation = 0): ShapeElement {
  const el = newElement('shape', rect);
  el.shape = kind;
  el.rotation = rotation;
  if (isSegment(kind)) {
    el.fill = null;
    el.stroke = { ...NEW_STROKE };
  } else {
    el.fill = NEW_FILL;
    el.stroke = null;
  }
  if (kind === 'polygon') el.points = NEW_POLYGON_POINTS;
  if (kind === 'star') el.points = NEW_STAR_POINTS;
  return el;
}

/**
 * The shape the user drew with the tool: a box from the two corners, a segment from the two ends.
 * A click without a drag makes a shape of default size at that point.
 */
export function drawnShape(kind: ShapeKind, from: Pt, to: Pt, dragged: boolean): ShapeElement {
  if (isSegment(kind)) {
    const thickness = kind === 'arrow' ? ARROW_HEAD : LINE_THICKNESS;
    const end =
      dragged && Math.hypot(to.x - from.x, to.y - from.y) >= MIN_DRAWN_MM
        ? to
        : { x: from.x + DEFAULT_SIZE, y: from.y };
    const { rect, rotation } = lineBox(from, end, thickness);
    return shapeElement(kind, rect, rotation);
  }
  const box = normalizedRect(from, to);
  const drawn = dragged && box.w >= MIN_DRAWN_MM && box.h >= MIN_DRAWN_MM;
  return shapeElement(
    kind,
    roundRect(drawn ? box : { x: from.x, y: from.y, w: DEFAULT_SIZE, h: DEFAULT_SIZE }),
  );
}

/** Put the drawn shape on the current spread, select it, and go back to the selection tool. */
export function addDrawnShape(kind: ShapeKind, from: Pt, to: Pt, dragged: boolean): void {
  const state = editorStore.getState();
  if (state.currentSpreadId === null) return;
  const spreadId = state.currentSpreadId;
  const el = drawnShape(kind, from, to, dragged);
  state.apply((b) => addElement(b, spreadId, el), fr.shapes.undoCreate);
  state.select([el.id]);
  state.setTool('select');
}
