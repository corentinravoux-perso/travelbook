import { describe, expect, it } from 'vitest';
import { POSTER_DESTINATIONS, POSTER_PRESETS, presetsOf } from './presets';

describe('poster presets in the renderer', () => {
  it('load the presets of every destination (a forgotten import shows here)', () => {
    for (const d of POSTER_DESTINATIONS) {
      expect(presetsOf(d.id).length, d.id).toBeGreaterThanOrEqual(3);
    }
    const known = new Set(POSTER_DESTINATIONS.map((d) => d.id));
    expect(POSTER_PRESETS.every((p) => known.has(p.destination))).toBe(true);
  });

  it('list the 13 destinations in the design order, with French labels', () => {
    expect(POSTER_DESTINATIONS).toHaveLength(13);
    expect(POSTER_DESTINATIONS[0]).toEqual({ id: 'chine', label: 'Chine' });
    expect(POSTER_DESTINATIONS.find((d) => d.id === 'antilles')?.label).toBe(
      'Martinique / Guadeloupe',
    );
  });

  it('filter by destination, or give them all', () => {
    expect(presetsOf('all')).toBe(POSTER_PRESETS);
    expect(presetsOf('japon').every((p) => p.destination === 'japon')).toBe(true);
    expect(presetsOf('japon').length).toBeGreaterThanOrEqual(3);
  });
});
