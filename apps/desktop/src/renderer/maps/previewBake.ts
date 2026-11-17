import type { MapGeometry } from '@travelbook/core';
import type { MapSpec } from './dialogModel';

/**
 * What the baked geometry depends on, as a string: the subject, its regions and layers, the
 * projection, the rough seed and the outline detail, and whether the fine pack and the world land
 * went into the bake. Colours, widths, places, route, background and the frame are not in it: they
 * change the drawing, not the geometry.
 */
export function geometryKey(spec: MapSpec, usedPack: boolean, usedWorld: boolean): string {
  const s = spec.subject;
  return JSON.stringify([
    s.id,
    [...s.regions].sort(),
    s.showRegions,
    s.showNeighbours,
    s.showLakes,
    s.includeRemote,
    spec.projection,
    spec.style.rough,
    spec.style.outline.detail,
    usedPack,
    usedWorld,
  ]);
}

let last: { key: string; geometry: MapGeometry } | null = null;

/** Keep the geometry the preview just baked, for `applyMap` to reuse. */
export function rememberBake(key: string, geometry: MapGeometry): void {
  last = { key, geometry };
}

/** The remembered geometry when it was baked from the same inputs; `null` otherwise. */
export function rememberedBake(key: string): MapGeometry | null {
  return last && last.key === key ? last.geometry : null;
}

export function forgetBake(): void {
  last = null;
}
