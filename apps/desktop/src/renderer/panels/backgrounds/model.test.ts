import { newBook, type AssetRef, type Book } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import type { BundledBackground } from '../../../shared/api';
import { fr } from '../../strings/fr';
import {
  DEFAULT_GRADIENT,
  GRADIENT_PRESETS,
  MAX_STOPS,
  RECENT_MAX,
  addStop,
  availableTargets,
  bundledOf,
  imageOrigin,
  isHex,
  loadRecent,
  mixHex,
  moveStop,
  plainImage,
  pushRecent,
  removeStop,
  resolveTarget,
  saveRecent,
  spreadPhotoIds,
  targetLabel,
} from './model';

const book = (): Book => newBook({ title: 'T' });

describe('targets', () => {
  it('offers both pages and the spread on an inner spread, one page on the first and last', () => {
    const b = book();
    const inner = b.spreads[1]!;
    expect(availableTargets(b, inner)).toEqual(['left', 'right', 'spread']);
    expect(availableTargets(b, b.spreads[0]!)).toEqual(['right', 'spread']);
    expect(availableTargets(b, b.spreads[b.spreads.length - 1]!)).toEqual(['left', 'spread']);
  });

  it('keeps the chosen target while it exists, then follows the active page', () => {
    expect(resolveTarget('spread', ['left', 'right', 'spread'], 'left')).toBe('spread');
    expect(resolveTarget(null, ['left', 'right', 'spread'], 'right')).toBe('right');
    expect(resolveTarget('left', ['right', 'spread'], 'left')).toBe('right');
    expect(resolveTarget(null, ['spread'], 'left')).toBe('spread');
  });

  it('names the pages of the cover as back and front', () => {
    const b = book();
    expect(targetLabel(b.cover, 'left', 2)).toBe(fr.backgrounds.back);
    expect(targetLabel(b.cover, 'right', 2)).toBe(fr.backgrounds.front);
    expect(targetLabel(b.spreads[1]!, 'left', 2)).toBe(fr.backgrounds.left);
    expect(targetLabel(b.spreads[0]!, 'right', 1)).toBe(fr.backgrounds.onePage);
    expect(targetLabel(b.spreads[1]!, 'spread', 2)).toBe(fr.backgrounds.spread);
  });
});

