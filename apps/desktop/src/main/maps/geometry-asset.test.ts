import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAP_LICENCE } from '@travelbook/core';
import { saveGeometryAsset } from './geometry-asset';

let work: string;
let project: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'tb-geometry-'));
  project = join(work, 'Été 2026', 'mon livre.travelbook');
  await mkdir(project, { recursive: true });
});
afterEach(() => rm(work, { recursive: true, force: true }));

const geometry = JSON.stringify({ v: 1, paths: ['M0 0L10 10Z'], label: 'Thaïlande' });

describe('saveGeometryAsset', () => {
  it('stores the same JSON once, under one id', async () => {
    const a = await saveGeometryAsset(project, geometry, { name: 'Thaïlande' });
    const b = await saveGeometryAsset(project, geometry, { name: 'Thaïlande' });
    expect(b).toEqual(a);
    expect(a.id).toMatch(/^map-[0-9a-f]{16}$/);
    expect(a.file).toBe(`assets/${a.id.slice('map-'.length)}.json`);
    expect(await readdir(join(project, 'assets'))).toEqual([a.file.slice('assets/'.length)]);
  });

  it('returns a map asset: its name, the sha of the bytes and the ODbL licence', async () => {
    const asset = await saveGeometryAsset(project, geometry, { name: 'Thaïlande' });
    const sha256 = createHash('sha256').update(geometry, 'utf8').digest('hex');
    expect(asset).toMatchObject({ kind: 'map', originalName: 'Thaïlande.json', sha256 });
    expect(asset.id).toBe(`map-${sha256.slice(0, 16)}`);
    expect(asset.licence).toEqual(MAP_LICENCE);
    expect(asset.licence?.licence).toBe('ODbL 1.0');
    expect(asset.licence?.requiresAttribution).toBe(true);
  });

  it('keeps the text exactly as given', async () => {
    const asset = await saveGeometryAsset(project, geometry, { name: 'x' });
    expect(await readFile(join(project, asset.file), 'utf8')).toBe(geometry);
  });

  it('gives other geometry its own asset', async () => {
    const a = await saveGeometryAsset(project, geometry, { name: 'a' });
    const b = await saveGeometryAsset(project, geometry.replace('10 10', '20 20'), { name: 'a' });
    expect(b.id).not.toBe(a.id);
    expect(await readdir(join(project, 'assets'))).toHaveLength(2);
  });

  it('hands out a licence of its own, so editing the asset cannot change the shared one', async () => {
    const asset = await saveGeometryAsset(project, geometry, { name: 'a' });
    expect(asset.licence).not.toBe(MAP_LICENCE);
  });

  it('leaves no temporary file behind', async () => {
    await saveGeometryAsset(project, geometry, { name: 'a' });
    expect((await readdir(join(project, 'assets'))).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('refuses what is not a JSON object', async () => {
    for (const bad of ['', 'not json', '[1,2]', '42', 'null', '"text"']) {
      await expect(saveGeometryAsset(project, bad, { name: 'x' })).rejects.toThrow(/JSON object/);
    }
    await expect(readdir(join(project, 'assets'))).rejects.toThrow();
  });
});
