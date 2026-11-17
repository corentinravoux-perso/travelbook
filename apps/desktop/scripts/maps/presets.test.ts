import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_STYLE,
  MapStyleSchema,
  normalizeStyle,
  type MapPreset,
  type MapStyle,
} from '@travelbook/core';

const RESOURCES_DIR = join(import.meta.dirname, '../../resources');
const PRESETS_DIR = join(RESOURCES_DIR, 'maps/presets');

/** The six built-in styles, in the order the dialog lists them, with their French names. */
const PRESETS = [
  ['ardoise', 'Ardoise'],
  ['safran', 'Safran'],
  ['carnet', 'Carnet'],
  ['encre', 'Encre'],
  ['crayon', 'Crayon'],
  ['pastel', 'Pastel'],
] as const;

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const preset = (id: string): MapPreset => readJson<MapPreset>(join(PRESETS_DIR, `${id}.json`));

interface FontList {
  fonts: { family: string; faces: { weight: number; style: string; file: string }[] }[];
}
const fontList = readJson<FontList>(join(RESOURCES_DIR, 'fonts.json'));

/** The bundled file of a face, or `undefined` when the family has no such weight and style. */
function faceFile(family: string, weight: number, style: 'normal' | 'italic'): string | undefined {
  const face = fontList.fonts
    .find((font) => font.family === family)
    ?.faces.find((f) => f.weight === weight && f.style === style);
  return face && join(RESOURCES_DIR, 'fonts', face.file);
}

