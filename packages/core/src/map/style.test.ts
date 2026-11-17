import { describe, expect, it } from 'vitest';
import { MapStyleSchema } from './schema';
import { DEFAULT_MAP_STYLE, normalizeStyle, templateLook, withTemplateLook } from './style';

/** A style edited by key, as a test breaks or removes one token of a valid style. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

/** A deep copy of the default style, as a stored style would come back from JSON. */
const stored = (edit: (style: Raw) => void = () => {}): Raw => {
  const raw = JSON.parse(JSON.stringify(DEFAULT_MAP_STYLE)) as Raw;
  edit(raw);
  return raw;
};

describe('DEFAULT_MAP_STYLE', () => {
  it('is a complete style at styleVersion 1', () => {
    expect(MapStyleSchema.safeParse(DEFAULT_MAP_STYLE).success).toBe(true);
    expect(DEFAULT_MAP_STYLE.styleVersion).toBe(1);
  });

  it('sizes the marks 4, 6.5 and 8 mm, with the full outline detail and clean lines', () => {
    expect(DEFAULT_MAP_STYLE.sizes).toEqual({ marker: 4, badge: 6.5, vehicle: 8 });
    expect(DEFAULT_MAP_STYLE.outline.detail).toBe(1);
    expect(DEFAULT_MAP_STYLE.rough).toBeNull();
  });

  it('draws lakes', () => {
    const { lakes } = DEFAULT_MAP_STYLE;
    expect(lakes.fill ?? lakes.stroke).not.toBeNull();
  });
});

describe('normalizeStyle', () => {
  it('turns {} into the default style', () => {
    expect(normalizeStyle({})).toEqual(DEFAULT_MAP_STYLE);
  });

  it('turns anything that is not an object into the default style', () => {
    for (const raw of [undefined, null, 'carnet', 7, true, [], [DEFAULT_MAP_STYLE]]) {
      expect(normalizeStyle(raw)).toEqual(DEFAULT_MAP_STYLE);
    }
  });

  it('keeps a complete style as it is', () => {
    const style = stored((s) => {
      s['land'].fill = '#223344';
      s['label'].font = 'Kalam';
      s['markers'].city.kind = 'flag';
      s['route'].avion.dash = null;
      s['sizes'].marker = 4;
    });
    expect(normalizeStyle(style)).toEqual(style);
  });

  it('returns a copy: editing it changes neither the default nor the input', () => {
    const style = stored();
    const out = normalizeStyle(style);
    out.land.width = 9;
    out.route.voiture.dash?.push(7);
    out.markers.city.color = '#000000';
    expect(DEFAULT_MAP_STYLE.land.width).toBe(0.55);
    expect(DEFAULT_MAP_STYLE.route.voiture.dash).toEqual([2.2, 1.5]);
    expect(DEFAULT_MAP_STYLE.markers.city.color).toBe('#8b5e3c');
    expect(style['route'].voiture.dash).toEqual([2.2, 1.5]);
    const again = normalizeStyle({});
    again.sizes.marker = 9;
    expect(normalizeStyle({}).sizes.marker).toBe(4);
  });

  it('gives a style saved before the word spacing token the tighter default', () => {
    const old = JSON.parse(JSON.stringify(DEFAULT_MAP_STYLE));
    delete old.label.wordSpacingEm;
    old.label.letterSpacingEm = 0.05;
    const style = normalizeStyle(old);
    expect(style.label.wordSpacingEm).toBe(-0.1);
    expect(style.label.letterSpacingEm).toBe(0.05);
  });

  it('is idempotent', () => {
    const messy = stored((s) => {
      delete s['lakes'];
      s['extra'] = 1;
      s['label'].sizePt = 'big';
    });
    const once = normalizeStyle(messy);
    expect(normalizeStyle(once)).toEqual(once);
  });

  describe('missing tokens', () => {
    it('are filled from the defaults, the others kept', () => {
      const out = normalizeStyle({ land: { fill: '#112233', stroke: null, width: 0.3 } });
      expect(out.land).toEqual({ fill: '#112233', stroke: null, width: 0.3 });
      expect({ ...out, land: DEFAULT_MAP_STYLE.land }).toEqual(DEFAULT_MAP_STYLE);
    });

    it('are filled inside a section: a style from before the lakes and the sizes', () => {
      const old = stored((s) => {
        delete s['lakes'];
        delete s['sizes'];
        delete s['outline'].detail;
        delete s['label'].halo;
        delete s['markers'].custom;
        delete s['route'].bateau;
      });
      const out = normalizeStyle(old);
      expect(out).toEqual(DEFAULT_MAP_STYLE);
    });

    it('keep the given tokens of a half-written section', () => {
      const out = normalizeStyle({ label: { font: 'Kalam', sizePt: 11 } });
      expect(out.label).toEqual({ ...DEFAULT_MAP_STYLE.label, font: 'Kalam', sizePt: 11 });
    });
  });

  describe('unknown tokens', () => {
    it('are dropped at every depth', () => {
      const out = normalizeStyle(
        stored((s) => {
          s['shadow'] = { blur: 2 };
          s['land'].texture = 'paper';
          s['label'].halo.blur = 3;
          s['markers'].landmark = { kind: 'pin', color: '#000000', stroke: null, scale: 1 };
          s['markers'].city.glow = true;
          s['route'].fusee = { color: '#000000', width: 1, dash: null };
          s['sizes'].label = 5;
        }),
      );
      expect(out).toEqual(DEFAULT_MAP_STYLE);
      expect(Object.keys(out)).not.toContain('shadow');
      expect(Object.keys(out.markers)).not.toContain('landmark');
      expect(Object.keys(out.route)).not.toContain('fusee');
    });

    it('are dropped from a rough setting that is kept', () => {
      const out = normalizeStyle(
        stored((s) => (s['rough'] = { seed: 3, roughness: 1.5, fill: 1 })),
      );
      expect(out.rough).toEqual({ seed: 3, roughness: 1.5 });
    });
  });

  describe('styleVersion', () => {
    it('is 1 whatever the input says', () => {
      for (const version of [undefined, 0, 2, 'x']) {
        expect(normalizeStyle(stored((s) => (s['styleVersion'] = version))).styleVersion).toBe(1);
      }
    });
  });

  describe('nullable tokens', () => {
    it('keep a null where the style paints nothing', () => {
      const out = normalizeStyle(
        stored((s) => {
          s['land'].fill = null;
          s['land'].stroke = null;
          s['outline'].color = null;
        }),
      );
      expect(out.land.fill).toBeNull();
      expect(out.land.stroke).toBeNull();
      expect(out.outline.color).toBeNull();
    });

    it('keep a dash and a rough setting that the default does not have', () => {
      const out = normalizeStyle(
        stored((s) => {
          s['regions'].dash = [1.2, 0.8];
          s['rough'] = { seed: 11, roughness: 1 };
        }),
      );
      expect(out.regions.dash).toEqual([1.2, 0.8]);
      expect(out.rough).toEqual({ seed: 11, roughness: 1 });
    });

    it('keep a null where the default has a value', () => {
      const out = normalizeStyle(stored((s) => (s['route'].voiture.dash = null)));
      expect(out.route.voiture.dash).toBeNull();
    });
  });

  describe('invalid tokens', () => {
    it('fall back to the default of that token only', () => {
      const out = normalizeStyle(
        stored((s) => {
          s['label'].sizePt = 'big';
          s['label'].font = '';
          s['sizes'].marker = 99;
          s['land'].fill = '#223344';
        }),
      );
      expect(out.label.sizePt).toBe(DEFAULT_MAP_STYLE.label.sizePt);
      expect(out.label.font).toBe(DEFAULT_MAP_STYLE.label.font);
      expect(out.sizes.marker).toBe(DEFAULT_MAP_STYLE.sizes.marker);
      expect(out.land.fill).toBe('#223344');
    });

    it('fall back to the default dash, and to no rough setting', () => {
      const out = normalizeStyle(
        stored((s) => {
          s['route'].voiture.dash = [2, -1];
          s['rough'] = { seed: 1.5, roughness: 1 };
        }),
      );
      expect(out.route.voiture.dash).toEqual([2.2, 1.5]);
      expect(out.rough).toBeNull();
    });

    it('fall back to the default section when it is not an object', () => {
      const out = normalizeStyle({ land: 'orange', markers: [], route: null });
      expect(out).toEqual(DEFAULT_MAP_STYLE);
    });

    it('always give a style the schema accepts', () => {
      const out = normalizeStyle({ land: { width: -3 }, outline: { detail: 7 }, sizes: [1] });
      expect(MapStyleSchema.safeParse(out).success).toBe(true);
    });
  });
});

