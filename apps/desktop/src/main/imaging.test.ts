import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from './imaging';

/** Every source file of the main process, tests left out. */
async function sources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sources(path)));
    else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('imaging', () => {
  it('keeps no image file open between operations (Windows cannot delete or replace one)', () => {
    const { files } = sharp.cache() as { files: { max: number } };
    expect(files.max).toBe(0);
  });

  it('is the only way the main process reaches sharp', async () => {
    const here = import.meta.dirname;
    const direct: string[] = [];
    for (const file of await sources(here)) {
      if (file === join(here, 'imaging.ts')) continue;
      if (/from 'sharp'/.test(await readFile(file, 'utf8'))) direct.push(relative(here, file));
    }
    expect(direct).toEqual([]);
  });
});
