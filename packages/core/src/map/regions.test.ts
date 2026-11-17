import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Topology } from './bake';
import { regionAssigner, NEAREST_REGION_KM } from './regions';

const subject = (id: string) =>
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, `../../../../apps/desktop/resources/maps/subjects/${id}.topo.json`),
      'utf8',
    ),
  ) as Topology;
const italy = subject('IT');

describe('regionAssigner', () => {
  const assign = regionAssigner(italy)!;

  it('a place inside a region belongs to it: Palermo, Catania, Messina in Sicily; Rome in Latium', () => {
    expect(assign.regionOf(13.348, 38.127)).toBe('IT-82');
    expect(assign.regionOf(15.08, 37.5)).toBe('IT-82');
    expect(assign.regionOf(15.55, 38.2)).toBe('IT-82');
    expect(assign.regionOf(12.48, 41.9)).toBe('IT-62');
  });

  it('a coastal place just outside the simplified polygon goes to the nearest region', () => {
    expect(assign.regionOf(10.30228, 43.55113)).toBe('IT-52'); // Livorno, Tuscany
    expect(assign.regionOf(9.51507, 40.91429)).toBe('IT-88'); // Olbia, Sardinia
  });

  it('Reggio di Calabria is Calabria, not Sicily', () => {
    expect(assign.regionOf(15.64136, 38.115)).toBe('IT-78');
  });

  it('a point in the sea farther than the tolerance belongs to none', () => {
    expect(NEAREST_REGION_KM).toBe(10);
    expect(assign.regionOf(14.0, 36.3)).toBeNull();
    expect(assign.regionOf(Number.NaN, 40)).toBeNull();
  });

  it('knows which regions have a geometry', () => {
    expect(assign.has('IT-82')).toBe(true);
    expect(assign.has('IT-00')).toBe(false);
  });

  it('an island place belongs to its region: Mykonos is in the Southern Aegean', () => {
    expect(regionAssigner(subject('GR'))!.regionOf(25.32862, 37.44596)).toBe('GR-L');
  });

  it('is null for a topology without region geometry', () => {
    expect(regionAssigner({ ...italy, objects: {} })).toBeNull();
  });
});
