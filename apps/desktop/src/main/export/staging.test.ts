import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STAGING_PREFIX, createStaging, publishStaged } from './staging';

describe('staging folder of a run', () => {
  let work: string;
  beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), 'travelbook-staging-test-'));
  });
  afterEach(() => rm(work, { recursive: true, force: true }));

  const out = (): string => join(work, 'out');

  describe('createStaging', () => {
    it('makes the output folder and a hidden folder of its own inside it', async () => {
      const staging = await createStaging(out());
      expect(staging.startsWith(join(out(), STAGING_PREFIX))).toBe(true);
      expect(await readdir(out())).toEqual([staging.slice(out().length + 1)]);
      expect(STAGING_PREFIX.startsWith('.')).toBe(true);
      // Two runs never share a folder.
      expect(await createStaging(out())).not.toBe(staging);
    });

    it('removes the staging folders a crashed run left behind, and nothing else', async () => {
      await mkdir(join(out(), `${STAGING_PREFIX}crashed`, 'pages'), { recursive: true });
      await writeFile(join(out(), `${STAGING_PREFIX}crashed`, 'pages', '1'), 'x');
      await mkdir(join(out(), '.git'));
      await writeFile(join(out(), 'page-001.jpg'), 'earlier export');
      await writeFile(join(out(), `${STAGING_PREFIX}file-not-folder`), 'mine');
      const staging = await createStaging(out());
      expect((await readdir(out())).sort()).toEqual(
        [
          '.git',
          'page-001.jpg',
          `${STAGING_PREFIX}file-not-folder`,
          staging.slice(out().length + 1),
        ].sort(),
      );
    });
  });

  describe('publishStaged', () => {
    const stage = async (files: Record<string, string>): Promise<string> => {
      const staging = await createStaging(out());
      for (const [name, text] of Object.entries(files)) await writeFile(join(staging, name), text);
      return staging;
    };

    it('moves the files into the output folder and returns their paths', async () => {
      const staging = await stage({ 'a.pdf': 'A', 'b.pdf': 'B' });
      expect(await publishStaged(staging, out(), ['a.pdf', 'b.pdf'])).toEqual([
        join(out(), 'a.pdf'),
        join(out(), 'b.pdf'),
      ]);
      expect(await readFile(join(out(), 'a.pdf'), 'utf8')).toBe('A');
      expect(await readFile(join(out(), 'b.pdf'), 'utf8')).toBe('B');
    });

    it('replaces the earlier files of the same names and leaves the others alone', async () => {
      await mkdir(out());
      await writeFile(join(out(), 'a.pdf'), 'old A');
      await writeFile(join(out(), 'other.txt'), 'mine');
      const staging = await stage({ 'a.pdf': 'new A' });
      await publishStaged(staging, out(), ['a.pdf']);
      expect(await readFile(join(out(), 'a.pdf'), 'utf8')).toBe('new A');
      expect(await readFile(join(out(), 'other.txt'), 'utf8')).toBe('mine');
    });

    it('puts every earlier file back when one move fails: no mix of old and new', async () => {
      await mkdir(out());
      await writeFile(join(out(), 'a.pdf'), 'old A');
      await writeFile(join(out(), 'b.pdf'), 'old B');
      // `b.pdf` was never staged: its move fails after `a.pdf` was replaced.
      const staging = await stage({ 'a.pdf': 'new A' });
      await expect(publishStaged(staging, out(), ['a.pdf', 'b.pdf'])).rejects.toThrow();
      expect(await readFile(join(out(), 'a.pdf'), 'utf8')).toBe('old A');
      expect(await readFile(join(out(), 'b.pdf'), 'utf8')).toBe('old B');
    });

    it('removes the files it had already put in when one move fails and nothing was there before', async () => {
      const staging = await stage({ 'a.pdf': 'new A' });
      await expect(publishStaged(staging, out(), ['a.pdf', 'b.pdf'])).rejects.toThrow();
      expect(await readdir(out())).toEqual([staging.slice(out().length + 1)]);
    });
  });
});
