import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newBook, newElement, type AssetRef } from '@travelbook/core';
import { CLIPBOARD_TYPE, readElements, writeElements, type ClipboardHost } from './clipboard';
import { openSession, type Session } from './session';

let root: string;
let from: Session;
let to: Session;
let store: Map<string, string>;
const clipboard: ClipboardHost = {
  write: async (type, data) => void store.set(type, data),
  read: async (type) => store.get(type) ?? null,
};

const bytes = Buffer.from('not really a jpeg');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const asset: AssetRef = {
  id: 'abcd1234abcd1234',
  kind: 'photo',
  file: 'originals/abcd1234abcd1234.jpg',
  originalName: 'a.jpg',
  sha256,
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tb-clipboard-'));
  store = new Map();
  const a = join(root, 'a.travelbook');
  const b = join(root, 'b.travelbook');
  await mkdir(join(a, 'originals'), { recursive: true });
  await mkdir(b);
  await writeFile(join(a, asset.file), bytes);
  from = openSession(a, newBook({ title: 'A' }));
  to = openSession(b, newBook({ title: 'B' }));
});
afterEach(() => rm(root, { recursive: true, force: true }));

const photo = () => ({ ...newElement('photo', { x: 0, y: 0, w: 10, h: 10 }), assetId: asset.id });
const origin = { bookId: 'b', spreadId: 's' };

describe('clipboard of elements', () => {
  it('copies the files of missing assets into the open project', async () => {
    const el = photo();
    await writeElements(clipboard, from, { origin, elements: [el], assets: [asset] });
    expect(store.has(CLIPBOARD_TYPE)).toBe(true);
    const got = await readElements(clipboard, to);
    expect(got?.elements).toEqual([el]);
    expect(got?.assets).toEqual([asset]);
    expect(await readFile(join(to.dir, asset.file))).toEqual(bytes);
    expect(to.assets.has(asset.id)).toBe(true);
  });

  it('copies nothing for an asset the project already holds', async () => {
    to.assets.set(asset.id, asset);
    await writeElements(clipboard, from, { origin, elements: [photo()], assets: [asset] });
    await readElements(clipboard, to);
    await expect(stat(join(to.dir, asset.file))).rejects.toThrow();
  });

  it('refuses a file that does not match its recorded hash', async () => {
    await writeElements(clipboard, from, {
      origin,
      elements: [photo()],
      assets: [{ ...asset, sha256: '0'.repeat(64) }],
    });
    await expect(readElements(clipboard, to)).rejects.toThrow();
    await expect(stat(join(to.dir, asset.file))).rejects.toThrow();
  });

  it('refuses an asset path that leaves the source album', async () => {
    await writeElements(clipboard, from, {
      origin,
      elements: [photo()],
      assets: [{ ...asset, file: 'originals/../book.json' }],
    });
    await expect(readElements(clipboard, to)).rejects.toThrow();
  });

  it('answers null for an empty clipboard and for data that is not ours', async () => {
    expect(await readElements(clipboard, to)).toBeNull();
    store.set(CLIPBOARD_TYPE, '{"nope":1}');
    expect(await readElements(clipboard, to)).toBeNull();
    store.set(CLIPBOARD_TYPE, 'not json');
    expect(await readElements(clipboard, to)).toBeNull();
  });
});
