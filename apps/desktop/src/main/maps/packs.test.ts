import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUserDataDir } from '../user-data';
import { createPackLoader, loadPack, setMapsResourcesDir } from './packs';

const OVERTURE = '2026-10-21.0';
const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const THAILAND = JSON.stringify({ type: 'Topology', objects: { TH: 'fine pack of Thailand' } });
const PERU = JSON.stringify({ type: 'Topology', objects: { PE: 'fine pack of Peru' } });
const BUNDLED = JSON.stringify({ type: 'Topology', objects: { GB: 'bundled pack of Britain' } });

interface Seen {
  url: string;
  userAgent: string | undefined;
}

let work: string;
let mapsDir: string;
let cacheDir: string;
let server: Server;
let baseUrl: string;
let seen: Seen[];
let handler: (req: IncomingMessage, res: ServerResponse) => void;
const open = new Set<import('node:net').Socket>();

/** The address of a port nothing listens on: a server that is down. */
async function deadUrl(): Promise<string> {
  const dead = createServer();
  await new Promise<void>((resolve) => dead.listen(0, '127.0.0.1', resolve));
  const { port } = dead.address() as AddressInfo;
  await new Promise<void>((resolve) => dead.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

async function writeIndex(
  packs: Record<string, { file: string; body: string; bundled: boolean } | null>,
  overture = OVERTURE,
): Promise<void> {
  const subjects = Object.entries(packs).map(([id, pack]) => ({
    id,
    name: id,
    file: `subjects/${id}.topo.json`,
    sha256: 'f'.repeat(64),
    pack:
      pack === null
        ? null
        : {
            file: `packs/${pack.file}`,
            sha256: sha(pack.body),
            bytes: Buffer.byteLength(pack.body),
            bundled: pack.bundled,
            mode: 'finest',
          },
  }));
  await writeFile(join(mapsDir, 'index.json'), JSON.stringify({ overture, built: 'x', subjects }));
}

const serveFiles =
  (files: Record<string, string>) =>
  (req: IncomingMessage, res: ServerResponse): void => {
    const body = files[req.url ?? ''];
    if (body === undefined) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(body);
  };

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'tb-packs-'));
  mapsDir = join(work, 'resources', 'maps');
  cacheDir = join(work, 'user data', 'maps');
  await mkdir(join(mapsDir, 'packs'), { recursive: true });
  seen = [];
  handler = serveFiles({
    [`/geodata-${OVERTURE}/TH.topo.json`]: THAILAND,
    [`/geodata-${OVERTURE}/PE.topo.json`]: PERU,
  });
  server = createServer((req, res) => {
    seen.push({ url: req.url ?? '', userAgent: req.headers['user-agent'] });
    handler(req, res);
  });
  server.on('connection', (socket) => {
    open.add(socket);
    socket.on('close', () => open.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await writeIndex({
    TH: { file: 'TH.topo.json', body: THAILAND, bundled: false },
    PE: { file: 'PE.topo.json', body: PERU, bundled: false },
    GB: { file: 'GB.topo.json', body: BUNDLED, bundled: true },
    XX: null,
  });
  await writeFile(join(mapsDir, 'packs', 'GB.topo.json'), BUNDLED);
});

afterEach(async () => {
  for (const socket of open) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(work, { recursive: true, force: true });
});

const loader = (extra: Partial<Parameters<typeof createPackLoader>[0]> = {}) =>
  createPackLoader({
    mapsDir,
    cacheDir,
    releasesUrl: baseUrl,
    userAgent: 'travelbook/1.2.3 (personal desktop app)',
    timeoutMs: 2000,
    ...extra,
  });

const cacheFiles = (): Promise<string[]> => readdir(cacheDir).catch(() => []);

describe('loadPack: a pack that ships with the app', () => {
  it('is read from the resources, with no request', async () => {
    const result = await loader()('GB');
    expect(result).toEqual({ ok: true, json: BUNDLED });
    expect(seen).toEqual([]);
    expect(await cacheFiles()).toEqual([]);
  });

  it('is checked against its sha, and a damaged copy is fetched instead', async () => {
    await writeFile(join(mapsDir, 'packs', 'GB.topo.json'), 'damaged');
    handler = serveFiles({ [`/geodata-${OVERTURE}/GB.topo.json`]: BUNDLED });
    expect(await loader()('GB')).toEqual({ ok: true, json: BUNDLED });
    expect(seen).toHaveLength(1);
  });
});

describe('loadPack: a pack that is downloaded', () => {
  it('is fetched from the geodata release by its file name and cached under that name', async () => {
    const result = await loader()('TH');
    expect(result).toEqual({ ok: true, json: THAILAND });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(`/geodata-${OVERTURE}/TH.topo.json`);
    expect(await cacheFiles()).toEqual(['TH.topo.json']);
    expect(await readFile(join(cacheDir, 'TH.topo.json'), 'utf8')).toBe(THAILAND);
  });

  it('sends the app User-Agent and nothing personal', async () => {
    await loader()('TH');
    expect(seen[0]!.userAgent).toBe('travelbook/1.2.3 (personal desktop app)');
  });

  it('is served from the cache the second time, without the network', async () => {
    expect(await loader()('TH')).toMatchObject({ ok: true });
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error('the network must not be used');
    });
    expect(await loader({ fetchImpl })('TH')).toEqual({ ok: true, json: THAILAND });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(seen).toHaveLength(1);
  });

  it('is served from a cache that was there before, with the server down', async () => {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, 'TH.topo.json'), THAILAND);
    expect(await loader({ releasesUrl: await deadUrl() })('TH')).toEqual({
      ok: true,
      json: THAILAND,
    });
  });

  it('replaces a cached file whose sha is wrong', async () => {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, 'TH.topo.json'), 'truncated');
    expect(await loader()('TH')).toEqual({ ok: true, json: THAILAND });
    expect(await readFile(join(cacheDir, 'TH.topo.json'), 'utf8')).toBe(THAILAND);
  });

  it('follows the redirect of a GitHub release asset', async () => {
    handler = (req, res) => {
      if (req.url === `/geodata-${OVERTURE}/TH.topo.json`) {
        res.writeHead(302, { location: '/objects/abc' }).end();
      } else if (req.url === '/objects/abc') {
        res.writeHead(200).end(THAILAND);
      } else {
        res.writeHead(404).end();
      }
    };
    expect(await loader()('TH')).toEqual({ ok: true, json: THAILAND });
  });

  it('shares one download between calls made at the same time', async () => {
    const [a, b] = await Promise.all([loader()('TH'), loader()('TH')]);
    expect(a).toEqual({ ok: true, json: THAILAND });
    expect(b).toEqual(a);
    expect(seen).toHaveLength(1);
  });
});

