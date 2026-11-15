import { createHash } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  OFFLINE_SOURCE,
  type LibraryItem,
  type StickerHit,
  type StickerSearchQuery,
  type StickerSearchResult,
  type StickerSetInfo,
  type StickerSourceInfo,
} from '../../../shared/api';
import { appFetch } from '../../app-fetch';
import { userDataDir } from '../../user-data';
import { addToLibrary } from '../userLibrary';
import { DiskCache } from './cache';
import { listOfflineSets, offlineCategories, searchOffline, stickerSvg } from './offline';
import { createOnlineSources } from './online';
import { hasSourceKey, setSourceKey } from './sourceKeys';
import {
  MAX_DOWNLOAD_BYTES,
  SourceError,
  SourceHttp,
  assertPublicHttps,
  hasTransparency,
  userAgent,
  type StickerSource,
} from './source';

/** Stickers per page of an offline search. */
export const OFFLINE_PAGE_SIZE = 60;
/** Remote thumbnails are shrunk to this long edge (px) before they are cached and shown. */
export const THUMB_EDGE = 256;
const MAX_THUMB_BYTES = 8 * 1024 * 1024;
/** Hits remembered: enough for a long browsing session, bounded so memory cannot grow. */
const MAX_REMEMBERED = 3000;

/** `tb://remote-thumb/<key>`: key is 32 lower-case hex digits. */
export const THUMB_KEY = /^[0-9a-f]{32}$/;
const thumbKey = (url: string): string =>
  createHash('sha256').update(url).digest('hex').slice(0, 32);

interface Thumb {
  bytes: Buffer;
  opaque: boolean;
}

export interface StickerService {
  sets(): StickerSetInfo[];
  categories(setId: string): { name: string; count: number }[];
  sources(): Promise<StickerSourceInfo[]>;
  search(query: StickerSearchQuery): Promise<StickerSearchResult>;
  add(ref: { source: string; id: string }): Promise<LibraryItem>;
  addBytes(name: string, bytes: Uint8Array): Promise<LibraryItem>;
  isOpaque(ref: { source: string; id: string }): Promise<boolean | undefined>;
  setKey(sourceId: string, key: string): Promise<void>;
  /** The WebP thumbnail behind `tb://remote-thumb/<key>`, or `undefined` for a key never handed out. */
  thumb(key: string): Promise<Buffer | undefined>;
  /** The SVG behind `tb://sticker/<set>/<id>.svg`. */
  svg(setId: string, id: string): string | undefined;
}

export interface StickerServiceOptions {
  cacheDir: string;
  version: string;
  /** Test double for the network. */
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Replaces the three built-in sources (tests). */
  sources?: StickerSource[];
}

const hitKey = (source: string, id: string): string => `${source}\u0000${id}`;

/**
 * Everything the sticker panel asks of main: searching (offline packs or an online source),
 * keeping a result in the user library, and serving thumbnails. The renderer only ever names a
 * hit by `{ source, id }`; the URL to download comes from the hit main remembers, never from the
 * renderer, and the renderer's thumbnails are `tb://` addresses main answers from its own cache.
 */
