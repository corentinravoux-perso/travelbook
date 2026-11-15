import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildStickerPacks } from '../../../../scripts/build-sticker-packs';
import type { StickerHit } from '../../../shared/api';
import { setUserDataDir } from '../../user-data';
import { listLibrary } from '../userLibrary';
import { setStickersResourcesDir } from './offline';
import { createStickerService, OFFLINE_PAGE_SIZE, type StickerService } from './service';
import { SourceError, type StickerSource } from './source';

const RESOURCES = join(import.meta.dirname, '../../../../resources');
const LICENCE = {
  source: 'Openverse',
  author: 'Ada',
  licence: 'CC-BY-4.0',
  url: 'https://example.org/page',
  requiresAttribution: true,
};

beforeAll(async () => {
  await buildStickerPacks({ log: () => undefined });
  setStickersResourcesDir(RESOURCES);
}, 300_000);
afterAll(() => setStickersResourcesDir(null));

let work: string;
beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'tb-stickers-svc-'));
  setUserDataDir(join(work, 'user'));
});
afterEach(async () => {
  setUserDataDir(null);
  await rm(work, { recursive: true, force: true });
});

const png = (alpha: number): Promise<Buffer> =>
  sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 200, g: 0, b: 0, alpha } },
  })
    .png()
    .toBuffer();

const hitOf = (id: string, thumbUrl: string): StickerHit => ({
  source: 'fake',
  id,
  title: `Titre ${id}`,
  thumbUrl,
  fileUrl: `https://files.example.org/${id}.png`,
  format: 'png',
  licence: LICENCE,
  mono: false,
});

