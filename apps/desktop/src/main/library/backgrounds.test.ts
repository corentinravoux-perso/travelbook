import { mkdtemp, rm, mkdir, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bundledBackgrounds,
  importBundledBackground,
  loadBundledBackgrounds,
  setBackgroundsResourcesDir,
} from './backgrounds';

const RESOURCES = join(import.meta.dirname, '../../../resources');
let project: string;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'tb-bg-'));
  setBackgroundsResourcesDir(RESOURCES);
});
afterEach(async () => {
  setBackgroundsResourcesDir(null);
  await rm(project, { recursive: true, force: true });
});

describe('loadBundledBackgrounds', () => {
  it('loads the shipped list with a licence on every entry', async () => {
    const all = await loadBundledBackgrounds(RESOURCES);
    expect(all.filter((b) => b.kind === 'pattern').length).toBeGreaterThanOrEqual(60);
    expect(all.filter((b) => b.kind === 'texture').length).toBeGreaterThanOrEqual(20);
    expect(all.every((b) => b.licence.licence === 'CC0-1.0')).toBe(true);
  });

  it('leaves out entries that are malformed, mis-filed, repeated or missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tb-bg-res-'));
    try {
      await mkdir(join(dir, 'patterns'));
      await writeFile(join(dir, 'patterns', 'a.svg'), '<svg/>');
      const ok = {
        file: 'patterns/a.svg',
        kind: 'pattern',
        title: 'A',
        source: 's',
        author: 'a',
        licence: 'CC0-1.0',
        url: 'u',
      };
      await writeFile(
        join(dir, 'backgrounds.json'),
        JSON.stringify([
          ok,
          ok,
          { ...ok, file: 'patterns/missing.svg' },
          { ...ok, file: '../x.svg' },
          { ...ok, kind: 'texture' },
          { ...ok, file: 'patterns/b.svg', licence: '' },
        ]),
      );
      expect((await loadBundledBackgrounds(dir)).map((b) => b.file)).toEqual(['patterns/a.svg']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('importBundledBackground', () => {
  it('copies a pattern as an asset of kind pattern, with its licence', async () => {
    const first = (await bundledBackgrounds()).find((b) => b.kind === 'pattern')!;
    const asset = await importBundledBackground(project, first.file);
    expect(asset.kind).toBe('pattern');
    expect(asset.id).toMatch(/^pattern-[0-9a-f]{16}$/);
    expect(asset.licence?.licence).toBe('CC0-1.0');
    expect(asset.originalName).toBe(`${first.title}.svg`);
    expect((await stat(join(project, asset.file))).isFile()).toBe(true);
  });

  it('copies a texture as an asset of kind background, measured', async () => {
    const first = (await bundledBackgrounds()).find((b) => b.kind === 'texture')!;
    const asset = await importBundledBackground(project, first.file);
    expect(asset.kind).toBe('background');
    expect(asset.pixel).toEqual({ w: 1131, h: 1600 });
  });

  it('refuses a file the list does not name', async () => {
    await expect(importBundledBackground(project, 'patterns/nope.svg')).rejects.toThrow(
      /Not a bundled background/,
    );
  });
});
