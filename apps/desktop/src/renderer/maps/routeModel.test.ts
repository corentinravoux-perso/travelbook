import type { MapLeg, MapRoute } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LEG, addStop, moveStop, removeStop, repairRoute, setLeg } from './routeModel';

const leg = (mode: MapLeg['mode']): MapLeg => ({ ...DEFAULT_LEG, mode });
const route = (stops: string[], modes: MapLeg['mode'][]): MapRoute => ({
  stops,
  legs: modes.map(leg),
  numbered: true,
});
const modes = (r: MapRoute | null) => r?.legs.map((l) => l.mode);

describe('repairRoute', () => {
  it('pads and trims legs to stops - 1, keeping the ones that exist', () => {
    expect(modes(repairRoute(route(['a', 'b', 'c'], ['avion'])))).toEqual(['avion', 'voiture']);
    expect(modes(repairRoute(route(['a', 'b'], ['bus', 'train', 'pied'])))).toEqual(['bus']);
    expect(repairRoute(route(['a'], ['bus'])).legs).toEqual([]);
  });
  it('does not mutate its input', () => {
    const r = route(['a', 'b', 'c'], ['avion']);
    repairRoute(r);
    expect(r.legs).toHaveLength(1);
  });
});

describe('addStop', () => {
  it('creates the route with the first stop, numbered', () => {
    expect(addStop(null, 'a')).toEqual({ stops: ['a'], legs: [], numbered: true });
  });
  it('appends a stop and a default leg; a place may repeat', () => {
    const r = addStop(addStop(addStop(null, 'a'), 'b'), 'a');
    expect(r.stops).toEqual(['a', 'b', 'a']);
    expect(r.legs).toEqual([DEFAULT_LEG, DEFAULT_LEG]);
  });
  it('repairs an inconsistent route first', () => {
    const r = addStop(route(['a', 'b', 'c'], ['avion']), 'd');
    expect(r.legs).toHaveLength(3);
    expect(r.legs[0]!.mode).toBe('avion');
  });
});

describe('removeStop: a leg stays attached to its from stop', () => {
  const base = () => route(['a', 'b', 'c', 'd'], ['avion', 'bus', 'train']);
  it('middle: the leg into the previous stop is kept, the removed stop leg goes', () => {
    const r = removeStop(base(), 1)!;
    expect(r.stops).toEqual(['a', 'c', 'd']);
    expect(modes(r)).toEqual(['avion', 'train']);
  });
  it('first: its leg goes', () => {
    expect(modes(removeStop(base(), 0))).toEqual(['bus', 'train']);
  });
  it('last: the leg that arrived goes', () => {
    expect(modes(removeStop(base(), 3))).toEqual(['avion', 'bus']);
  });
  it('removing the only stop gives null; out of range changes nothing', () => {
    expect(removeStop(route(['a'], []), 0)).toBeNull();
    expect(removeStop(base(), 9)).toEqual(base());
  });
  it('removes one occurrence of a repeated place', () => {
    const r = removeStop(route(['a', 'b', 'a'], ['bus', 'train']), 2)!;
    expect(r.stops).toEqual(['a', 'b']);
    expect(modes(r)).toEqual(['bus']);
  });
});

describe('moveStop: legs travel with their from stop', () => {
  const base = () => route(['a', 'b', 'c'], ['avion', 'bus']);
  it('moving down', () => {
    const r = moveStop(base(), 0, 1);
    expect(r.stops).toEqual(['b', 'a', 'c']);
    // b had bus, a had avion; c is last and has none
    expect(modes(r)).toEqual(['bus', 'avion']);
  });
  it('moving the last stop up gives it a default leg and drops the new last leg', () => {
    const r = moveStop(base(), 2, 1);
    expect(r.stops).toEqual(['a', 'c', 'b']);
    expect(modes(r)).toEqual(['avion', 'voiture']);
  });
  it('same index, or out of range, changes nothing', () => {
    expect(moveStop(base(), 1, 1)).toEqual(base());
    expect(moveStop(base(), 1, 5)).toEqual(base());
  });
});

describe('setLeg', () => {
  it('patches one leg of a repaired route', () => {
    const r = setLeg(route(['a', 'b', 'c'], ['avion']), 1, { mode: 'bateau', icon: true });
    expect(r.legs[0]!.mode).toBe('avion');
    expect(r.legs[1]).toMatchObject({ mode: 'bateau', icon: true, curve: 'droit' });
  });
});
