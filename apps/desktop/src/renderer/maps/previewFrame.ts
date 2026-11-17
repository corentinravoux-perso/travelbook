import { fitFrame, unprojectPlace, type MapElement, type MapGeometry } from '@travelbook/core';

type Frame = MapElement['frame'];
type Box = { w: number; h: number };

/** The zoom range of the preview, as a multiple of the default fit. */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 50;

/** The frame that puts the plane point `(cx, cy)` in the middle of `box` at `zoom` times the default fit. */
function frameAt(g: MapGeometry, cx: number, cy: number, zoom: number): NonNullable<Frame> {
  return {
    center: unprojectPlace(g.projection, cx, cy),
    scale: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)),
  };
}

/** Plane coordinates of the middle of the box, and the zoom now relative to the default fit. */
function current(g: MapGeometry, box: Box, frame: Frame, remote: boolean) {
  const fit = fitFrame(g, box, frame, remote);
  const base = fitFrame(g, box, null, remote).scale;
  return {
    fit,
    zoom: fit.scale / base,
    centre: [(box.w / 2 - fit.dx) / fit.scale, (box.h / 2 - fit.dy) / fit.scale] as const,
  };
}

/** The frame after the land was dragged by `(dxMm, dyMm)` in the box. */
export function panFrame(
  g: MapGeometry,
  box: Box,
  frame: Frame,
  remote: boolean,
  dxMm: number,
  dyMm: number,
): NonNullable<Frame> {
  const { fit, zoom, centre } = current(g, box, frame, remote);
  return frameAt(g, centre[0] - dxMm / fit.scale, centre[1] - dyMm / fit.scale, zoom);
}

/** The frame after zooming by `factor` about the point `at` (mm in the box), which stays put. */
export function zoomFrame(
  g: MapGeometry,
  box: Box,
  frame: Frame,
  remote: boolean,
  factor: number,
  at: readonly [number, number],
): NonNullable<Frame> {
  const { fit, zoom } = current(g, box, frame, remote);
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
  const base = fit.scale / zoom;
  const scale = base * next;
  const ux = (at[0] - fit.dx) / fit.scale;
  const uy = (at[1] - fit.dy) / fit.scale;
  return frameAt(
    g,
    (box.w / 2 - at[0] + scale * ux) / scale,
    (box.h / 2 - at[1] + scale * uy) / scale,
    next,
  );
}