describe('resources/maps/presets', () => {
  it('holds the six presets and nothing else', async () => {
    const files = (await readdir(PRESETS_DIR)).sort();
    expect(files).toEqual(PRESETS.map(([id]) => `${id}.json`).sort());
  });

  describe.each(PRESETS)('%s', (id, name) => {
    const { style, ...head } = preset(id);

    it('carries its id and its French name', () => {
      expect(head).toEqual({ id, name });
    });

    it('parses with MapStyleSchema, with no token missing and none unknown', () => {
      expect(MapStyleSchema.safeParse(style).success).toBe(true);
      expect(MapStyleSchema.parse(style)).toEqual(style);
      expect(normalizeStyle(style)).toEqual(style);
    });

    it('draws with bundled fonts: the labels (in italics for sights if asked) and the badge', () => {
      const { label, badge } = style;
      const wanted = [
        faceFile(label.font, label.weight, 'normal'),
        label.italicSights ? faceFile(label.font, label.weight, 'italic') : 'not asked',
        faceFile(badge.font, badge.weight, 'normal'),
      ];
      expect(wanted).not.toContain(undefined);
      for (const file of wanted.filter((f) => f !== 'not asked')) {
        expect(existsSync(file as string), `${file} exists`).toBe(true);
      }
    });

    it('draws its lakes: a fill or a stroke, apart from the land', () => {
      const { lakes, land } = style;
      expect(lakes.fill ?? lakes.stroke).not.toBeNull();
      if (lakes.fill !== null) expect(lakes.fill).not.toBe(land.fill);
      // An ink style paints no land: its lakes are an outline too.
      if (land.fill === null)
        expect(lakes).toMatchObject({ fill: null, stroke: expect.any(String) });
    });

    it('sets sizes in the 1..20 mm range, the full outline detail and no background of its own', () => {
      for (const size of Object.values(style.sizes)) {
        expect(size).toBeGreaterThanOrEqual(1);
        expect(size).toBeLessThanOrEqual(20);
      }
      expect(style.outline.detail).toBe(1);
      expect(head).not.toHaveProperty('background');
      expect(style).not.toHaveProperty('background');
    });

    it('is hand-drawn only when it is crayon', () => {
      if (id === 'crayon') {
        expect(style.rough).toEqual({ seed: expect.any(Number), roughness: expect.any(Number) });
      } else {
        expect(style.rough).toBeNull();
      }
    });
  });

  it('are six different looks', () => {
    const looks = PRESETS.map(([id]) => JSON.stringify(preset(id).style));
    expect(new Set(looks).size).toBe(6);
  });

  it('has carnet as the default style', () => {
    expect(preset('carnet').style).toEqual(DEFAULT_MAP_STYLE);
  });

  describe('the approved pilot looks', () => {
    /**
     * The tokens of the pilot (`presets.json` of the research folder), `colour` spelt `color`.
     * Label sizes were raised by the owner on 2026-11-17 (9.5 -> 11.5, 12.5 -> 14 pt).
     */
    const pilot: Record<string, Partial<MapStyle>> = {
      ardoise: {
        land: { fill: '#5b5f66', stroke: '#ffffff', width: 0.3 },
        regions: { stroke: '#ffffff', width: 0.22, dash: null },
        label: {
          font: 'Libre Baskerville',
          weight: 700,
          italicSights: false,
          sizePt: 11.5,
          color: '#111111',
          case: 'none',
          letterSpacingEm: 0,
          wordSpacingEm: -0.1,
          halo: { color: '#ffffff', width: 0.9 },
        },
        markers: {
          capital: { kind: 'flag', color: '#ffffff', stroke: '#111111', scale: 1.3 },
          city: { kind: 'flag', color: '#ffffff', stroke: '#111111', scale: 1 },
          sight: { kind: 'flag', color: '#f4c542', stroke: '#111111', scale: 0.85 },
        } as MapStyle['markers'],
      },
      safran: {
        land: { fill: '#e8741e', stroke: null, width: 0 },
        regions: { stroke: null, width: 0, dash: null },
        label: {
          font: 'Bebas Neue',
          weight: 400,
          italicSights: false,
          sizePt: 14,
          color: '#1b2a49',
          case: 'upper',
          letterSpacingEm: 0.14,
          wordSpacingEm: -0.1,
          halo: { color: '#fff4e0', width: 0.8 },
        },
        markers: {
          capital: { kind: 'pin', color: '#1b2a49', stroke: '#fff4e0', scale: 1.3 },
          city: { kind: 'pin', color: '#fff4e0', stroke: '#1b2a49', scale: 1 },
          sight: { kind: 'pin', color: '#0f766e', stroke: '#fff4e0', scale: 0.9 },
        } as MapStyle['markers'],
      },
      carnet: {
        land: { fill: '#f4e7c9', stroke: '#8b5e3c', width: 0.55 },
        regions: { stroke: '#d6c196', width: 0.15, dash: null },
        label: {
          font: 'Lora',
          weight: 700,
          italicSights: true,
          sizePt: 11.5,
          color: '#4a2f1a',
          case: 'none',
          letterSpacingEm: 0,
          wordSpacingEm: -0.1,
          halo: { color: '#fbf4e2', width: 0.8 },
        },
        markers: {
          capital: { kind: 'point', color: '#8b3a12', stroke: '#fbf4e2', scale: 1.5 },
          city: { kind: 'point', color: '#8b5e3c', stroke: '#fbf4e2', scale: 1 },
          sight: { kind: 'star', color: '#c2410c', stroke: '#fbf4e2', scale: 1 },
        } as MapStyle['markers'],
        route: {
          voiture: { color: '#e2571e', width: 0.7, dash: [2.2, 1.5] },
          avion: { color: '#1f3a5f', width: 0.6, dash: [0.01, 1.7] },
        } as MapStyle['route'],
        badge: { fill: '#e2571e', text: '#ffffff', stroke: '#fbf4e2', font: 'Caveat', weight: 700 },
      },
    };

    it.each(Object.keys(pilot))('keeps the %s tokens', (id) => {
      expect(preset(id).style).toMatchObject(pilot[id] as object);
    });
  });

  describe('the three new looks', () => {
    it('encre paints no land: a fine black outline, small dots', () => {
      const { land, outline, markers, label } = preset('encre').style;
      expect(land.fill).toBeNull();
      expect(outline.color).toBe('#111111');
      expect(outline.width).toBeLessThanOrEqual(0.3);
      expect(markers.city.kind).toBe('point');
      expect(markers.city.scale).toBeLessThanOrEqual(1);
      expect(label.font).toBe('Inter');
    });

    it('crayon is hand-drawn in a handwritten face', () => {
      const { rough, label } = preset('crayon').style;
      expect(rough).not.toBeNull();
      expect(label.font).toBe('Kalam');
    });

    it('pastel sets white labels in Lilita One, haloed to stay legible', () => {
      const { label, land } = preset('pastel').style;
      expect(label.font).toBe('Lilita One');
      expect(label.color.toLowerCase()).toBe('#ffffff');
      expect(label.halo.width).toBeGreaterThan(0);
      expect(label.halo.color.toLowerCase()).not.toBe('#ffffff');
      expect(land.fill).not.toBeNull();
    });
  });

  it('is listed in LICENCES.json as our own work, under the repository licence', () => {
    const own = readJson<{
      entries: { files: string[]; source: string; author: string; licence: string; url: string }[];
    }>(join(RESOURCES_DIR, 'LICENCES.json'));
    const entry = own.entries.find((e) => e.files.some((f) => f.startsWith('maps/presets/')));
    expect(entry).toMatchObject({
      source: 'travelbook',
      author: 'Corentin Ravoux',
      licence: 'MIT',
      url: 'https://github.com/corentinravoux/travelbook',
    });
    expect([...(entry?.files ?? [])].sort()).toEqual(
      PRESETS.map(([id]) => `maps/presets/${id}.json`).sort(),
    );
  });
});