describe('colours', () => {
  it('mixes hex colours and ignores anything else', () => {
    expect(mixHex('#000000', '#ffffff')).toBe('#808080');
    expect(mixHex('#102030', 'red')).toBe('#102030');
    expect(isHex('#a1B2c3')).toBe(true);
    expect(isHex('#abc')).toBe(false);
  });

  it('keeps the latest colours first, once each, and no more than the cap', () => {
    expect(pushRecent(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111']);
    expect(pushRecent(['#111111'], 'url(x)')).toEqual(['#111111']);
    let list: string[] = [];
    for (let i = 0; i < 30; i++) list = pushRecent(list, `#${String(i).padStart(6, '0')}`);
    expect(list).toHaveLength(RECENT_MAX);
    expect(list[0]).toBe('#000029');
  });

  it('reads and writes the recent colours, forgetting what is not a colour', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    expect(loadRecent(storage)).toEqual([]);
    saveRecent(storage, ['#112233']);
    expect(loadRecent(storage)).toEqual(['#112233']);
    data.set('travelbook.recentColours', '["#112233","javascript:1",4]');
    expect(loadRecent(storage)).toEqual(['#112233']);
    data.set('travelbook.recentColours', 'not json');
    expect(loadRecent(storage)).toEqual([]);
  });

  it('lists each photo of a spread once', () => {
    const b = book();
    const spread = {
      ...b.spreads[1]!,
      elements: ['a', 'b', 'a', null].map(
        (assetId, i) => ({ id: `e${i}`, type: 'photo', assetId }) as never,
      ),
    };
    expect(spreadPhotoIds(spread)).toEqual(['a', 'b']);
  });
});

describe('gradient presets', () => {
  it('number at least 24, each with a name, valid stops and a distinct look', () => {
    expect(GRADIENT_PRESETS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(GRADIENT_PRESETS.map((p) => p.id)).size).toBe(GRADIENT_PRESETS.length);
    expect(new Set(GRADIENT_PRESETS.map((p) => JSON.stringify(p.gradient))).size).toBe(
      GRADIENT_PRESETS.length,
    );
    for (const { id, gradient } of GRADIENT_PRESETS) {
      expect(fr.backgrounds.gradientNames[id], id).toBeTruthy();
      expect(gradient.stops.length).toBeGreaterThanOrEqual(2);
      expect(gradient.stops.length).toBeLessThanOrEqual(MAX_STOPS);
      expect(gradient.stops.every((s) => isHex(s.color))).toBe(true);
      const offsets = gradient.stops.map((s) => s.offset);
      expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
      expect(offsets[0]).toBe(0);
      expect(offsets[offsets.length - 1]).toBe(1);
    }
    expect(GRADIENT_PRESETS.some((p) => p.gradient.type === 'radial')).toBe(true);
  });
});

describe('gradient stops', () => {
  it('adds a stop in the widest gap up to five, and removes down to two', () => {
    let stops = DEFAULT_GRADIENT.stops;
    stops = addStop(stops);
    expect(stops).toHaveLength(3);
    expect(stops[1]!.offset).toBe(0.5);
    for (let i = 0; i < 6; i++) stops = addStop(stops);
    expect(stops).toHaveLength(MAX_STOPS);
    expect(stops.map((s) => s.offset)).toEqual(
      [...stops.map((s) => s.offset)].sort((a, b) => a - b),
    );
    while (stops.length > 2) stops = removeStop(stops, 1);
    expect(removeStop(stops, 0)).toHaveLength(2);
  });

  it('keeps a moved stop between its neighbours', () => {
    const stops = [
      { offset: 0, color: '#000000' },
      { offset: 0.4, color: '#555555' },
      { offset: 1, color: '#ffffff' },
    ];
    expect(moveStop(stops, 1, 1.5)[1]!.offset).toBe(1);
    expect(moveStop(stops, 1, -3)[1]!.offset).toBe(0);
    expect(moveStop(stops, 0, 0.7)[0]!.offset).toBe(0.4);
    expect(moveStop(stops, 1, 0.6)[1]!.offset).toBe(0.6);
  });
});

describe('images', () => {
  const bundled: BundledBackground[] = [
    {
      file: 'patterns/dots.svg',
      kind: 'pattern',
      title: 'Pois',
      licence: { source: 's', licence: 'CC0-1.0', url: 'u', requiresAttribution: false },
    },
    {
      file: 'textures/kraft.webp',
      kind: 'texture',
      title: 'Papier kraft',
      licence: { source: 's', licence: 'CC0-1.0', url: 'u', requiresAttribution: false },
    },
  ];
  const asset = (id: string, kind: AssetRef['kind'], originalName: string): AssetRef => ({
    id,
    kind,
    file: `assets/${id}`,
    originalName,
    sha256: 'x',
  });
  const assets = {
    p: asset('p', 'photo', 'a.jpg'),
    t: asset('t', 'background', 'Papier kraft.webp'),
    m: asset('m', 'background', 'mine.png'),
    d: asset('d', 'pattern', 'Pois.svg'),
  };

  it('recognises the bundled file an asset was copied from', () => {
    expect(bundledOf(assets.d, bundled)?.file).toBe('patterns/dots.svg');
    expect(bundledOf(assets.t, bundled)?.file).toBe('textures/kraft.webp');
    expect(bundledOf(assets.m, bundled)).toBeUndefined();
    expect(bundledOf(assets.p, bundled)).toBeUndefined();
  });

  it('files an image background under photo, texture or mine', () => {
    expect(imageOrigin(plainImage('p'), assets, bundled)).toBe('photo');
    expect(imageOrigin(plainImage('t'), assets, bundled)).toBe('texture');
    expect(imageOrigin(plainImage('m'), assets, bundled)).toBe('mine');
    expect(imageOrigin(plainImage('gone'), assets, bundled)).toBeNull();
  });

  it('starts from a filled, opaque, sharp, untinted image', () => {
    expect(plainImage('p')).toEqual({
      kind: 'image',
      assetId: 'p',
      fit: 'cover',
      opacity: 1,
      blur: 0,
      tint: null,
    });
  });
});
