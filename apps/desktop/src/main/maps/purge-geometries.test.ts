import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newBook, type AssetRef, type Book } from '@travelbook/core';
import { mapElement } from '@travelbook/core/src/map/test-helpers';
import { writeSnapshot } from '../project/snapshots';
import { purgeGeometries } from './purge-geometries';

const USED = 'aaaaaaaaaaaaaaaa';
const IN_SNAPSHOT = 'bbbbbbbbbbbbbbbb';
const ORPHAN = 'cccccccccccccccc';

let project: string;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'tb-purge-'));
  await mkdir(join(project, 'assets'), { recursive: true });
});
afterEach(() => rm(project, { recursive: true, force: true }));

const mapAsset = (hash: string): AssetRef => ({
  id: `map-${hash}`,
  kind: 'map',
  file: `assets/${hash}.json`,
  originalName: 'Thaïlande.json',
  sha256: hash.repeat(4),
});

/** A book whose first spread holds one map drawn from the geometry `hash`. */
function bookWithMap(hash: string): Book {
  const book = newBook({ title: 'T' });
  book.spreads[0]!.elements.push({ ...mapElement(), geometryAssetId: `map-${hash}` });
  book.assets = { [`map-${hash}`]: mapAsset(hash) };
  return book;
}

/** Write `assets/<name>` dated an hour ago (older than any purge started now). */
async function oldFile(name: string): Promise<void> {
  const path = join(project, 'assets', name);
  await writeFile(path, '{}');
  const past = new Date(Date.now() - 3_600_000);
  await utimes(path, past, past);
}

const assets = async () => (await readdir(join(project, 'assets'))).sort();

describe('purgeGeometries', () => {
  beforeEach(async () => {
    for (const hash of [USED, IN_SNAPSHOT, ORPHAN]) await oldFile(`${hash}.json`);
  });

  it('deletes only the geometry that neither the book nor a snapshot uses', async () => {
    await writeSnapshot(project, bookWithMap(IN_SNAPSHOT), 'auto');
    const deleted = await purgeGeometries(project, bookWithMap(USED));
    expect(deleted).toEqual([`${ORPHAN}.json`]);
    expect(await assets()).toEqual([`${USED}.json`, `${IN_SNAPSHOT}.json`]);
  });

  it('keeps a geometry referenced only by an asset entry or only by a map element', async () => {
    const byAsset = newBook({ title: 'T' });
    byAsset.assets = { [`map-${USED}`]: mapAsset(USED) };
    const byElement = bookWithMap(IN_SNAPSHOT);
    byElement.assets = {};
    // (A snapshot drops the asset entries no element uses, so the book carries that case.)
    await writeSnapshot(project, byElement, 'manual');
    expect(await purgeGeometries(project, byAsset)).toEqual([`${ORPHAN}.json`]);
  });

  it('never touches files that are not geometries', async () => {
    for (const name of ['font-1.woff2', 'sticker.svg', 'ABCDEFABCDEFABCD.json', 'readme.txt']) {
      await oldFile(name);
    }
    await purgeGeometries(project, bookWithMap(USED));
    expect(await assets()).toEqual(
      ['ABCDEFABCDEFABCD.json', 'font-1.woff2', 'readme.txt', 'sticker.svg', `${USED}.json`].sort(),
    );
  });

  it('deletes nothing when a snapshot cannot be read', async () => {
    await writeSnapshot(project, bookWithMap(IN_SNAPSHOT), 'auto');
    await writeFile(join(project, 'history', '2026-01-02T03-04-05-006Z-auto.json'), '{ broken');
    expect(await purgeGeometries(project, bookWithMap(USED))).toEqual([]);
    expect(await assets()).toHaveLength(3);
  });

  it('keeps a geometry written after the purge started', async () => {
    await writeFile(join(project, 'assets', 'dddddddddddddddd.json'), '{}');
    const future = new Date(Date.now() + 60_000);
    await utimes(join(project, 'assets', 'dddddddddddddddd.json'), future, future);
    expect(await purgeGeometries(project, bookWithMap(USED))).not.toContain(
      'dddddddddddddddd.json',
    );
  });

  it('does nothing for a project without assets or history', async () => {
    await rm(join(project, 'assets'), { recursive: true });
    expect(await purgeGeometries(project, newBook({ title: 'T' }))).toEqual([]);
  });
});
