import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Topology } from './bake';
import { regionContains } from './regions';

const italy = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../../../../apps/desktop/resources/maps/subjects/IT.topo.json'),
    'utf8',
  ),
) as Topology;

describe('regionContains', () => {
  it('Sicily holds Palermo, Catania and Messina, not Reggio di Calabria, Rome or the sea', () => {
    const inSicily = regionContains(italy, 'IT-82')!;
    expect(inSicily(13.348, 38.127)).toBe(true);
    expect(inSicily(15.08, 37.5)).toBe(true);
    expect(inSicily(15.55, 38.2)).toBe(true);
    expect(inSicily(15.641, 38.115)).toBe(false);
    expect(inSicily(12.48, 41.9)).toBe(false);
    expect(inSicily(13.5, 36.0)).toBe(false);
  });

  it('is null for a region the topology does not have, and for a topology without regions', () => {
    expect(regionContains(italy, 'IT-00')).toBeNull();
    expect(regionContains({ ...italy, objects: {} }, 'IT-82')).toBeNull();
  });
});
