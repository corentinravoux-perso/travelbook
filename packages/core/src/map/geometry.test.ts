import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { bakeGeometry } from './bake';
import type { MapGeometry } from './projection';
import { MapGeometrySchema } from './schema';
import { subjectTopology } from './test-geodata';

const baked = (): MapGeometry =>
  bakeGeometry(
    subjectTopology('TH'),
    null,
    {
      id: 'TH',
      regions: ['TH-81'],
      showRegions: true,
      showNeighbours: true,
      showLakes: true,
      includeRemote: false,
    },
    'auto',
    { seed: 2, roughness: 1 },
    0.8,
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

/** A deep copy of a baked geometry with `edit` applied. */
const broken = (edit: (g: Raw) => void): unknown => {
  const raw = JSON.parse(JSON.stringify(baked())) as Raw;
  edit(raw);
  return raw;
};
const accepts = (value: unknown): boolean => MapGeometrySchema.safeParse(value).success;

describe('MapGeometrySchema', () => {
  it('round-trips a baked geometry through JSON unchanged', () => {
    const g = baked();
    const parsed = MapGeometrySchema.parse(JSON.parse(JSON.stringify(g)));
    expect(parsed).toEqual(g);
  });

  it('accepts a conic with its parallels and a geometry with empty paths', () => {
    const g = baked();
    expect(
      accepts({
        ...g,
        projection: { ...g.projection, kind: 'conicConformal', parallels: [30, 45] },
        paths: { land: '', outline: '', regions: '', selected: '', neighbours: '', lakes: '' },
      }),
    ).toBe(true);
  });

  it('rejects what a stored geometry must not be', () => {
    expect(accepts(broken((g) => (g.version = 2)))).toBe(false);
    expect(accepts(broken((g) => delete g.version))).toBe(false);
    expect(accepts(broken((g) => (g.projection.kind = 'orthographic')))).toBe(false);
    expect(accepts(broken((g) => (g.projection.rotate = [0, 0])))).toBe(false);
    expect(accepts(broken((g) => (g.projection.parallels = [1])))).toBe(false);
    expect(accepts(broken((g) => (g.projection.k = 0)))).toBe(false);
    expect(accepts(broken((g) => (g.projection.k = -3)))).toBe(false);
    expect(accepts(broken((g) => (g.projection.tx = null)))).toBe(false);
    expect(accepts(broken((g) => (g.bounds = [[0, 0]])))).toBe(false);
    expect(accepts(broken((g) => (g.remoteBounds[1][1] = null)))).toBe(false);
    expect(accepts(broken((g) => delete g.paths.lakes))).toBe(false);
    expect(accepts(broken((g) => (g.paths.land = 12)))).toBe(false);
    expect(accepts('geometry')).toBe(false);
    expect(accepts(null)).toBe(false);
  });

  it('rejects a path with a NaN or an Infinity in it', () => {
    expect(accepts(broken((g) => (g.paths.land = 'M0,0L10,NaN')))).toBe(false);
    expect(accepts(broken((g) => (g.paths.outline = 'M0,0L-Infinity,3Z')))).toBe(false);
  });

  it('has the type of MapGeometry', () => {
    expectTypeOf<z.output<typeof MapGeometrySchema>>().toEqualTypeOf<MapGeometry>();
  });
});