describe('withTemplateLook', () => {
  const template = {
    ...structuredClone(DEFAULT_MAP_STYLE),
    land: { fill: '#000001', stroke: null, width: 3 },
    label: { ...DEFAULT_MAP_STYLE.label, color: '#000002', font: 'Inter', sizePt: 20 },
    markers: {
      ...DEFAULT_MAP_STYLE.markers,
      city: { kind: 'flag' as const, color: '#000003', stroke: '#000004', scale: 3 },
    },
    sizes: { marker: 9, badge: 9, vehicle: 9 },
    rough: { seed: 1, roughness: 1 },
  };

  it('takes every paint, the fonts and the marker shapes of the template', () => {
    const out = withTemplateLook(DEFAULT_MAP_STYLE, template);
    expect(templateLook(out)).toEqual(templateLook(normalizeStyle(template)));
    expect(out.land.fill).toBe('#000001');
    expect(out.land.stroke).toBeNull();
    expect(out.label.color).toBe('#000002');
    expect(out.markers.city.color).toBe('#000003');
    expect(out.label.font).toBe('Inter');
    expect(out.markers.city.kind).toBe('flag');
  });

  it('keeps everything else of the map', () => {
    const out = withTemplateLook(DEFAULT_MAP_STYLE, template);
    expect(out.land.width).toBe(DEFAULT_MAP_STYLE.land.width);
    expect(out.label.sizePt).toBe(DEFAULT_MAP_STYLE.label.sizePt);
    expect(out.markers.city.scale).toBe(DEFAULT_MAP_STYLE.markers.city.scale);
    expect(out.sizes).toEqual(DEFAULT_MAP_STYLE.sizes);
    expect(out.rough).toBeNull();
    expect(MapStyleSchema.safeParse(out).success).toBe(true);
  });

  it('edits neither input', () => {
    const before = structuredClone(DEFAULT_MAP_STYLE);
    withTemplateLook(DEFAULT_MAP_STYLE, template);
    expect(DEFAULT_MAP_STYLE).toEqual(before);
  });
});
