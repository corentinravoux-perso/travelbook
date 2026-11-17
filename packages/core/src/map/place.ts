import type { MapPlace, MapPlaceKind } from './types';

/** What a place is drawn and listed as: its own `kind`, else the kind of its source. */
export function placeKind(p: Pick<MapPlace, 'kind' | 'source'>): MapPlaceKind {
  if (p.kind) return p.kind;
  return p.source.kind === 'custom' ? 'custom' : p.source.kind === 'sight' ? 'sight' : 'city';
}
