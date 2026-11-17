import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assetFromSvg } from './from-svg';

let work: string;
let project: string;
const licence = {
  source: 'travelbook',
  author: 'Corentin Ravoux',
  licence: 'MIT',
  url: 'https://github.com/corentinravoux-perso/travelbook',
  requiresAttribution: false,
};
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path class="tb-main" fill="#123456" d="M0 0h10v10H0z"/></svg>';

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'tb-fromsvg-'));
  project = join(work, 'Été 2026', 'mon livre.travelbook');
  await mkdir(project, { recursive: true });
});
afterEach(() => rm(work, { recursive: true, force: true }));

describe('assetFromSvg', () => {
  it('stores the SVG once and returns a sticker asset with its licence', async () => {
    const a = await assetFromSvg(project, svg, { name: 'Japon, torii', licence });
    const b = await assetFromSvg(project, svg, { name: 'Japon, torii', licence });
    expect(b.id).toBe(a.id);
    expect(a).toMatchObject({ kind: 'sticker', originalName: 'Japon, torii.svg', licence });
    expect(a.id).toMatch(/^sticker-[0-9a-f]{16}$/);
    expect(a.file).toBe(`assets/${a.id.slice('sticker-'.length)}.svg`);
    expect(await readdir(join(project, 'assets'))).toEqual([a.file.slice('assets/'.length)]);
    expect(await readFile(join(project, a.file), 'utf8')).toContain('#123456');
  });

  it('gives a different recolouring its own asset', async () => {
    const a = await assetFromSvg(project, svg, { name: 'a', licence });
    const b = await assetFromSvg(project, svg.replace('#123456', '#654321'), {
      name: 'a',
      licence,
    });
    expect(b.id).not.toBe(a.id);
  });

  it('sanitises the SVG before storing it', async () => {
    const evil = svg.replace('</svg>', '<script>alert(1)</script></svg>');
    const a = await assetFromSvg(project, evil, { name: 'x', licence });
    expect(await readFile(join(project, a.file), 'utf8')).not.toContain('script');
  });

  it("keeps a drawing without a licence licence-less (the user's own file)", async () => {
    const a = await assetFromSvg(project, svg, { name: 'Mon dessin' });
    expect(a.originalName).toBe('Mon dessin.svg');
    expect('licence' in a).toBe(false);
  });

  it('refuses what is not an SVG', async () => {
    await expect(assetFromSvg(project, 'hello', { name: 'x', licence })).rejects.toThrow();
  });
});
