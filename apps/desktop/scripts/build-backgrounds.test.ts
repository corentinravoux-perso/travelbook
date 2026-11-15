import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { patternTiles } from './backgrounds/patterns';
import { TEXTURE_HEIGHT, TEXTURE_WIDTH } from './backgrounds/textures';
import {
  LIST_FILE,
  PATTERNS_DIR,
  RESOURCES_DIR,
  TEXTURES_DIR,
  entries,
  type BackgroundEntry,
} from './build-backgrounds';

const list = async (): Promise<BackgroundEntry[]> =>
  JSON.parse(await readFile(LIST_FILE, 'utf8')) as BackgroundEntry[];

describe('the bundled backgrounds', () => {
  it('list every file of resources/patterns and resources/textures, each with a licence', async () => {
    const listed = await list();
    const files = [
      ...(await readdir(PATTERNS_DIR)).map((n) => `patterns/${n}`),
      ...(await readdir(TEXTURES_DIR)).map((n) => `textures/${n}`),
    ];
    const byFile = new Map(listed.map((e) => [e.file, e]));
    expect(files.filter((f) => !byFile.has(f))).toEqual([]);
    expect(listed.filter((e) => !files.includes(e.file)).map((e) => e.file)).toEqual([]);
    for (const e of listed) {
      expect(e.licence, `${e.file} licence`).toMatch(/\S/);
      expect(e.source, `${e.file} source`).toMatch(/\S/);
      expect(e.author, `${e.file} author`).toMatch(/\S/);
      expect(e.url, `${e.file} url`).toMatch(/\S/);
      expect(e.file.startsWith(`${e.kind}s/`)).toBe(true);
    }
    expect(new Set(listed.map((e) => e.title)).size).toBe(listed.length);
  });

  it('are our own work, released as CC0', async () => {
    for (const e of await list()) {
      expect(e.licence).toBe('CC0-1.0');
      expect(e.author).toBe('travelbook');
    }
  });

  it('hold at least 60 patterns and 20 textures', async () => {
    const listed = await list();
    expect(listed.filter((e) => e.kind === 'pattern').length).toBeGreaterThanOrEqual(60);
    expect(listed.filter((e) => e.kind === 'texture').length).toBeGreaterThanOrEqual(20);
  });

  it('match the generator (the list and every tile)', async () => {
    expect(await list()).toEqual(entries());
    for (const tile of patternTiles()) {
      expect(await readFile(join(PATTERNS_DIR, `${tile.id}.svg`), 'utf8')).toBe(tile.svg);
    }
  });

  it('keep patterns as plain stencils: black shapes, no script, no external reference', () => {
    for (const tile of patternTiles()) {
      expect(tile.svg, tile.id).toMatch(/^<svg [^>]*viewBox="0 0 100 100"/);
      expect(tile.svg, tile.id).not.toMatch(/<script|href|url\(|<style/i);
      expect(tile.svg.match(/#[0-9a-f]{3,6}/gi)?.every((c) => c === '#000')).toBe(true);
    }
  });

  it('keep textures small: at most 1600 px on the long edge and 300 kB', async () => {
    for (const e of (await list()).filter((x) => x.kind === 'texture')) {
      const path = join(RESOURCES_DIR, e.file);
      expect((await stat(path)).size, e.file).toBeLessThanOrEqual(300 * 1024);
      const meta = await sharp(path).metadata();
      expect(meta.width).toBe(TEXTURE_WIDTH);
      expect(meta.height).toBe(TEXTURE_HEIGHT);
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1600);
    }
  });
});