export function createStickerService(options: StickerServiceOptions): StickerService {
  const online =
    options.sources ??
    createOnlineSources({
      cacheDir: options.cacheDir,
      version: options.version,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
  const sourceById = new Map(online.map((source) => [source.id, source]));

  /** Hits handed out, newest last; a Map keeps insertion order. */
  const hits = new Map<string, StickerHit>();
  const remember = (hit: StickerHit): void => {
    const key = hitKey(hit.source, hit.id);
    hits.delete(key);
    hits.set(key, hit);
    if (hits.size > MAX_REMEMBERED) hits.delete(hits.keys().next().value as string);
  };
  /** Remote thumbnail key to the URL main handed out for it. */
  const thumbUrls = new Map<string, string>();

  const thumbHttp = new SourceHttp({
    userAgent: userAgent(options.version),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
  const thumbCache = new DiskCache(
    join(options.cacheDir, 'thumbs'),
    options.now ? { now: options.now } : {},
  );

  /**
   * A thumbnail download in progress, by URL: a tile asks for its picture and for its opacity at
   * the same moment, and both share one download.
   */
  const loading = new Map<string, Promise<Thumb>>();
  function loadThumb(url: string): Promise<Thumb> {
    let pending = loading.get(url);
    if (pending === undefined) {
      pending = fetchThumb(url).finally(() => loading.delete(url));
      loading.set(url, pending);
    }
    return pending;
  }

  async function fetchThumb(url: string): Promise<Thumb> {
    const cached = await thumbCache.get(url);
    if (cached !== undefined) {
      try {
        const parsed = JSON.parse(cached) as { opaque: boolean; webp: string };
        return { opaque: parsed.opaque, bytes: Buffer.from(parsed.webp, 'base64') };
      } catch {
        // A damaged entry is a miss.
      }
    }
    const raw = await thumbHttp.bytes(assertPublicHttps(url).href, MAX_THUMB_BYTES);
    let bytes: Buffer;
    let opaque: boolean;
    try {
      opaque = !(await hasTransparency(raw));
      bytes = await sharp(raw)
        .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (error) {
      throw new SourceError('badAnswer', 'The thumbnail is not a usable image', { cause: error });
    }
    await thumbCache
      .set(url, JSON.stringify({ opaque, webp: bytes.toString('base64') }))
      .catch(() => undefined);
    return { bytes, opaque };
  }

  /** A hit as the renderer gets it: a remote thumbnail becomes a `tb://remote-thumb` address. */
  function outgoing(hit: StickerHit): StickerHit {
    remember(hit);
    if (hit.thumbUrl.startsWith('tb://')) return hit;
    const key = thumbKey(hit.thumbUrl);
    thumbUrls.set(key, hit.thumbUrl);
    return { ...hit, thumbUrl: `tb://remote-thumb/${key}`, fileUrl: '' };
  }

  async function search(query: StickerSearchQuery): Promise<StickerSearchResult> {
    const page = Math.max(1, Math.floor(query.page));
    if (query.source === OFFLINE_SOURCE) {
      const offset = (page - 1) * OFFLINE_PAGE_SIZE;
      const { items, total } = searchOffline(query.q, {
        ...(query.set !== undefined ? { set: query.set } : {}),
        ...(query.category !== undefined ? { category: query.category } : {}),
        ...(query.mono !== undefined ? { mono: query.mono } : {}),
        ...(query.noAttribution === true ? { noAttribution: true } : {}),
        ...(query.group !== undefined ? { group: query.group } : {}),
        ...(query.recommended === true ? { recommended: true } : {}),
        offset,
        limit: OFFLINE_PAGE_SIZE,
      });
      return { items: items.map(outgoing), hasMore: offset + items.length < total, total };
    }
    const source = sourceById.get(query.source);
    if (source === undefined) throw new Error(`Unknown sticker source: ${query.source}`);
    if (query.q.trim() === '') return { items: [], hasMore: false };
    const found = await source.search(query.q.trim(), page);
    return { items: found.items.map(outgoing), hasMore: found.hasMore };
  }

  function known(ref: { source: string; id: string }): StickerHit {
    const hit = hits.get(hitKey(ref.source, ref.id));
    if (hit === undefined) throw new SourceError('notFound', 'Unknown sticker: search again');
    return hit;
  }

  const tagsOf = (hit: StickerHit): string[] => [hit.source, ...(hit.mono ? ['monochrome'] : [])];

  return {
    sets: () => listOfflineSets(),
    categories: (setId) => offlineCategories(setId),
    async sources() {
      return Promise.all(
        online.map(async (source) => ({
          id: source.id,
          label: source.label,
          needsKey: source.needsKey,
          backgrounds: source.scope === 'backgrounds',
          hasKey: source.needsKey && (await hasSourceKey(source.id)),
        })),
      );
    },
    search,
    async add(ref) {
      const hit = known(ref);
      if (hit.source === OFFLINE_SOURCE || hit.thumbUrl.startsWith('tb://sticker/')) {
        const svg = stickerSvg(hit.source, hit.id);
        if (svg === undefined) throw new SourceError('notFound', 'The sticker is gone');
        return addToLibrary(
          'sticker',
          { bytes: Buffer.from(svg, 'utf8'), ext: 'svg' },
          { title: hit.title, tags: tagsOf(hit), licence: hit.licence },
        );
      }
      const source = sourceById.get(hit.source);
      if (source === undefined) throw new Error(`Unknown sticker source: ${hit.source}`);
      const { bytes, ext } = await source.fetch(hit);
      return addToLibrary(
        source.scope === 'backgrounds' ? 'background' : 'sticker',
        { bytes, ext },
        { title: hit.title, tags: tagsOf(hit), licence: hit.licence },
      );
    },
    async addBytes(name, bytes) {
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_DOWNLOAD_BYTES) {
        throw new SourceError('tooLarge', 'The image is empty or over the size limit');
      }
      const buffer = Buffer.from(bytes);
      let format: string | undefined;
      try {
        format = (await sharp(buffer).metadata()).format;
      } catch {
        format = undefined;
      }
      const ext =
        format === 'png'
          ? 'png'
          : format === 'jpeg'
            ? 'jpg'
            : format === 'webp'
              ? 'webp'
              : format === 'svg'
                ? 'svg'
                : undefined;
      if (ext === undefined) throw new Error('Unsupported image format');
      const title = name.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim() || 'Image';
      return addToLibrary('sticker', { bytes: buffer, ext }, { title });
    },
    async isOpaque(ref) {
      const hit = hits.get(hitKey(ref.source, ref.id));
      if (hit === undefined || hit.format === 'svg' || hit.thumbUrl.startsWith('tb://')) {
        return undefined;
      }
      try {
        return (await loadThumb(hit.thumbUrl)).opaque;
      } catch {
        return undefined;
      }
    },
    setKey: (sourceId, key) => {
      const source = sourceById.get(sourceId);
      if (source === undefined || !source.needsKey) {
        return Promise.reject(new Error(`${sourceId} does not take a key`));
      }
      return setSourceKey(sourceId, key);
    },
    async thumb(key) {
      const url = THUMB_KEY.test(key) ? thumbUrls.get(key) : undefined;
      if (url === undefined) return undefined;
      return (await loadThumb(url)).bytes;
    },
    svg: (setId, id) => stickerSvg(setId, id),
  };
}

let shared: Promise<StickerService> | null = null;

/**
 * The one service of the running app, made on first use (its cache lives in the user's data
 * folder, which is only known once the app is ready).
 */
export function getStickerService(version: () => string): Promise<StickerService> {
  shared ??= Promise.all([userDataDir(), appFetch()]).then(([dir, fetchImpl]) =>
    createStickerService({ cacheDir: join(dir, 'online-cache'), version: version(), fetchImpl }),
  );
  return shared;
}

/** Use `service` (or, with `null`, a fresh default one) from now on: tests. */
export function setStickerService(service: StickerService | null): void {
  shared = service === null ? null : Promise.resolve(service);
}
