import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import type { PackResult } from '../../shared/api';
import { appFetch } from '../app-fetch';
import { userAgent } from '../library/stickers/source';
import { writeFileAtomic } from '../project/atomic-write';
import { userDataDir } from '../user-data';

/** Where the geodata releases of the travelbook repository are: `<this>/geodata-<overture>/<file>`. */
export const RELEASES_URL = 'https://github.com/corentinravoux-perso/travelbook/releases/download';

/** A pack is a few MB: this is long enough for a slow link, short enough to give up on a stall. */
const DOWNLOAD_TIMEOUT_MS = 60_000;

const PackSchema = z.object({
  file: z.string().regex(/^packs\/[A-Za-z0-9._-]+\.topo\.json$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().positive(),
  bundled: z.boolean(),
});
type Pack = z.infer<typeof PackSchema>;

const IndexSchema = z.object({
  /** The Overture release the data is built from; the geodata release is named after it. */
  overture: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
  /** `pack` is checked subject by subject: one odd entry must not take the others down. */
  subjects: z.array(z.object({ id: z.string(), pack: z.unknown() })),
});

interface PackIndex {
  overture: string;
  /** The subjects that have a well-formed pack. */
  packs: Map<string, Pack>;
}

/** `<maps folder>/index.json`: which subject has which pack, and its checksum. */
async function readIndex(mapsDir: string): Promise<PackIndex> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(mapsDir, 'index.json'), 'utf8'));
  } catch (error) {
    throw new Error('The maps index is missing or unreadable', { cause: error });
  }
  const parsed = IndexSchema.safeParse(raw);
  if (!parsed.success) throw new Error('The maps index is not an index');
  const packs = new Map<string, Pack>();
  for (const subject of parsed.data.subjects) {
    const pack = PackSchema.safeParse(subject.pack);
    if (pack.success) packs.set(subject.id, pack.data);
  }
  return { overture: parsed.data.overture, packs };
}

const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** The file's bytes when it exists and its sha is `sha256`; `null` otherwise. */
async function readVerified(path: string, sha256: string): Promise<Buffer | null> {
  try {
    const bytes = await readFile(path);
    return sha256Of(bytes) === sha256 ? bytes : null;
  } catch {
    return null;
  }
}

const found = (bytes: Buffer): PackResult => ({ ok: true, json: bytes.toString('utf8') });

export interface PackLoaderOptions {
  /** `<resources>/maps`: `index.json` and the bundled packs. */
  mapsDir: string;
  /** Where downloaded packs are kept: `<userData>/maps`. */
  cacheDir: string;
  /** The folder of the geodata releases; the release and file name are added. */
  releasesUrl?: string;
  /** `travelbook/<version> (personal desktop app)`: never an email address or a name. */
  userAgent: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

type Downloaded = { kind: 'bytes'; bytes: Buffer } | { kind: 'offline' } | { kind: 'tooLong' };

/**
 * GET `url` and read at most `maxBytes` of the answer. No answer, a status that is not a success
 * (the release not published yet, a server error, a rate limit) and a connection that drops
 * while the body is read are all `offline`: the pack is out of reach, whatever the reason. An
 * answer longer than `maxBytes` stops being read at once.
 */
async function download(
  url: string,
  maxBytes: number,
  options: PackLoaderOptions,
): Promise<Downloaded> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': options.userAgent, Accept: '*/*' },
    });
    if (!response.ok || response.body === null) {
      await response.body?.cancel().catch(() => undefined);
      return { kind: 'offline' };
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { kind: 'tooLong' };
      }
      chunks.push(value);
    }
    return { kind: 'bytes', bytes: Buffer.concat(chunks) };
  } catch {
    return { kind: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/** Downloads in progress, by cache file: two callers asking for one pack share one request. */
const downloading = new Map<string, Promise<PackResult>>();

/**
 * Give the fine pack of a subject (spec 7.2). `index.json` says which subjects have one and
 * what its sha256 is. In order: the copy that ships with the app (`bundled`), the copy kept in
 * the cache folder, the download from the geodata release. Every copy is checked against the
 * index's sha256, the downloaded one before it is written (atomically), so a wrong or cut file
 * is never kept and never returned.
 *
 * `{ ok: false }` says why: `unknown` (the index has no pack for that id), `offline` (no copy
 * and the download did not answer) or `checksum` (the download answered with another file).
 * It rejects only when the index itself cannot be read: that is a broken install, not a
 * situation the dialog can explain.
 */
export function createPackLoader(
  options: PackLoaderOptions,
): (subjectId: string) => Promise<PackResult> {
  return async (subjectId) => {
    const index = await readIndex(options.mapsDir);
    const pack = index.packs.get(subjectId);
    if (pack === undefined) return { ok: false, reason: 'unknown' };

    if (pack.bundled) {
      const bundled = await readVerified(join(options.mapsDir, pack.file), pack.sha256);
      if (bundled !== null) return found(bundled);
    }

    const name = basename(pack.file);
    const cached = join(options.cacheDir, name);
    const kept = await readVerified(cached, pack.sha256);
    if (kept !== null) return found(kept);

    const pending = downloading.get(cached);
    if (pending !== undefined) return pending;
    const url = `${options.releasesUrl ?? RELEASES_URL}/geodata-${index.overture}/${name}`;
    const task = (async (): Promise<PackResult> => {
      const got = await download(url, pack.bytes, options);
      if (got.kind === 'offline') return { ok: false, reason: 'offline' };
      if (got.kind === 'tooLong' || sha256Of(got.bytes) !== pack.sha256) {
        return { ok: false, reason: 'checksum' };
      }
      try {
        await mkdir(options.cacheDir, { recursive: true });
        await writeFileAtomic(cached, got.bytes);
      } catch (error) {
        // The pack is good: the cache is a convenience, and the next call fetches it again.
        console.warn(`Could not keep the map pack ${name}:`, error);
      }
      return found(got.bytes);
    })();
    downloading.set(cached, task);
    try {
      return await task;
    } finally {
      downloading.delete(cached);
    }
  };
}

let resourcesDir: string | null = null;

/** Tell the module where the bundled resources are (`null` forgets them). */
export function setMapsResourcesDir(dir: string | null): void {
  resourcesDir = dir;
}

/**
 * `createPackLoader` on the app's folders: the bundled `resources/maps`, `<userData>/maps` for
 * the cache, Electron's network stack (`appFetch`), and the app's User-Agent.
 */
export async function loadPack(subjectId: string, version: () => string): Promise<PackResult> {
  if (resourcesDir === null) throw new Error('The bundled maps are not located');
  const [dir, fetchImpl] = await Promise.all([userDataDir(), appFetch()]);
  return createPackLoader({
    mapsDir: join(resourcesDir, 'maps'),
    cacheDir: join(dir, 'maps'),
    userAgent: userAgent(version()),
    fetchImpl,
  })(subjectId);
}
