import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setUserDataDir } from '../../user-data';
import { hasSourceKey, setSourceKey, sourceKey } from './sourceKeys';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tb-keys-'));
  setUserDataDir(dir);
});
afterEach(async () => {
  setUserDataDir(null);
  await rm(dir, { recursive: true, force: true });
});

describe('source keys', () => {
  it('has no key before one is stored, and no file', async () => {
    expect(await hasSourceKey('flickr')).toBe(false);
    expect(await sourceKey('flickr')).toBeUndefined();
  });

  it('stores a trimmed key per source, and forgets it when blank', async () => {
    await setSourceKey('flickr', '  abc  ');
    await setSourceKey('other', 'xyz');
    expect(await sourceKey('flickr')).toBe('abc');
    expect(await hasSourceKey('other')).toBe(true);
    await setSourceKey('flickr', '   ');
    expect(await hasSourceKey('flickr')).toBe(false);
    expect(JSON.parse(await readFile(join(dir, 'source-keys.json'), 'utf8'))).toEqual({
      other: 'xyz',
    });
  });

  it('reads a damaged file as empty', async () => {
    await setSourceKey('a', 'b');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, 'source-keys.json'), '{nope');
    expect(await hasSourceKey('a')).toBe(false);
  });
});
