import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newBook } from '@travelbook/core';
import { afterEach, describe, expect, it } from 'vitest';
import { handleTbRequest } from '../protocol';
import { closeSession, openSession, recordAssets, tbRoots } from '../session';
import { saveGeometryAsset } from './geometry-asset';

let dir = '';
afterEach(async () => {
  closeSession();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('tb://asset serving of a geometry asset saved during the session', () => {
  it('serves the file written by saveGeometryAsset, as the renderer cache asks for it', async () => {
    dir = await mkdtemp(join(tmpdir(), 'tb-geom-'));
    const session = openSession(dir, newBook({ title: 'A' }));
    const text = JSON.stringify({
      version: 1,
      projection: { kind: 'mercator', rotate: [0, 0, 0], k: 600, tx: 500, ty: 300 },
      bounds: [
        [0, 0],
        [1000, 600],
      ],
      remoteBounds: [
        [0, 0],
        [1000, 600],
      ],
      paths: {
        land: 'M0 0H1000V600H0Z',
        outline: 'M0 0H1000V600H0Z',
        regions: '',
        selected: '',
        neighbours: '',
        lakes: '',
      },
    });
    // The same two steps as the `maps:saveGeometry` handler.
    const asset = await saveGeometryAsset(dir, text, { name: 'Thaïlande' });
    recordAssets(session, [asset]);
    const roots = tbRoots(session, { libraryDir: dir, resourcesDir: dir });
    const res = await handleTbRequest(
      { url: `tb://asset/${asset.id}?v=original`, method: 'GET' },
      {
        roots: () => roots,
        ensureProxy: async () => undefined,
        fetchFile: async (path) => new Response(await readFile(path)),
      },
    );
    expect(asset.id).toMatch(/^map-[0-9a-f]{16}$/);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(text);
  });
});
