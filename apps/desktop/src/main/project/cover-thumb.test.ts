import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { coverDirOf, coverId, coverThumbUrl, writeCoverThumb } from './cover-thumb';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tb-cover-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('cover ids', () => {
  it('are stable, plain identifiers that lead back to the folder', () => {
    const id = coverId('/p/a.travelbook');
    expect(id).toBe(coverId('/p/a.travelbook'));
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(coverDirOf(id)).toBe('/p/a.travelbook');
    expect(coverId('/p/b.travelbook')).not.toBe(id);
  });

  it('are unknown until main hands them out', () => {
    expect(coverDirOf('0123456789abcdef')).toBeUndefined();
  });
});

describe('the cover thumbnail file', () => {
  it('is absent until written, then named by a tb://cover URL', async () => {
    expect(await coverThumbUrl(dir)).toBeUndefined();
    await writeCoverThumb(dir, new Uint8Array([1, 2, 3]));
    expect([...(await readFile(join(dir, 'cache', 'cover-thumb.jpg')))]).toEqual([1, 2, 3]);
    expect(await coverThumbUrl(dir)).toMatch(/^tb:\/\/cover\/[0-9a-f]{16}\?v=\d+$/);
  });

  it('is replaced by a later write', async () => {
    await writeCoverThumb(dir, new Uint8Array([1]));
    await writeCoverThumb(dir, new Uint8Array([9, 9]));
    expect([...(await readFile(join(dir, 'cache', 'cover-thumb.jpg')))]).toEqual([9, 9]);
  });
});
