import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUserDataDir } from '../user-data';
import { folderFitsTitle, matchFolderToTitle } from './folder';

let work: string;
beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'tb-folder-'));
  setUserDataDir(join(work, 'user'));
});
afterEach(async () => {
  setUserDataDir(null);
  await rm(work, { recursive: true, force: true });
});

describe('folderFitsTitle', () => {
  it('takes the name a new album of that title gets, with or without its number', () => {
    expect(folderFitsTitle('perou-alex.travelbook', 'Pérou - Alex')).toBe(true);
    expect(folderFitsTitle('perou-alex-3.travelbook', 'Pérou - Alex')).toBe(true);
    expect(folderFitsTitle('perou.travelbook', 'Pérou - Alex')).toBe(false);
    expect(folderFitsTitle('perou-alex-x.travelbook', 'Pérou - Alex')).toBe(false);
    expect(folderFitsTitle('Mon album', 'Mon album')).toBe(false);
  });
});

describe('matchFolderToTitle', () => {
  it('renames the folder where it is, to the first free name', async () => {
    const dir = join(work, 'brouillon.travelbook');
    await mkdir(dir);
    await mkdir(join(work, 'islande.travelbook'));
    expect(await matchFolderToTitle(dir, 'Islande')).toBe(join(work, 'islande-2.travelbook'));
    expect((await readdir(work)).filter((n) => n.endsWith('.travelbook')).sort()).toEqual([
      'islande-2.travelbook',
      'islande.travelbook',
    ]);
  });

  it('keeps a folder whose name fits, and one that cannot be renamed', async () => {
    const dir = join(work, 'islande.travelbook');
    await mkdir(dir);
    expect(await matchFolderToTitle(dir, 'ISLANDE')).toBe(dir);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const gone = join(work, 'parti.travelbook');
    expect(await matchFolderToTitle(gone, 'Japon')).toBe(gone);
  });
});
