import { render } from '@testing-library/react';
import {
  DEFAULT_MAP_STYLE,
  PT_MM,
  type MapElement,
  type MapGeometry,
  type MapLegMode,
  type MapPlace,
} from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { SpreadView } from '../SpreadView';
import { bookWith } from '../test-helpers';
import { MapView } from './MapView';

const LAYERS = [
  'background',
  'neighbours',
  'land',
  'lakes',
  'regions',
  'selected',
  'outline',
  'leaders',
  'route',
  'markers',
  'badges',
  'labels',
  'medallions',
];

const geometry: MapGeometry = {
  version: 1,
  projection: { kind: 'mercator', rotate: [0, 0, 0], k: 600, tx: 500, ty: 300 },
  bounds: [
    [0, 0],
    [1000, 600],
  ],
  remoteBounds: [
    [0, 0],
    [1000, 600],
  ],
  paths: {
    land: 'M0 0H1000V600H0Z',
    outline: 'M0 0H1000V600H0Z',
    regions: 'M500 0V600',
    selected: 'M0 0H500V600H0Z',
    neighbours: 'M-50 0H0V600H-50Z',
    lakes: 'M400 200h50v50h-50Z',
  },
};

function place(id: string, lon: number, lat: number, patch: Partial<MapPlace> = {}): MapPlace {
  return {
    id,
    source: { kind: 'custom' },
    lon,
    lat,
    label: id.toUpperCase(),
    shown: true,
    labelShown: true,
    marker: null,
    markerSize: null,
    labelOffset: null,
    photo: null,
    ...patch,
  };
}

function mapEl(patch: Partial<MapElement> = {}, w = 150, h = 100): MapElement {
  return {
    id: 'map-1',
    x: 10,
    y: 20,
    w,
    h,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    type: 'map',
    geometryAssetId: 'map-0123456789abcdef',
    subject: {
      id: 'TH',
      regions: [],
      showRegions: true,
      showNeighbours: true,
      showLakes: true,
      includeRemote: false,
    },
    frame: null,
    projection: 'auto',
    style: structuredClone(DEFAULT_MAP_STYLE),
    places: [place('a', -5, 0), place('b', 5, 0)],
    route: null,
    medallions: false,
    background: null,
    ...patch,
  };
}

const quality = 'preview' as const;
const assetUrl = (id: string): string => `/a/${id}`;

function draw(el: MapElement, g: MapGeometry | null | 'missing' = geometry) {
  const { container } = render(
    <MapView el={el} geometry={g} quality={quality} assetUrl={assetUrl} />,
  );
  const layer = (name: string) => container.querySelector<SVGGElement>(`[data-layer="${name}"]`);
  return { container, layer };
}

function allAttributes(container: Element): string[] {
  return Array.from(container.querySelectorAll('*')).flatMap((n) =>
    Array.from(n.attributes).map((a) => a.value),
  );
}

const scaleOf = (node: Element | null): number => {
  const m = /scale\(([-\d.e]+)\)/.exec(node?.getAttribute('transform') ?? '');
  return Number(m?.[1]);
};

