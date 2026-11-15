import type { Background } from '@travelbook/core';

/** Width of a pattern tile at scale 1. */
export const PATTERN_TILE_MM = 20;

/** Width of the tile of a pattern background, in mm. */
export const patternTileMm = (bg: Extract<Background, { kind: 'pattern' }>): number =>
  PATTERN_TILE_MM * bg.scale;
