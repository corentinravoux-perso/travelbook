import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { newBook } from '../factory';
import { BookSchema, ElementSchema, type Element } from '../schema';
import { MapElementSchema, MapStyleSchema } from './schema';
import { mapElement, mapStyle } from './test-helpers';
import type { MapElement, MapStyle } from './types';

/** A document edited by key, as a test breaks one field of a valid value. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

/** A deep copy of the fixture with `edit` applied: lets a test break one field of a valid map. */
function broken(edit: (map: Raw) => void): unknown {
  const raw = JSON.parse(JSON.stringify(mapElement())) as Record<string, unknown>;
  edit(raw);
  return raw;
}

const accepts = (value: unknown): boolean => ElementSchema.safeParse(value).success;

describe('MapElementSchema', () => {
  it('round-trips a valid map through ElementSchema unchanged', () => {
    const map = mapElement();
    const parsed = ElementSchema.parse(map);
    expect(parsed).toEqual(map);
    expect(parsed.type).toBe('map');
    expect(MapElementSchema.parse(map)).toEqual(map);
  });

  it('is accepted in a book, on the cover and on an inner spread', () => {
    const book = newBook({ title: 'T', innerSpreads: 1 });
    book.cover.elements.push(mapElement());
    book.spreads[1]!.elements.push({ ...mapElement(), id: 'map-2' });
    expect(BookSchema.safeParse(book).success).toBe(true);
  });

  it('accepts a transparent background (null) and a colour', () => {
    expect(mapElement().background).toBeNull();
    expect(accepts(mapElement())).toBe(true);
    expect(accepts(broken((m) => (m['background'] = '#fbf4e2')))).toBe(true);
  });

  it('accepts a frame, a route of one stop and no route', () => {
    expect(accepts(broken((m) => (m['frame'] = { center: [100.5, 13.75], scale: 2 })))).toBe(true);
    expect(
      accepts(
        broken((m) => {
          m['route'] = { stops: ['p1'], legs: [], numbered: false };
        }),
      ),
    ).toBe(true);
    expect(accepts(broken((m) => (m['route'] = null)))).toBe(true);
  });

  it('rejects an unknown projection, a frame with a non-positive scale and a missing subject', () => {
    expect(accepts(broken((m) => (m['projection'] = 'robinson')))).toBe(false);
    expect(accepts(broken((m) => (m['frame'] = { center: [0, 0], scale: 0 })))).toBe(false);
    expect(accepts(broken((m) => delete m['subject']))).toBe(false);
    expect(accepts(broken((m) => delete m['geometryAssetId']))).toBe(false);
  });

  it('rejects a subject without its switches', () => {
    for (const key of ['showRegions', 'showNeighbours', 'showLakes', 'includeRemote']) {
      expect(accepts(broken((m) => delete m['subject'][key]))).toBe(false);
    }
  });

  it('keeps the element geometry rules of every other element', () => {
    expect(accepts(broken((m) => (m['opacity'] = 2)))).toBe(false);
    expect(accepts(broken((m) => (m['w'] = -1)))).toBe(false);
  });
});

describe('MapPlace', () => {
  const place = (m: Raw, i = 1): Raw => m['places'][i];

  it('rejects a photo without an asset id, and one with an empty id', () => {
    expect(accepts(broken((m) => delete place(m)['photo'].assetId))).toBe(false);
    expect(accepts(broken((m) => (place(m)['photo'].assetId = '')))).toBe(false);
  });

  it('rejects a photo without a positive diameter or with a crop that zooms out', () => {
    expect(accepts(broken((m) => (place(m)['photo'].diameter = 0)))).toBe(false);
    expect(accepts(broken((m) => (place(m)['photo'].crop.scale = 0.5)))).toBe(false);
    expect(accepts(broken((m) => (place(m)['photo'].crop.cx = 1.5)))).toBe(false);
  });

  it('accepts no photo, no label offset and no marker override', () => {
    const ok = broken((m) => {
      Object.assign(place(m), { photo: null, labelOffset: null, marker: null, markerSize: null });
    });
    expect(accepts(ok)).toBe(true);
  });

  it('rejects a coordinate off the globe', () => {
    expect(accepts(broken((m) => (place(m).lat = 91)))).toBe(false);
    expect(accepts(broken((m) => (place(m).lon = 181)))).toBe(false);
    expect(accepts(broken((m) => (place(m).lon = Number.NaN)))).toBe(false);
  });

  it('accepts the six markers and rejects another one', () => {
    for (const marker of ['point', 'pin', 'flag', 'badge', 'star', 'icon']) {
      expect(accepts(broken((m) => (place(m).marker = marker)))).toBe(true);
    }
    expect(accepts(broken((m) => (place(m).marker = 'square')))).toBe(false);
  });

  it('bounds the marker size to 1..20 mm', () => {
    expect(accepts(broken((m) => (place(m).markerSize = 1)))).toBe(true);
    expect(accepts(broken((m) => (place(m).markerSize = 20)))).toBe(true);
    expect(accepts(broken((m) => (place(m).markerSize = 0.5)))).toBe(false);
    expect(accepts(broken((m) => (place(m).markerSize = 21)))).toBe(false);
  });

  it('knows three sources: a city, a sight and a custom point', () => {
    expect(accepts(broken((m) => (place(m).source = { kind: 'sight', ref: 'wd:Q1' })))).toBe(true);
    expect(accepts(broken((m) => (place(m).source = { kind: 'custom' })))).toBe(true);
    expect(accepts(broken((m) => (place(m).source = { kind: 'city' })))).toBe(false);
    expect(accepts(broken((m) => (place(m).source = { kind: 'region', ref: 'x' })))).toBe(false);
  });
});