describe('MapView', () => {
  it('is a map element with the layers in order', () => {
    const { container } = draw(mapEl());
    expect(container.querySelector('[data-element-type="map"]')).not.toBeNull();
    const layers = Array.from(container.querySelectorAll('[data-layer]')).map((n) =>
      n.getAttribute('data-layer'),
    );
    expect(layers).toEqual(LAYERS);
  });

  it('draws no background rect when the background is null, one when set', () => {
    expect(draw(mapEl()).layer('background')?.querySelector('rect')).toBeNull();
    const rect = draw(mapEl({ background: '#abcdef' }))
      .layer('background')
      ?.querySelector('rect');
    expect(rect?.getAttribute('fill')).toBe('#abcdef');
    expect(rect?.getAttribute('width')).toBe('150');
  });

  it('draws an empty frame for a null geometry', () => {
    const { container, layer } = draw(mapEl({ background: '#fff' }), null);
    expect(container.querySelector('[data-layer="land"]')).toBeNull();
    expect(layer('background')).toBeNull();
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#fff');
    expect(container.textContent).not.toContain('Carte introuvable');
  });

  it('draws a hatched frame labelled "Carte introuvable" for a missing geometry', () => {
    const { container } = draw(mapEl(), 'missing');
    expect(container.textContent).toContain('Carte introuvable');
    expect(container.querySelector('pattern')).not.toBeNull();
    expect(container.querySelector('[data-layer="land"]')).toBeNull();
    expect(container.querySelector('[data-element-type="map"]')).not.toBeNull();
  });

  it('takes the missing label as a prop', () => {
    const { container } = render(
      <MapView
        el={mapEl()}
        geometry="missing"
        quality={quality}
        assetUrl={assetUrl}
        missingLabel="X"
      />,
    );
    expect(container.textContent).toBe('X');
  });

  it('draws the geometry paths in their layers', () => {
    const { layer } = draw(
      mapEl({ subject: { ...mapEl().subject, showNeighbours: true, regions: ['R'] } }),
    );
    expect(layer('land')?.querySelector('path')?.getAttribute('d')).toBe(geometry.paths.land);
    expect(layer('neighbours')?.querySelector('path')?.getAttribute('d')).toBe(
      geometry.paths.neighbours,
    );
    expect(layer('regions')?.querySelector('path')?.getAttribute('d')).toBe(geometry.paths.regions);
    expect(layer('selected')?.querySelector('path')?.getAttribute('d')).toBe(
      geometry.paths.selected,
    );
    expect(layer('outline')?.querySelector('path')?.getAttribute('d')).toBe(geometry.paths.outline);
  });

  it('draws the neighbours fill without a stroke and their lines apart, when the geometry has lines', () => {
    const lined = { ...geometry, paths: { ...geometry.paths, neighbourLines: 'M-50 0V600' } };
    const { layer } = draw(mapEl(), lined);
    const paths = Array.from(layer('neighbours')?.querySelectorAll('path') ?? []);
    expect(paths).toHaveLength(2);
    expect(paths[0]?.getAttribute('d')).toBe(geometry.paths.neighbours);
    expect(paths[0]?.getAttribute('stroke')).toBe('none');
    expect(paths[0]?.getAttribute('fill')).not.toBe('none');
    expect(paths[1]?.getAttribute('d')).toBe('M-50 0V600');
    expect(paths[1]?.getAttribute('fill')).toBe('none');
    expect(paths[1]?.getAttribute('stroke')).not.toBe('none');
    expect(paths[1]?.getAttribute('stroke-width')).toBeTruthy();
  });

  it('strokes the neighbours fill itself when the geometry has no lines (old assets)', () => {
    const { layer } = draw(mapEl());
    const paths = Array.from(layer('neighbours')?.querySelectorAll('path') ?? []);
    expect(paths).toHaveLength(1);
    expect(paths[0]?.getAttribute('stroke')).not.toBe('none');
  });

  it('draws the lakes above the land, only when showLakes is on', () => {
    const { container, layer } = draw(mapEl());
    expect(layer('lakes')?.querySelector('path')?.getAttribute('d')).toBe(geometry.paths.lakes);
    const order = Array.from(container.querySelectorAll('[data-layer]')).map((n) =>
      n.getAttribute('data-layer'),
    );
    expect(order.indexOf('lakes')).toBeGreaterThan(order.indexOf('land'));
    const off = draw(mapEl({ subject: { ...mapEl().subject, showLakes: false } }));
    expect(off.layer('lakes')?.querySelector('path')).toBeNull();
  });

  it('keeps strokes in mm whatever the fit scale', () => {
    // 150 x 100 mm box: the land width is 0.55 mm on paper, so 0.55 / scale in map units.
    const { layer } = draw(mapEl());
    const group = layer('land')?.parentElement as Element;
    const s = scaleOf(group);
    expect(s).toBeGreaterThan(0);
    const w = Number(layer('outline')?.querySelector('path')?.getAttribute('stroke-width'));
    expect(w * s).toBeCloseTo(0.55, 2);
  });

  it('draws labels with the same font size at any element size', () => {
    const sizes = [mapEl({}, 300, 40), mapEl({}, 20, 20)].map((el) => {
      const { container, layer } = draw(el);
      expect(allAttributes(container).join(' ')).not.toMatch(/NaN|Infinity/);
      const text = layer('labels')?.querySelector('text');
      expect(text).not.toBeNull();
      return text?.getAttribute('font-size');
    });
    expect(sizes[0]).toBe(sizes[1]);
    expect(Number(sizes[0])).toBeCloseTo(9.5 * PT_MM, 3);
  });

  it('gives the label a halo: a stroke under the fill', () => {
    const text = draw(mapEl()).layer('labels')?.querySelector('text');
    expect(text?.getAttribute('stroke')).toBe(DEFAULT_MAP_STYLE.label.halo.color);
    expect(text?.getAttribute('stroke-width')).toBe(String(DEFAULT_MAP_STYLE.label.halo.width));
    expect(text?.getAttribute('paint-order')).toBe('stroke');
    expect(text?.getAttribute('font-family')).toContain('Lora');
  });

  it('uses no filter, mask or clipPath', () => {
    const el = mapEl({
      route: {
        stops: ['a', 'b'],
        legs: [{ mode: 'avion', curve: 'courbe', bend: 0.3, icon: true }],
        numbered: true,
      },
      style: { ...structuredClone(DEFAULT_MAP_STYLE), rough: { seed: 1, roughness: 1 } },
    });
    const { container } = draw(el);
    expect(container.querySelector('filter, mask, clipPath')).toBeNull();
    expect(container.innerHTML).not.toMatch(/filter=|mask=|clip-path=/);
  });

  it('doubles the marker when sizes.marker goes from 3 to 6; markerSize overrides', () => {
    const style = (marker: number) => ({
      ...structuredClone(DEFAULT_MAP_STYLE),
      sizes: { ...DEFAULT_MAP_STYLE.sizes, marker },
    });
    const first = (el: MapElement) =>
      scaleOf(draw(el).layer('markers')?.querySelector('[data-place="a"]') as Element);
    const three = first(mapEl({ style: style(3) }));
    const six = first(mapEl({ style: style(6) }));
    expect(six).toBeCloseTo(2 * three, 4);
    // custom places use a `pin` of scale 1: drawn size is the diameter in mm
    expect(three).toBeCloseTo(3, 4);
    const own = mapEl({
      style: style(3),
      places: [place('a', 0, 0, { markerSize: 8 }), place('b', 5, 0)],
    });
    expect(first(own)).toBeCloseTo(8, 4);
  });

  it('skips a hidden place and an unlabelled one', () => {
    const el = mapEl({
      places: [place('a', 0, 0, { shown: false }), place('b', 5, 0, { labelShown: false })],
    });
    const { layer } = draw(el);
    expect(layer('markers')?.querySelector('[data-place="a"]')).toBeNull();
    expect(layer('markers')?.querySelector('[data-place="b"]')).not.toBeNull();
    expect(layer('labels')?.querySelectorAll('text')).toHaveLength(0);
  });

  const MODES: MapLegMode[] = ['voiture', 'bus', 'train', 'avion', 'bateau', 'pied'];
  it.each(MODES)('draws the %s glyph when icon is on, none when off', (mode) => {
    const route = (icon: boolean) =>
      mapEl({
        route: {
          stops: ['a', 'b'],
          legs: [{ mode, curve: 'droit', bend: 0, icon }],
          numbered: false,
        },
      });
    const on = draw(route(true));
    expect(on.layer('route')?.querySelectorAll('path[data-leg]')).toHaveLength(1);
    expect(on.layer('route')?.querySelectorAll(`[data-vehicle="${mode}"]`)).toHaveLength(1);
    const off = draw(route(false));
    expect(off.layer('route')?.querySelectorAll('[data-vehicle]')).toHaveLength(0);
    expect(off.layer('route')?.querySelectorAll('path[data-leg]')).toHaveLength(1);
  });

  it('draws the vehicle at the size of sizes.vehicle', () => {
    const el = mapEl({
      route: {
        stops: ['a', 'b'],
        legs: [{ mode: 'train', curve: 'droit', bend: 0, icon: true }],
        numbered: false,
      },
    });
    const v = draw(el).layer('route')?.querySelector('[data-vehicle]') as Element;
    expect(v.getAttribute('transform')).toContain(
      `scale(${DEFAULT_MAP_STYLE.sizes.vehicle} ${DEFAULT_MAP_STYLE.sizes.vehicle})`,
    );
  });

  it('numbers the stops with badges, a repeated stop gets both numbers', () => {
    const el = mapEl({
      places: [place('a', -5, 0), place('b', 5, 0)],
      route: {
        stops: ['a', 'b', 'a'],
        legs: [
          { mode: 'train', curve: 'droit', bend: 0, icon: false },
          { mode: 'train', curve: 'droit', bend: 0, icon: false },
        ],
        numbered: true,
      },
    });
    const { layer } = draw(el);
    const badges = layer('badges')?.querySelectorAll('[data-badge]') ?? [];
    expect(Array.from(badges).map((b) => b.textContent)).toEqual(['1,3', '2']);
    const off = draw({
      ...el,
      route: { ...(el.route as NonNullable<MapElement['route']>), numbered: false },
    });
    expect(off.layer('badges')?.children).toHaveLength(0);
  });

  it('hatches the land of a rough style with a pattern in the land colour, no clipPath', () => {
    const el = mapEl({
      style: { ...structuredClone(DEFAULT_MAP_STYLE), rough: { seed: 3, roughness: 1 } },
    });
    const { container, layer } = draw(el);
    const pattern = container.querySelector('pattern');
    expect(pattern).not.toBeNull();
    const id = pattern?.getAttribute('id');
    expect(id).toBeTruthy();
    const land = layer('land')?.querySelector('path');
    expect(land?.getAttribute('fill')).toBe(`url(#${id})`);
    const line = pattern?.querySelector('line, path');
    expect(line?.getAttribute('stroke')).toBe(DEFAULT_MAP_STYLE.land.fill);
    expect(container.querySelector('clipPath')).toBeNull();
    // hatching is fixed on paper: the pattern cancels the fit scale
    const s = scaleOf(layer('land')?.parentElement as Element);
    expect(pattern?.getAttribute('patternTransform')).toBe(
      `scale(${Math.round((1 / s) * 1e8) / 1e8}) rotate(45)`,
    );
  });

  it('fills the land plainly when not rough', () => {
    const { container, layer } = draw(mapEl());
    expect(container.querySelector('pattern')).toBeNull();
    expect(layer('land')?.querySelector('path')?.getAttribute('fill')).toBe(
      DEFAULT_MAP_STYLE.land.fill,
    );
  });

  it('survives a bad spec: missing stops, repeated ids, non-finite numbers', () => {
    const el = mapEl({
      places: [
        place('a', -5, 0),
        place('a', 3, 3),
        place('c', Number.NaN, Infinity, { markerSize: Number.NaN }),
        place('d', 1, 1, { labelOffset: { dx: Number.NaN, dy: 2 } }),
      ],
      route: {
        stops: ['a', 'ghost', 'd', 'c', 'a'],
        legs: [
          { mode: 'train', curve: 'courbe', bend: 0.5, icon: true },
          { mode: 'bus', curve: 'droit', bend: Number.NaN, icon: true },
          { mode: 'avion', curve: 'courbe', bend: Infinity, icon: true },
        ],
        numbered: true,
      },
    });
    const { container, layer } = draw(el);
    // a -> ghost, ghost -> d are skipped, c has no finite position (d -> c skipped), c -> a has no leg
    expect(layer('route')?.querySelectorAll('path[data-leg]')).toHaveLength(0);
    expect(allAttributes(container).join(' ')).not.toMatch(/NaN|Infinity/);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('survives a degenerate box and a wild frame', () => {
    const el = mapEl({ frame: { center: [Number.NaN, 0], scale: 1e300 } }, 0, Number.NaN);
    const { container } = draw(el);
    expect(allAttributes(container).join(' ')).not.toMatch(/NaN|Infinity/);
  });

  it('is drawn by SpreadView from the geometry of its asset', () => {
    const { book, spread } = bookWith([mapEl()]);
    const calls: string[] = [];
    const view = (g: MapGeometry | null | 'missing') =>
      render(
        <SpreadView
          book={book}
          spread={spread}
          quality={quality}
          assetUrl={assetUrl}
          mapGeometry={(id) => (calls.push(id), g)}
        />,
      ).container;
    expect(view(geometry).querySelector('[data-layer="land"]')).not.toBeNull();
    expect(calls).toEqual(['map-0123456789abcdef']);
    expect(view('missing').textContent).toContain('Carte introuvable');
  });

  it('measures labelOffset from the projected point for a tip-anchored marker', () => {
    const textAt = (marker: 'pin' | 'point') => {
      const el = mapEl({
        places: [place('a', 0, 0, { marker, labelOffset: { dx: 4, dy: -3 } })],
      });
      const { layer } = draw(el);
      const t = layer('labels')?.querySelector('text');
      return { x: Number(t?.getAttribute('x')), y: Number(t?.getAttribute('y')) };
    };
    const pin = textAt('pin');
    const point = textAt('point');
    expect(pin.x).toBeCloseTo(point.x, 3);
    expect(pin.y).toBeCloseTo(point.y, 3);
    // the point is the centre of the 150 x 100 box (lon 0, lat 0)
    expect(pin.x).toBeCloseTo(75 + 4, 1);
    expect(pin.y).toBeCloseTo(50 - 3, 1);
  });

  it.each([
    [300, 40],
    [20, 20],
  ])('fits the land inside a %i x %i mm box', (w, h) => {
    const { layer } = draw(mapEl({}, w, h));
    const group = layer('land')?.parentElement as Element;
    const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.e]+)\)/.exec(
      group.getAttribute('transform') ?? '',
    );
    const [tx, ty, s] = [Number(m?.[1]), Number(m?.[2]), Number(m?.[3])];
    const [[x0, y0], [x1, y1]] = geometry.bounds;
    const eps = 0.01;
    expect(x0 * s + tx).toBeGreaterThanOrEqual(-eps);
    expect(y0 * s + ty).toBeGreaterThanOrEqual(-eps);
    expect(x1 * s + tx).toBeLessThanOrEqual(w + eps);
    expect(y1 * s + ty).toBeLessThanOrEqual(h + eps);
  });

  it('handles a one-stop itinerary and two places at the same coordinates', () => {
    const el = mapEl({
      places: [place('a', 0, 0), place('b', 0, 0)],
      route: { stops: ['a'], legs: [], numbered: true },
    });
    const { container, layer } = draw(el);
    expect(allAttributes(container).join(' ')).not.toMatch(/NaN|Infinity/);
    expect(
      Array.from(layer('badges')?.querySelectorAll('[data-badge]') ?? []).map((b) => b.textContent),
    ).toEqual(['1']);
    expect(layer('route')?.querySelectorAll('path[data-leg]')).toHaveLength(0);
    const two = mapEl({
      places: [place('a', 0, 0), place('b', 0, 0)],
      route: {
        stops: ['b', 'a'],
        legs: [{ mode: 'train', curve: 'droit', bend: 0, icon: true }],
        numbered: true,
      },
    });
    const d = draw(two);
    expect(allAttributes(d.container).join(' ')).not.toMatch(/NaN|Infinity/);
    expect(
      Array.from(d.layer('badges')?.querySelectorAll('[data-badge]') ?? []).map((b) => [
        b.getAttribute('data-badge'),
        b.textContent,
      ]),
    ).toEqual([
      ['a', '2'],
      ['b', '1'],
    ]);
  });

  it('draws nothing for a place with a non-finite position', () => {
    const el = mapEl({
      places: [place('a', Number.NaN, 0), place('b', 5, Infinity), place('c', 1, 1)],
      route: {
        stops: ['a', 'b', 'c'],
        legs: [
          { mode: 'train', curve: 'droit', bend: 0, icon: true },
          { mode: 'train', curve: 'droit', bend: 0, icon: true },
        ],
        numbered: true,
      },
    });
    const { container, layer } = draw(el);
    expect(layer('markers')?.querySelectorAll('[data-place]')).toHaveLength(1);
    expect(layer('markers')?.querySelector('[data-place="c"]')).not.toBeNull();
    expect(layer('labels')?.querySelectorAll('text')).toHaveLength(1);
    expect(
      Array.from(layer('badges')?.querySelectorAll('[data-badge]') ?? []).map((b) =>
        b.getAttribute('data-badge'),
      ),
    ).toEqual(['c']);
    expect(layer('route')?.querySelectorAll('path[data-leg]')).toHaveLength(0);
    expect(allAttributes(container).join(' ')).not.toMatch(/NaN|Infinity/);
  });

  it('with regions chosen, the land is context and the selection gets the land look', () => {
    const style = structuredClone(DEFAULT_MAP_STYLE);
    style.land.fill = '#111111';
    style.neighbours.fill = '#eeeeee';
    style.outline.color = null;
    const chosen = draw(mapEl({ style, subject: { ...mapEl().subject, regions: ['US-CA'] } }));
    expect(chosen.layer('land')?.querySelector('path')?.getAttribute('fill')).toBe('#eeeeee');
    const fill = chosen.layer('land')?.querySelector('path[data-selected-fill]');
    expect(fill?.getAttribute('fill')).toBe('#111111');
    expect(fill?.getAttribute('d')).toBe(geometry.paths.selected);
    // the fill is in the land group, so the lakes group paints over it
    const lakes = chosen.layer('lakes') as Element;
    expect(fill?.compareDocumentPosition(lakes) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const sel = chosen.layer('selected')?.querySelector('path');
    expect(sel?.getAttribute('fill')).toBe('none');
    expect(sel?.getAttribute('stroke')).toBe(style.land.stroke);
    const none = draw(mapEl({ style }));
    expect(none.layer('land')?.querySelector('path')?.getAttribute('fill')).toBe('#111111');
    expect(none.layer('selected')?.querySelector('path')).toBeNull();
  });

  it('keeps a label inside the box when its place is near an edge', () => {
    // lon -52 is about 2 mm from the left edge of a 100 x 60 mm box
    const label = 'SAN FRANCISCO';
    const el = mapEl({ places: [place('a', -52, 0, { label })] }, 100, 60);
    const t = draw(el).layer('labels')?.querySelector('text');
    const x = Number(t?.getAttribute('x'));
    const width = label.length * 9.5 * PT_MM * 0.55;
    expect(x - width / 2).toBeGreaterThanOrEqual(-0.01);
    expect(x + width / 2).toBeLessThanOrEqual(100.01);
    const marker = draw(el).layer('markers')?.querySelector('[data-place="a"]');
    expect(/translate\(([-\d.]+)/.exec(marker?.getAttribute('transform') ?? '')?.[1]).toBeDefined();
    expect(
      Number(/translate\(([-\d.]+)/.exec(marker?.getAttribute('transform') ?? '')?.[1]),
    ).toBeLessThan(4);
  });

  describe('medallions', () => {
    const photo = (dx: number, dy: number, assetId = 'ph-1', diameter = 10) => ({
      assetId,
      offset: { dx, dy },
      diameter,
      crop: { scale: 2, cx: 0.5, cy: 0.5 },
    });
    const withPhoto = (medallions: boolean, labelShown = false) =>
      mapEl({
        medallions,
        places: [place('a', 0, 0, { photo: photo(20, 0), labelShown })],
      });

    it('draws no image when the master switch is off', () => {
      const { container, layer } = draw(withPhoto(false));
      expect(container.querySelector('image')).toBeNull();
      expect(layer('medallions')?.children.length).toBe(0);
      expect(layer('leaders')?.children.length).toBe(0);
    });

    it('draws one circle-clipped image with ring and leader per shown place with a photo', () => {
      const el = mapEl({
        medallions: true,
        places: [
          place('a', 0, 0, { photo: photo(20, 0, 'ph-a') }),
          place('b', 5, 5, { photo: photo(0, 20, 'ph-b'), shown: false }),
          place('c', 5, -5),
        ],
      });
      const { container, layer } = draw(el);
      const images = container.querySelectorAll('image');
      expect(images.length).toBe(1);
      expect(images[0].getAttribute('href')).toBe('/a/ph-a');
      const m = layer('medallions') as Element;
      const clip = images[0].getAttribute('clip-path') as string;
      const id = /url\(#(.+)\)/.exec(clip)?.[1] as string;
      const circle = container.querySelector(`clipPath[id="${id}"] circle`) as Element;
      expect(Number(circle.getAttribute('r'))).toBe(5);
      const ring = m.querySelector('circle[data-ring]') as Element;
      expect(ring.getAttribute('stroke')).toBe(DEFAULT_MAP_STYLE.medallion.ringColor);
      expect(Number(ring.getAttribute('stroke-width'))).toBe(DEFAULT_MAP_STYLE.medallion.ringWidth);
      expect(Number(ring.getAttribute('r'))).toBe(5);
      // the leader runs from the medallion edge to the point (20 mm right of it)
      const marker = layer('markers')?.querySelector('[data-place="a"]') as Element;
      const t = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(marker.getAttribute('transform') ?? '');
      const px = Number(t?.[1]);
      const leader = layer('leaders')?.querySelector('line') as Element;
      expect(leader.getAttribute('stroke')).toBe(DEFAULT_MAP_STYLE.label.color);
      expect(Number(leader.getAttribute('x1'))).toBeCloseTo(px + 20 - 5, 3);
      expect(Number(leader.getAttribute('x2'))).toBeCloseTo(px, 3);
      expect(Number(ring.getAttribute('cx'))).toBeCloseTo(px + 20, 3);
    });

    it('still draws the leader, at least 0.2 mm wide, with a ring of width 0', () => {
      const el = withPhoto(true);
      const style = { ...el.style, medallion: { ...el.style.medallion, ringWidth: 0 } };
      const { layer } = draw({ ...el, style });
      const leader = layer('leaders')?.querySelector('line') as Element;
      expect(Number(leader.getAttribute('stroke-width'))).toBe(0.2);
    });

    it('draws the ring only when the asset is missing', () => {
      const el = withPhoto(true);
      const { container } = render(
        <MapView
          el={el}
          geometry={geometry}
          quality={quality}
          assetUrl={assetUrl}
          hasAsset={() => false}
        />,
      );
      const layer = (n: string) => container.querySelector(`[data-layer="${n}"]`);
      expect(container.querySelector('image')).toBeNull();
      expect(layer('medallions')?.querySelector('circle[data-ring]')).not.toBeNull();
    });

    it('gives each view its own clip ids', () => {
      const a = draw(withPhoto(true)).container.querySelector('clipPath')?.id;
      const b = draw(withPhoto(true)).container.querySelector('clipPath')?.id;
      expect(a).toBeTruthy();
      expect(a).not.toBe(b);
    });

    it('keeps labels off the medallion', () => {
      const el = (medallions: boolean) =>
        mapEl({
          medallions,
          places: [place('a', 0, 0, { labelShown: true, photo: photo(8, 0, 'ph-1', 10) })],
        });
      const pos = (m: boolean) => {
        const t = draw(el(m)).layer('labels')?.querySelector('text') as Element;
        return [Number(t.getAttribute('x')), Number(t.getAttribute('y'))];
      };
      const ring = draw(el(true)).layer('medallions')?.querySelector('circle') as Element;
      const [x, y] = pos(true);
      const [x0, y0] = pos(false);
      expect(Math.hypot(x - x0, y - y0)).toBeGreaterThan(0);
      // the label centre is outside the disc
      expect(
        Math.hypot(x - Number(ring.getAttribute('cx')), y - Number(ring.getAttribute('cy'))),
      ).toBeGreaterThan(5);
    });

    it('emits no NaN for a non-finite photo', () => {
      const el = mapEl({
        medallions: true,
        places: [place('a', 0, 0, { photo: photo(Number.NaN, Number.POSITIVE_INFINITY) })],
      });
      expect(allAttributes(draw(el).container).join(' ')).not.toMatch(/NaN|Infinity/);
    });

    it('is told by SpreadView which assets are missing', () => {
      const { book, spread } = bookWith([withPhoto(true)]);
      const { container } = render(
        <SpreadView
          book={book}
          spread={spread}
          quality={quality}
          assetUrl={assetUrl}
          mapGeometry={() => geometry}
        />,
      );
      expect(container.querySelector('image')).toBeNull();
      expect(container.querySelector('circle[data-ring]')).not.toBeNull();
    });
  });
});