describe('loadPack: when it cannot give the pack', () => {
  it('refuses a download whose sha is wrong: checksum, and nothing is written', async () => {
    handler = serveFiles({
      [`/geodata-${OVERTURE}/TH.topo.json`]: THAILAND.replace('fine', 'FINE'),
    });
    expect(await loader()('TH')).toEqual({ ok: false, reason: 'checksum' });
    expect(await cacheFiles()).toEqual([]);
  });

  it('refuses a download longer than the index says, without reading it all', async () => {
    handler = serveFiles({ [`/geodata-${OVERTURE}/TH.topo.json`]: THAILAND + ' '.repeat(5000) });
    expect(await loader()('TH')).toEqual({ ok: false, reason: 'checksum' });
    expect(await cacheFiles()).toEqual([]);
  });

  it('says offline when the server is down and nothing is cached', async () => {
    expect(await loader({ releasesUrl: await deadUrl() })('TH')).toEqual({
      ok: false,
      reason: 'offline',
    });
    expect(await cacheFiles()).toEqual([]);
  });

  it('says offline when the release has no such file (404) or fails (500)', async () => {
    handler = (_req, res) => void res.writeHead(404).end();
    expect(await loader()('TH')).toEqual({ ok: false, reason: 'offline' });
    handler = (_req, res) => void res.writeHead(500).end();
    expect(await loader()('TH')).toEqual({ ok: false, reason: 'offline' });
    expect(await cacheFiles()).toEqual([]);
  });

  it('says offline when the server never answers', async () => {
    handler = () => undefined;
    expect(await loader({ timeoutMs: 150 })('TH')).toEqual({ ok: false, reason: 'offline' });
  });

  it('says offline when the answer is cut in the middle', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-length': String(Buffer.byteLength(THAILAND)) });
      res.write(THAILAND.slice(0, 10));
      setTimeout(() => res.destroy(), 20);
    };
    expect(await loader()('TH')).toEqual({ ok: false, reason: 'offline' });
    expect(await cacheFiles()).toEqual([]);
  });

  it('says unknown for a subject without a pack, and for one the index does not list', async () => {
    expect(await loader()('XX')).toEqual({ ok: false, reason: 'unknown' });
    expect(await loader()('ZZ')).toEqual({ ok: false, reason: 'unknown' });
    expect(seen).toEqual([]);
  });

  it('says unknown for a pack whose file name is not a plain pack name', async () => {
    const index = JSON.parse(await readFile(join(mapsDir, 'index.json'), 'utf8')) as {
      subjects: { id: string; pack: { file: string } | null }[];
    };
    index.subjects.find((s) => s.id === 'TH')!.pack!.file = 'packs/../../evil.topo.json';
    await writeFile(join(mapsDir, 'index.json'), JSON.stringify(index));
    expect(await loader()('TH')).toEqual({ ok: false, reason: 'unknown' });
    expect(seen).toEqual([]);
  });

  it('rejects when the index is missing: the app is broken, not offline', async () => {
    await rm(join(mapsDir, 'index.json'));
    await expect(loader()('TH')).rejects.toThrow(/index/i);
  });
});

describe('loadPack: the pack of the real index', () => {
  const RESOURCES = join(import.meta.dirname, '../../../resources');

  it('reads the bundled US pack of the app from resources/maps, sha checked', async () => {
    const real = createPackLoader({
      mapsDir: join(RESOURCES, 'maps'),
      cacheDir,
      releasesUrl: baseUrl,
      userAgent: 'travelbook/1.2.3 (personal desktop app)',
    });
    const result = await real('US');
    expect(result.ok).toBe(true);
    expect(JSON.parse((result as { json: string }).json)).toHaveProperty('type', 'Topology');
    expect(seen).toEqual([]);
  });
});

describe('the app-wide loadPack', () => {
  beforeEach(() => {
    setUserDataDir(join(work, 'user data'));
    setMapsResourcesDir(join(work, 'resources'));
  });
  afterEach(() => {
    setUserDataDir(null);
    setMapsResourcesDir(null);
  });

  it('keeps downloaded packs in <userData>/maps, and reads one from there', async () => {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, 'PE.topo.json'), PERU);
    expect(await loadPack('PE', () => '1.2.3')).toEqual({ ok: true, json: PERU });
  });

  it('reads a bundled pack from the resources it was told about', async () => {
    expect(await loadPack('GB', () => '1.2.3')).toEqual({ ok: true, json: BUNDLED });
  });

  it('says unknown for a subject without a pack', async () => {
    expect(await loadPack('XX', () => '1.2.3')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('fails when the resources are not located', async () => {
    setMapsResourcesDir(null);
    await expect(loadPack('GB', () => '1.2.3')).rejects.toThrow(/not located/);
  });
});