function make(options: { fetchImpl?: typeof fetch; search?: StickerSource['search'] } = {}) {
  const fake: StickerSource = {
    id: 'fake',
    label: 'Fake',
    needsKey: false,
    search: options.search ?? (async () => ({ items: [], hasMore: false })),
    fetch: async () => ({ bytes: await png(255), ext: 'png' as const }),
  };
  return createStickerService({
    cacheDir: join(work, 'cache'),
    version: '0.0.0',
    sources: [fake],
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
}

describe('offline search', () => {
  it('pages the results and tells whether more follow', async () => {
    const svc = make();
    const first = await svc.search({ source: 'offline', q: '', page: 1 });
    expect(first.items).toHaveLength(OFFLINE_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    expect(first.total).toBeGreaterThan(OFFLINE_PAGE_SIZE);
    expect(first.items[0]?.thumbUrl).toMatch(/^tb:\/\/sticker\//);
    const last = await svc.search({
      source: 'offline',
      q: '',
      page: Math.ceil((first.total as number) / OFFLINE_PAGE_SIZE),
    });
    expect(last.hasMore).toBe(false);
  });

  it('finds an aeroplane from its French name and lists set categories', async () => {
    const svc = make();
    const found = await svc.search({ source: 'offline', q: 'avion', page: 1 });
    expect(found.items.length).toBeGreaterThan(0);
    const sets = svc.sets();
    expect(sets.length).toBeGreaterThan(10);
    const cats = svc.categories(sets[0]!.id);
    expect(cats.length).toBeGreaterThan(1);
    expect(cats[0]!.count).toBeGreaterThanOrEqual(cats[1]!.count);
  });

  it('keeps a found sticker in the library with its licence, once', async () => {
    const svc = make();
    const [hit] = (await svc.search({ source: 'offline', q: 'avion', page: 1 })).items;
    const item = await svc.add(hit!);
    expect(item.kind).toBe('sticker');
    expect(item.title).toBe(hit!.title);
    expect(item.licence).toEqual(hit!.licence);
    expect((await svc.add(hit!)).id).toBe(item.id);
    expect(await listLibrary('sticker')).toHaveLength(1);
  });

  it('refuses a sticker it never handed out', async () => {
    await expect(make().add({ source: 'noto', id: 'airplane' })).rejects.toMatchObject({
      kind: 'notFound',
    });
  });
});

describe('online search and thumbnails', () => {
  it('serves remote thumbnails through tb://remote-thumb and hides the file URL', async () => {
    const thumb = 'https://thumbs.example.org/a.png';
    const svc = make({
      search: async () => ({ items: [hitOf('a', thumb)], hasMore: true }),
    });
    const res = await svc.search({ source: 'fake', q: 'x', page: 1 });
    const hit = res.items[0]!;
    expect(res.hasMore).toBe(true);
    expect(hit.thumbUrl).toMatch(/^tb:\/\/remote-thumb\/[0-9a-f]{32}$/);
    expect(hit.fileUrl).toBe('');
    expect(JSON.stringify(res)).not.toContain('example.org/a.png');
  });

  it('fetches a thumbnail once, shrinks it to WebP, and answers from the cache after', async () => {
    const body = await png(255);
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(body)));
    const svc = make({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      search: async () => ({
        items: [hitOf('a', 'https://thumbs.example.org/a.png')],
        hasMore: false,
      }),
    });
    const { items } = await svc.search({ source: 'fake', q: 'x', page: 1 });
    const key = items[0]!.thumbUrl.split('/').pop()!;
    const bytes = await svc.thumb(key);
    expect((await sharp(bytes).metadata()).format).toBe('webp');
    await svc.thumb(key);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('downloads a thumbnail once when the tile and the opacity check ask for it together', async () => {
    // Each tile asks for its picture and for its opacity at the same moment: two downloads of
    // the same file doubled the requests and drew Wikimedia's rate limit.
    const body = await png(255);
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(body)));
    const svc = make({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      search: async () => ({
        items: [hitOf('a', 'https://thumbs.example.org/a.png')],
        hasMore: false,
      }),
    });
    const { items } = await svc.search({ source: 'fake', q: 'x', page: 1 });
    const key = items[0]!.thumbUrl.split('/').pop()!;
    const [bytes, opaque] = await Promise.all([
      svc.thumb(key),
      svc.isOpaque({ source: 'fake', id: 'a' }),
    ]);
    expect(bytes).toBeDefined();
    expect(opaque).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('answers undefined for a key it never handed out, without any request', async () => {
    const fetchImpl = vi.fn();
    const svc = make({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await svc.thumb('f'.repeat(32))).toBeUndefined();
    expect(await svc.thumb('../../etc')).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a thumbnail on a private address', async () => {
    const fetchImpl = vi.fn();
    const svc = make({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      search: async () => ({ items: [hitOf('a', 'https://127.0.0.1/a.png')], hasMore: false }),
    });
    const key = (await svc.search({ source: 'fake', q: 'x', page: 1 })).items[0]!.thumbUrl.split(
      '/',
    ).pop()!;
    await expect(svc.thumb(key)).rejects.toBeInstanceOf(SourceError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('tells an opaque raster from one with transparency', async () => {
    const bodies: Record<string, Buffer> = {
      'https://t.example.org/solid.png': await png(255),
      'https://t.example.org/clear.png': await png(0.4),
    };
    const svc = make({
      fetchImpl: (async (url: string) =>
        new Response(new Uint8Array(bodies[url]!))) as unknown as typeof fetch,
      search: async () => ({
        items: [
          hitOf('solid', 'https://t.example.org/solid.png'),
          hitOf('clear', 'https://t.example.org/clear.png'),
        ],
        hasMore: false,
      }),
    });
    await svc.search({ source: 'fake', q: 'x', page: 1 });
    expect(await svc.isOpaque({ source: 'fake', id: 'solid' })).toBe(true);
    expect(await svc.isOpaque({ source: 'fake', id: 'clear' })).toBe(false);
    expect(await svc.isOpaque({ source: 'fake', id: 'unknown' })).toBeUndefined();
  });

  it('downloads and keeps an online sticker with its licence', async () => {
    const svc = make({
      search: async () => ({
        items: [hitOf('a', 'https://thumbs.example.org/a.png')],
        hasMore: false,
      }),
    });
    const [hit] = (await svc.search({ source: 'fake', q: 'x', page: 1 })).items;
    const item = await svc.add(hit!);
    expect(item.licence).toEqual(LICENCE);
    expect(item.file).toMatch(/\.png$/);
  });

  it('passes a source failure on with its kind, and needs a query', async () => {
    const svc = make({
      search: async () => {
        throw new SourceError('rateLimited', 'slow down');
      },
    });
    await expect(svc.search({ source: 'fake', q: 'x', page: 1 })).rejects.toMatchObject({
      kind: 'rateLimited',
    });
    expect(await svc.search({ source: 'fake', q: '  ', page: 1 })).toEqual({
      items: [],
      hasMore: false,
    });
    await expect(svc.search({ source: 'nope', q: 'x', page: 1 })).rejects.toThrow(/Unknown/);
  });
});

describe('my own images and keys', () => {
  let svc: StickerService;
  beforeEach(() => {
    svc = make();
  });

  it('keeps pasted PNG bytes and an SVG, sniffing the format, not the name', async () => {
    const item = await svc.addBytes('paste.jpg', new Uint8Array(await png(255)));
    expect(item.file).toMatch(/\.png$/);
    expect(item.title).toBe('paste');
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4"/></svg>',
    );
    expect((await svc.addBytes('logo.png', svg)).file).toMatch(/\.svg$/);
  });

  it('refuses bytes that are not an image, and empty bytes', async () => {
    await expect(svc.addBytes('a.png', new TextEncoder().encode('hello'))).rejects.toThrow();
    await expect(svc.addBytes('a.png', new Uint8Array())).rejects.toMatchObject({
      kind: 'tooLarge',
    });
  });

  it('lists sources with their key state and refuses a key for a source without one', async () => {
    expect(await svc.sources()).toEqual([
      { id: 'fake', label: 'Fake', needsKey: false, backgrounds: false, hasKey: false },
    ]);
    await expect(svc.setKey('fake', 'abc')).rejects.toThrow(/does not take a key/);
  });
});