describe('MapRoute', () => {
  const leg = (m: Raw): Raw => m['route'].legs[0];

  it('accepts the six modes and rejects another one', () => {
    for (const mode of ['voiture', 'bus', 'train', 'avion', 'bateau', 'pied']) {
      expect(accepts(broken((m) => (leg(m).mode = mode)))).toBe(true);
    }
    expect(accepts(broken((m) => (leg(m).mode = 'velo')))).toBe(false);
  });

  it('accepts both curves and rejects another one', () => {
    expect(accepts(broken((m) => (leg(m).curve = 'droit')))).toBe(true);
    expect(accepts(broken((m) => (leg(m).curve = 'ondulee')))).toBe(false);
  });

  it('bounds the bend to -1..1', () => {
    for (const bend of [-1, 0, 1]) expect(accepts(broken((m) => (leg(m).bend = bend)))).toBe(true);
    for (const bend of [-1.01, 1.01, Number.NaN]) {
      expect(accepts(broken((m) => (leg(m).bend = bend)))).toBe(false);
    }
  });

  it('needs the icon flag of every leg', () => {
    expect(accepts(broken((m) => (leg(m).icon = false)))).toBe(true);
    expect(accepts(broken((m) => delete leg(m).icon))).toBe(false);
  });
});

describe('MapStyleSchema', () => {
  /** The style with `edit` applied to a deep copy. */
  function style(edit: (s: Raw) => void): unknown {
    const raw = JSON.parse(JSON.stringify(mapStyle())) as Record<string, unknown>;
    edit(raw);
    return raw;
  }
  const valid = (value: unknown): boolean => MapStyleSchema.safeParse(value).success;

  it('accepts a complete style and keeps it as is', () => {
    expect(MapStyleSchema.parse(mapStyle())).toEqual(mapStyle());
  });

  it('is at styleVersion 1', () => {
    expect(valid(style((s) => (s['styleVersion'] = 2)))).toBe(false);
    expect(valid(style((s) => delete s['styleVersion']))).toBe(false);
  });

  it('needs every token', () => {
    for (const token of Object.keys(mapStyle())) {
      expect(valid(style((s) => delete s[token])), token).toBe(false);
    }
  });

  it('paints nothing where a fill or stroke is null', () => {
    const none = style((s) => {
      s['land'].fill = null;
      s['land'].stroke = null;
      s['regions'].stroke = null;
      s['neighbours'].fill = null;
      s['neighbours'].stroke = null;
      s['lakes'].fill = null;
      s['lakes'].stroke = null;
      s['outline'].color = null;
      s['markers'].city.stroke = null;
      s['badge'].stroke = null;
    });
    expect(valid(none)).toBe(true);
  });

  it('bounds the sizes to 1..20 mm', () => {
    for (const key of ['marker', 'badge', 'vehicle']) {
      for (const size of [1, 20]) expect(valid(style((s) => (s['sizes'][key] = size)))).toBe(true);
      for (const size of [0.9, 20.1, 0]) {
        expect(valid(style((s) => (s['sizes'][key] = size))), `${key} ${size}`).toBe(false);
      }
    }
  });

  it('bounds the outline detail to 0..1', () => {
    for (const detail of [0, 0.5, 1]) {
      expect(valid(style((s) => (s['outline'].detail = detail)))).toBe(true);
    }
    for (const detail of [-0.1, 1.1, Number.NaN]) {
      expect(valid(style((s) => (s['outline'].detail = detail)))).toBe(false);
    }
  });

  it('describes a dash as a list of lengths, or none', () => {
    expect(valid(style((s) => (s['regions'].dash = [2, 1])))).toBe(true);
    expect(valid(style((s) => (s['regions'].dash = [])))).toBe(false);
    expect(valid(style((s) => (s['regions'].dash = [2, -1])))).toBe(false);
    expect(valid(style((s) => (s['route'].avion.dash = '0.01 1.7')))).toBe(false);
  });

  it('has a marker for each place kind and a line for each leg mode', () => {
    for (const kind of ['capital', 'city', 'sight', 'custom']) {
      expect(valid(style((s) => delete s['markers'][kind])), kind).toBe(false);
    }
    for (const mode of ['voiture', 'bus', 'train', 'avion', 'bateau', 'pied']) {
      expect(valid(style((s) => delete s['route'][mode])), mode).toBe(false);
    }
    expect(valid(style((s) => (s['markers'].city.kind = 'square')))).toBe(false);
  });

  it('takes the hand-drawn setting, or none', () => {
    expect(valid(style((s) => (s['rough'] = { seed: 7, roughness: 1.2 })))).toBe(true);
    expect(valid(style((s) => (s['rough'] = { seed: 1.5, roughness: 1 })))).toBe(false);
    expect(valid(style((s) => (s['rough'] = { seed: 7, roughness: -1 })))).toBe(false);
    expect(valid(style((s) => delete s['rough']))).toBe(false);
  });

  it('restricts the label case and weight', () => {
    for (const c of ['none', 'upper', 'lower']) {
      expect(valid(style((s) => (s['label'].case = c)))).toBe(true);
    }
    expect(valid(style((s) => (s['label'].case = 'title')))).toBe(false);
    expect(valid(style((s) => (s['label'].weight = 0)))).toBe(false);
    expect(valid(style((s) => (s['label'].sizePt = 0)))).toBe(false);
  });
});

describe('schema and interfaces agree (compile-time, checked by typecheck)', () => {
  it('z.output equals the hand-written map types', () => {
    expectTypeOf<z.output<typeof MapElementSchema>>().toEqualTypeOf<MapElement>();
    expectTypeOf<z.output<typeof MapStyleSchema>>().toEqualTypeOf<MapStyle>();
    expectTypeOf<MapElement>().toExtend<Element>();
  });
});
