/**
 * The poster presets (`resources/posters/presets/<destination>.json`) and the illustrations they
 * use (`resources/posters/illustrations/`). Checks the presets of the destinations present only.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { PosterPresetSchema, type PosterPreset } from '@travelbook/core';
import { POSTERS_DIR, destinationOf, type Destination } from './affiches-set.ts';
import { lintIllustration } from './lint-illustration.ts';

const read = <T>(file: string): T => JSON.parse(readFileSync(join(POSTERS_DIR, file), 'utf8')) as T;
const destinations = read<Destination[]>('destinations.json');
const keywords = read<Record<string, string[]>>('keywords.json');
const illustrationIds = readdirSync(join(POSTERS_DIR, 'illustrations'))
  .filter((n) => n.endsWith('.svg'))
  .map((n) => n.slice(0, -4))
  .sort();
const presetFiles = readdirSync(join(POSTERS_DIR, 'presets')).filter((n) => n.endsWith('.json'));
const svgOf = (id: string) => readFileSync(join(POSTERS_DIR, 'illustrations', `${id}.svg`), 'utf8');

describe('poster destinations', () => {
  it('are the 13 of the design, with unique kebab-case ids', () => {
    expect(destinations).toHaveLength(13);
    const ids = destinations.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

describe('poster illustrations', () => {
  it('have ASCII kebab-case ids that start with a destination', () => {
    for (const id of illustrationIds) {
      expect(id, id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
      expect(destinationOf(id, destinations), id).toBeDefined();
    }
  });

  it('follow the drawing rules', () => {
    for (const id of illustrationIds) expect(lintIllustration(svgOf(id)), id).toEqual([]);
  });

  it('have French keywords, and no keyword entry lacks its file', () => {
    for (const id of illustrationIds) expect(keywords[id]?.length ?? 0, id).toBeGreaterThan(1);
    expect(Object.keys(keywords).filter((id) => !illustrationIds.includes(id))).toEqual([]);
  });

  it('stand on the bottom edge of their viewBox', async () => {
    for (const id of illustrationIds) {
      const { data, info } = await sharp(Buffer.from(svgOf(id)))
        .resize({ width: 200 })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const row = info.height - 1;
      let opaque = 0;
      for (let x = 0; x < info.width; x++) {
        if (data[(row * info.width + x) * info.channels + 3]! > 128) opaque++;
      }
      expect(opaque, `${id}: opaque pixels on the bottom row`).toBeGreaterThan(0);
    }
  });
});

describe('poster presets', () => {
  const byFile = presetFiles.map((file) => ({
    file,
    raw: read<unknown[]>(join('presets', file)),
  }));
  const presets: PosterPreset[] = [];

  it('parse, one file per destination', () => {
    for (const { file, raw } of byFile) {
      expect(Array.isArray(raw), file).toBe(true);
      for (const entry of raw) {
        const parsed = PosterPresetSchema.safeParse(entry);
        expect(parsed.success, `${file}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
        if (!parsed.success) continue;
        expect(`${parsed.data.destination}.json`, parsed.data.id).toBe(file);
        presets.push(parsed.data);
      }
    }
    const ids = presets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('name a known destination and an existing illustration of it', () => {
    for (const p of presets) {
      expect(
        destinations.some((d) => d.id === p.destination),
        p.id,
      ).toBe(true);
      const ill = p.spec.illustration;
      expect('set' in ill && ill.set === 'affiches', p.id).toBe(true);
      if (!('set' in ill)) continue;
      expect(existsSync(join(POSTERS_DIR, 'illustrations', `${ill.id}.svg`)), p.id).toBe(true);
      expect(destinationOf(ill.id, destinations)?.id, p.id).toBe(p.destination);
    }
  });

  it('have unique names (the gallery tiles are found by name)', () => {
    const names = presets.map((p) => p.name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it('share the global design: Lilita One, or Anton for the Géant posters', () => {
    for (const p of presets) {
      expect(p.spec.font, p.id).toBe(p.spec.layout === 'geant' ? 'Anton' : 'Lilita One');
    }
  });

  it('give each destination present at least 3 presets, one or more in the naturel family', () => {
    const by = new Map<string, PosterPreset[]>();
    for (const p of presets) by.set(p.destination, [...(by.get(p.destination) ?? []), p]);
    for (const [destination, list] of by) {
      expect(list.length, destination).toBeGreaterThanOrEqual(3);
      const naturel = list.filter((p) => {
        const ill = p.spec.illustration;
        return 'set' in ill && /data-tb-style="naturel"/.test(svgOf(ill.id));
      });
      expect(naturel.length, destination).toBeGreaterThanOrEqual(1);
    }
  });

  it('use every illustration of a destination that has presets', () => {
    const used = new Set(
      presets.map((p) => ('set' in p.spec.illustration ? p.spec.illustration.id : '')),
    );
    const withPresets = new Set(presets.map((p) => p.destination));
    const unused = illustrationIds.filter(
      (id) => withPresets.has(destinationOf(id, destinations)!.id) && !used.has(id),
    );
    expect(unused).toEqual([]);
  });
});
