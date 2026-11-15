import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixturePath } from '../../../../../../tests/fixtures/make-fixtures';
import { CACHE_TTL_MS, DiskCache } from './cache';
import { createCommonsSource } from './commons';
import { createIconifySource } from './iconify';
import { createOnlineSources } from './online';
import { createOpenversePhotosSource, createOpenverseSource } from './openverse';
import {
  MAX_DOWNLOAD_BYTES,
  SourceError,
  SourceHttp,
  hasTransparency,
  userAgent,
  type SourceErrorKind,
  type StickerHit,
  type StickerSource,
} from './source';

// Recorded on 2026-11-14 from the live endpoints (Iconify's answer trimmed to five icons); the
// tests never touch the network.
const recorded = (name: string): Promise<string> =>
  readFile(join(import.meta.dirname, 'fixtures', name), 'utf8');

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** A `fetch` answering from a function, remembering every call. */
function fakeFetch(handler: Handler): {
  fetchImpl: typeof fetch;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const json = (text: string, status = 200): Response =>
  new Response(text, { status, headers: { 'content-type': 'application/json' } });

let cacheDir: string;
beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'tb-sticker-cache-'));
});
afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

const cached = async (id: string): Promise<string[]> =>
  readdir(join(cacheDir, id)).catch(() => [] as string[]);

type Make = (http: SourceHttp) => StickerSource;
const ADAPTERS: { id: string; make: Make; answer: string }[] = [
  { id: 'iconify', make: createIconifySource, answer: 'iconify-search-suitcase.json' },
  { id: 'openverse', make: createOpenverseSource, answer: 'openverse-search-suitcase.json' },
  { id: 'commons', make: createCommonsSource, answer: 'commons-search-suitcase.json' },
];

function httpFor(id: string, fetchImpl: typeof fetch, now?: () => number): SourceHttp {
  return new SourceHttp({
    userAgent: userAgent('1.2.3'),
    fetchImpl,
    cache: new DiskCache(join(cacheDir, id), now ? { now } : {}),
  });
}

function expectComplete(hit: StickerHit): void {
  expect(hit.id).not.toBe('');
  expect(hit.title).not.toBe('');
  expect(hit.fileUrl).toMatch(/^https:\/\//);
  expect(hit.thumbUrl).toMatch(/^https:\/\//);
  expect(hit.licence.source).not.toBe('');
  expect(hit.licence.author).toBeTruthy();
  expect(hit.licence.licence).not.toBe('');
  expect(hit.licence.url).toMatch(/^https:\/\//);
  expect(typeof hit.licence.requiresAttribution).toBe('boolean');
}

describe('adapters map a recorded answer', () => {
  it('iconify: icons with the licence of their set, never from a set we may not use', async () => {
    const { fetchImpl, calls } = fakeFetch(async () =>
      json(await recorded('iconify-search-suitcase.json')),
    );
    const source = createIconifySource(httpFor('iconify', fetchImpl));
    const { items, hasMore } = await source.search('suitcase', 1);
    // All five sets are MIT, Apache-2.0 or CC-BY: none is dropped.
    expect(items).toHaveLength(5);
    items.forEach(expectComplete);
    const iconoir = items.find((i) => i.id === 'iconoir:suitcase') as StickerHit;
    expect(iconoir).toMatchObject({
      source: 'iconify',
      title: 'Suitcase',
      format: 'svg',
      mono: true,
      fileUrl: 'https://api.iconify.design/iconoir/suitcase.svg',
      licence: { licence: 'MIT', requiresAttribution: false, author: 'Luca Burgio' },
    });
    expect(items.find((i) => i.id === 'solar:suitcase-bold')?.licence).toMatchObject({
      licence: 'CC-BY-4.0',
      requiresAttribution: true,
    });
    expect(hasMore).toBe(true); // the answer is as long as its limit: there may be more
    expect(calls[0]?.url).toBe('https://api.iconify.design/search?query=suitcase&limit=48&start=0');
  });

  it('iconify: drops a set whose licence is not allowed, and an icon without its set', async () => {
    const answer = JSON.parse(await recorded('iconify-search-suitcase.json'));
    answer.collections.uil.license = { title: 'GPL 3', spdx: 'GPL-3.0-only' };
    delete answer.collections.mingcute;
    const { fetchImpl } = fakeFetch(() => json(JSON.stringify(answer)));
    const { items } = await createIconifySource(httpFor('iconify', fetchImpl)).search(
      'suitcase',
      1,
    );
    expect(items.map((i) => i.id).sort()).toEqual(
      ['iconoir:suitcase', 'pixelarticons:suitcase', 'solar:suitcase-bold'].sort(),
    );
  });

  it('iconify: asks for the next page with start', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json('{"icons":[],"limit":48,"collections":{}}'));
    await createIconifySource(httpFor('iconify', fetchImpl)).search('é à', 3);
    expect(calls[0]?.url).toBe(
      'https://api.iconify.design/search?query=%C3%A9%20%C3%A0&limit=48&start=96',
    );
  });

  it('openverse: PNG hits with their CC licence and author', async () => {
    const { fetchImpl, calls } = fakeFetch(async () =>
      json(await recorded('openverse-search-suitcase.json')),
    );
    const { items, hasMore } = await createOpenverseSource(httpFor('openverse', fetchImpl)).search(
      'suitcase',
      1,
    );
    expect(items).toHaveLength(3);
    items.forEach(expectComplete);
    expect(items.map((i) => i.licence.licence)).toEqual(['CC-BY-3.0', 'CC-BY-SA-4.0', 'CC0-1.0']);
    expect(items.map((i) => i.licence.requiresAttribution)).toEqual([true, true, false]);
    expect(items[0]).toMatchObject({
      source: 'openverse',
      format: 'png',
      mono: false,
      title: 'Suitcase Sam 2012',
      licence: { author: 'Quentin Thwaites', source: 'Openverse (wikimedia)' },
    });
    expect(hasMore).toBe(true);
    expect(calls[0]?.url).toBe(
      'https://api.openverse.org/v1/images/?q=suitcase&extension=png&license=cc0,pdm,by,by-sa&page=1&page_size=20',
    );
  });

  it('openverse: a Wikimedia hit takes its thumbnail from Wikimedia, not from the Openverse proxy', async () => {
    // Openverse's /thumb/ answers 424 "Thumbnail unavailable from provider" for every Wikimedia
    // image (checked 2026-11-15), which left the tiles blank. Wikimedia serves its own thumbnails
    // at standard widths only (250 yes, 256 no) and never wider than the file.
    const answer = JSON.parse(await recorded('openverse-search-suitcase.json')) as {
      results: { provider?: string; url: string; thumbnail: string; width?: number }[];
    };
    answer.results[1]!.width = 120; // narrower than a thumbnail: the file itself
    const { fetchImpl } = fakeFetch(() => json(JSON.stringify(answer)));
    const { items } = await createOpenverseSource(httpFor('openverse', fetchImpl)).search('a', 1);
    expect(items.map((i) => i.thumbUrl)).toEqual([
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Suitcase_Sam_2012.png/250px-Suitcase_Sam_2012.png',
      'https://upload.wikimedia.org/wikipedia/commons/b/b9/Suitcase_Bomb_Diagram_Bombing_Of_Naco_1929.png',
      answer.results[2]!.thumbnail, // rawpixel: the Openverse proxy works
    ]);
  });

  it('openverse photos: no PNG filter, JPEG kept, scoped to backgrounds', async () => {
    const answer = JSON.parse(await recorded('openverse-search-suitcase.json')) as {
      results: { filetype: string }[];
    };
    answer.results[0]!.filetype = 'jpg';
    answer.results[1]!.filetype = 'gif';
    const { fetchImpl, calls } = fakeFetch(() => json(JSON.stringify(answer)));
    const source = createOpenversePhotosSource(httpFor('openverse-photos', fetchImpl));
    const { items } = await source.search('suitcase', 2);
    expect(source.scope).toBe('backgrounds');
    expect(items.map((i) => [i.source, i.format])).toEqual([
      ['openverse-photos', 'jpg'],
      ['openverse-photos', 'png'],
    ]);
    expect(calls[0]?.url).toBe(
      'https://api.openverse.org/v1/images/?q=suitcase&license=cc0,pdm,by,by-sa&page=2&page_size=20',
    );
  });

  it('openverse photos: a hit with no filetype, as every Flickr photograph is, takes its format from its address', async () => {
    const answer = JSON.parse(await recorded('openverse-search-suitcase.json')) as {
      results: { filetype: string | null; url: string }[];
    };
    // Nothing in the third address says what the file is: it is not a picture the app can place.
    const addresses = [
      'https://live.staticflickr.com/7578/15724464767_5ca7aa3327_b.jpg',
      'https://example.org/Sea.WEBP?size=large',
      'https://example.org/photo.php?id=3',
    ];
    answer.results.forEach((r, i) => {
      r.filetype = null;
      r.url = addresses[i] as string;
    });
    const { fetchImpl } = fakeFetch(() => json(JSON.stringify(answer)));
    const { items } = await createOpenversePhotosSource(
      httpFor('openverse-photos', fetchImpl),
    ).search('sea', 1);
    expect(items.map((i) => i.format)).toEqual(['jpg', 'webp']);
  });

  it('commons: drawings with the licence of their file page', async () => {
    const { fetchImpl, calls } = fakeFetch(async () =>
      json(await recorded('commons-search-suitcase.json')),
    );
    const { items, hasMore } = await createCommonsSource(httpFor('commons', fetchImpl)).search(
      'suitcase',
      1,
    );
    expect(items).toHaveLength(3);
    items.forEach(expectComplete);
    expect(items.find((i) => i.id === 'File:Suitcase Pinhead icon.svg')).toMatchObject({
      source: 'commons',
      id: 'File:Suitcase Pinhead icon.svg',
      title: 'Suitcase Pinhead icon',
      format: 'svg',
      licence: { licence: 'CC0-1.0', requiresAttribution: false, source: 'Wikimedia Commons' },
    });
    const author = items.find((i) => i.id === 'File:Suitcase Pinhead icon.svg')?.licence.author;
    expect(author).toContain('Quincy Morgan');
    expect(author).not.toContain('<');
    expect(hasMore).toBe(true);
    const url = new URL(calls[0]?.url as string);
    expect(url.searchParams.get('gsrsearch')).toBe('filetype:drawing suitcase');
    expect(url.searchParams.get('gsrnamespace')).toBe('6');
    expect(url.searchParams.get('iiprop')).toBe('url|extmetadata|mime|size');
  });

  it('commons: leaves out other licences and other file types; no result is an empty page', async () => {
    const answer = JSON.parse(await recorded('commons-search-suitcase.json'));
    answer.query.pages[0].imageinfo[0].extmetadata.LicenseShortName.value = 'CC BY-NC 4.0';
    answer.query.pages[1].imageinfo[0].mime = 'image/gif';
    delete answer.continue;
    let body = JSON.stringify(answer);
    const { fetchImpl } = fakeFetch(() => json(body));
    const source = createCommonsSource(httpFor('commons', fetchImpl));
    const { items, hasMore } = await source.search('suitcase', 1);
    expect(items.map((i) => i.id)).toEqual(['File:Suitcase xray Pinhead icon.svg']);
    expect(hasMore).toBe(false);
    body = '{"batchcomplete":true}';
    expect(await source.search('nothing at all', 1)).toEqual({ items: [], hasMore: false });
  });

  it('sends the User-Agent of the app, with no email', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json('{"icons":[],"limit":48,"collections":{}}'));
    const sources = createOnlineSources({ cacheDir, version: '1.2.3', fetchImpl });
    await sources[0]?.search('x', 1);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('travelbook/1.2.3 (personal desktop app)');
    expect(headers['User-Agent']).not.toContain('@');
    expect(sources.map((s) => [s.id, s.needsKey])).toEqual([
      ['iconify', false],
      ['openverse', false],
      ['commons', false],
      ['openverse-photos', false],
    ]);
  });
});

describe.each(ADAPTERS)('$id failures (Review Focus 5)', ({ id, make, answer }) => {
  const failures: [string, Handler, SourceErrorKind][] = [
    ['a network error', () => Promise.reject(new TypeError('fetch failed')), 'offline'],
    ['an HTTP 429', () => new Response('slow down', { status: 429 }), 'rateLimited'],
    [
      'an HTML body',
      () => new Response('<html><body>Maintenance</body></html>', { status: 200 }),
      'badAnswer',
    ],
    [
      'a JSON body of the wrong shape',
      () => json('{"hello":"world","results":"no","icons":3}'),
      'badAnswer',
    ],
    ['a JSON array', () => json('[1,2,3]'), 'badAnswer'],
    ['an HTTP 500', () => new Response('oops', { status: 500 }), 'badAnswer'],
  ];

  it.each(failures)(
    '%s rejects with a typed SourceError and caches nothing',
    async (_label, handler, kind) => {
      const { fetchImpl } = fakeFetch(handler);
      const source = make(httpFor(id, fetchImpl));
      await expect(source.search('suitcase', 1)).rejects.toMatchObject({
        name: 'SourceError',
        kind,
      });
      await expect(source.search('suitcase', 1)).rejects.toBeInstanceOf(SourceError);
      expect(await cached(id)).toEqual([]);
    },
  );

  it('a 429 with a short Retry-After is waited out and asked again', async () => {
    // Wikimedia's front caches throttle a burst of thumbnails with "Retry-After: 1".
    let fail = true;
    const body = await recorded(answer);
    const { fetchImpl, calls } = fakeFetch(() => {
      if (!fail) return json(body);
      fail = false;
      return new Response('x', { status: 429, headers: { 'Retry-After': '0' } });
    });
    const source = make(httpFor(id, fetchImpl));
    await source.search('suitcase', 1);
    expect(calls).toHaveLength(2);
  });

  it('a 429 with a long Retry-After fails at once', async () => {
    const { fetchImpl, calls } = fakeFetch(
      () => new Response('x', { status: 429, headers: { 'Retry-After': '3600' } }),
    );
    const source = make(httpFor(id, fetchImpl));
    await expect(source.search('suitcase', 1)).rejects.toMatchObject({ kind: 'rateLimited' });
    expect(calls).toHaveLength(1);
  });

  it('a good answer after a failure is fetched and cached', async () => {
    let fail = true;
    const body = await recorded(answer);
    const { fetchImpl, calls } = fakeFetch(() =>
      fail ? new Response('x', { status: 429 }) : json(body),
    );
    const source = make(httpFor(id, fetchImpl));
    await expect(source.search('suitcase', 1)).rejects.toMatchObject({ kind: 'rateLimited' });
    fail = false;
    await source.search('suitcase', 1);
    expect(calls).toHaveLength(2);
    expect(await cached(id)).toHaveLength(1);
  });

  it('a second identical search within 7 days makes no HTTP call; after 7 days it does', async () => {
    const body = await recorded(answer);
    const { fetchImpl, calls } = fakeFetch(() => json(body));
    let now = Date.UTC(2026, 10, 14);
    const source = make(httpFor(id, fetchImpl, () => now));
    const first = await source.search('suitcase', 1);
    now += CACHE_TTL_MS - 1000;
    expect(await source.search('suitcase', 1)).toEqual(first);
    expect(calls).toHaveLength(1);
    await source.search('suitcase', 2); // another page is another question
    expect(calls).toHaveLength(2);
    now += 2000;
    await source.search('suitcase', 1);
    expect(calls).toHaveLength(3);
  });
});

describe('SourceHttp', () => {
  const options = (
    fetchImpl: typeof fetch,
    extra: Partial<ConstructorParameters<typeof SourceHttp>[0]> = {},
  ) => ({
    userAgent: userAgent('0.0.0'),
    fetchImpl,
    ...extra,
  });

  it('gives up after the timeout with `offline`', async () => {
    const { fetchImpl } = fakeFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const http = new SourceHttp(options(fetchImpl, { timeoutMs: 30 }));
    await expect(http.bytes('https://example.org/a')).rejects.toMatchObject({ kind: 'offline' });
  });

  it('gives up when the body stalls after the headers', async () => {
    const { fetchImpl } = fakeFetch((_url, init) => {
      const body = new ReadableStream({
        start(controller) {
          init.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
        },
      });
      return new Response(body, { status: 200 });
    });
    const http = new SourceHttp(options(fetchImpl, { timeoutMs: 30 }));
    await expect(http.bytes('https://example.org/a')).rejects.toMatchObject({ kind: 'offline' });
  });

  it('runs at most 2 requests at a time', async () => {
    let running = 0;
    let peak = 0;
    const { fetchImpl } = fakeFetch(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 15));
      running--;
      return new Response('x', { status: 200 });
    });
    const http = new SourceHttp(options(fetchImpl));
    const all = await Promise.all(
      Array.from({ length: 7 }, (_, i) => http.bytes(`https://example.org/${i}`)),
    );
    expect(all).toHaveLength(7);
    expect(peak).toBe(2);
  });

  it('keeps going after a failed request (the slot is released)', async () => {
    let n = 0;
    const { fetchImpl } = fakeFetch(() =>
      n++ < 3 ? Promise.reject(new Error('down')) : new Response('ok'),
    );
    const http = new SourceHttp(options(fetchImpl));
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => http.bytes('https://example.org/a')),
    );
    expect(results.map((r) => r.status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
      'fulfilled',
      'fulfilled',
    ]);
  });

  it('refuses a download over 20 MB, declared or not', async () => {
    const declared = fakeFetch(
      () =>
        new Response('x', {
          status: 200,
          headers: { 'content-length': String(MAX_DOWNLOAD_BYTES + 1) },
        }),
    );
    await expect(
      new SourceHttp(options(declared.fetchImpl)).bytes('https://example.org/a'),
    ).rejects.toMatchObject({
      kind: 'tooLarge',
    });
    const undeclared = fakeFetch(
      () => new Response(Buffer.alloc(MAX_DOWNLOAD_BYTES + 1), { status: 200 }),
    );
    await expect(
      new SourceHttp(options(undeclared.fetchImpl)).bytes('https://example.org/a'),
    ).rejects.toMatchObject({
      kind: 'tooLarge',
    });
    const exact = fakeFetch(() => new Response(Buffer.alloc(MAX_DOWNLOAD_BYTES), { status: 200 }));
    expect(
      await new SourceHttp(options(exact.fetchImpl)).bytes('https://example.org/a'),
    ).toHaveLength(MAX_DOWNLOAD_BYTES);
  });

  it('reports a missing file as `notFound`', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('gone', { status: 404 }));
    await expect(
      new SourceHttp(options(fetchImpl)).bytes('https://example.org/a'),
    ).rejects.toMatchObject({
      kind: 'notFound',
    });
  });
});

describe('fetch of a hit', () => {
  const hit = (over: Partial<StickerHit>): StickerHit => ({
    source: 'x',
    id: 'x',
    title: 'x',
    thumbUrl: 'https://example.org/t',
    fileUrl: 'https://example.org/f',
    format: 'svg',
    licence: {
      source: 's',
      author: 'a',
      licence: 'CC0-1.0',
      url: 'https://example.org',
      requiresAttribution: false,
    },
    mono: false,
    ...over,
  });

  it('iconify: downloads from the id (not the URL of the hit) and sanitises the SVG', async () => {
    const { fetchImpl, calls } = fakeFetch(
      async () => new Response(await readFile(fixturePath('script.svg'))),
    );
    const source = createIconifySource(httpFor('iconify', fetchImpl));
    const { bytes, ext } = await source.fetch(
      hit({ id: 'iconoir:suitcase', fileUrl: 'https://evil.test/x.svg' }),
    );
    expect(calls.map((c) => c.url)).toEqual(['https://api.iconify.design/iconoir/suitcase.svg']);
    expect(ext).toBe('svg');
    expect(bytes.toString()).not.toMatch(/<script|onload|onclick/);
    await expect(source.fetch(hit({ id: '../../etc/passwd' }))).rejects.toMatchObject({
      kind: 'badAnswer',
    });
  });

  it('iconify: a file that is not an SVG is a bad answer', async () => {
    const { fetchImpl } = fakeFetch(
      async () => new Response(await readFile(fixturePath('alpha.png'))),
    );
    await expect(
      createIconifySource(httpFor('iconify', fetchImpl)).fetch(hit({ id: 'iconoir:suitcase' })),
    ).rejects.toMatchObject({ kind: 'badAnswer' });
  });

  it('openverse photos: a JPEG that decodes is stored as .jpg', async () => {
    const jpg = await readFile(fixturePath('small.jpg'));
    const { fetchImpl } = fakeFetch(() => new Response(jpg));
    const out = await createOpenversePhotosSource(httpFor('openverse-photos', fetchImpl)).fetch(
      hit({ format: 'jpg' }),
    );
    expect(out.ext).toBe('jpg');
  });

  it('openverse: a PNG that decodes is returned as it is', async () => {
    const png = await readFile(fixturePath('alpha.png'));
    const { fetchImpl } = fakeFetch(() => new Response(png));
    const out = await createOpenverseSource(httpFor('openverse', fetchImpl)).fetch(
      hit({ format: 'png' }),
    );
    expect(out.ext).toBe('png');
    expect(out.bytes.equals(png)).toBe(true);
  });

  it.each([
    ['a truncated PNG', async () => (await readFile(fixturePath('alpha.png'))).subarray(0, 300)],
    ['an HTML page', async () => Buffer.from('<html>nope</html>')],
    ['a JPEG', async () => readFile(fixturePath('small.jpg'))],
    ['an SVG', async () => readFile(fixturePath('plain.svg'))],
  ])('openverse: %s is a bad answer', async (_label, make) => {
    const body = await make();
    const { fetchImpl } = fakeFetch(() => new Response(body));
    await expect(
      createOpenverseSource(httpFor('openverse', fetchImpl)).fetch(hit({ format: 'png' })),
    ).rejects.toMatchObject({ kind: 'badAnswer' });
  });

  it.each([
    ['http', 'http://example.org/a.png'],
    ['localhost', 'https://localhost/a.png'],
    ['an IP address', 'https://127.0.0.1/a.png'],
    ['an IPv6 address', 'https://[::1]/a.png'],
    ['file', 'file:///etc/passwd'],
    ['junk', 'not a url'],
  ])('openverse: refuses %s', async (_label, fileUrl) => {
    const { fetchImpl, calls } = fakeFetch(() => new Response('x'));
    await expect(
      createOpenverseSource(httpFor('openverse', fetchImpl)).fetch(hit({ format: 'png', fileUrl })),
    ).rejects.toMatchObject({ kind: 'badAnswer' });
    expect(calls).toEqual([]);
  });

  it('commons: only files of upload.wikimedia.org, and SVG is sanitised', async () => {
    const { fetchImpl, calls } = fakeFetch(
      async () => new Response(await readFile(fixturePath('script.svg'))),
    );
    const source = createCommonsSource(httpFor('commons', fetchImpl));
    await expect(source.fetch(hit({ fileUrl: 'https://example.org/a.svg' }))).rejects.toMatchObject(
      {
        kind: 'badAnswer',
      },
    );
    expect(calls).toEqual([]);
    const out = await source.fetch(hit({ fileUrl: 'https://upload.wikimedia.org/a/a.svg' }));
    expect(out.bytes.toString()).not.toMatch(/<script|onload/);
  });
});

describe('hasTransparency', () => {
  it('is true for alpha.png and false for opaque.png', async () => {
    expect(await hasTransparency(await readFile(fixturePath('alpha.png')))).toBe(true);
    expect(await hasTransparency(await readFile(fixturePath('opaque.png')))).toBe(false);
  });

  it('is false for a PNG with an alpha channel that is fully opaque, true for one pixel at 254', async () => {
    const base = { width: 4, height: 4, channels: 4 as const };
    const opaque = Buffer.alloc(64, 255);
    expect(await hasTransparency(await sharp(opaque, { raw: base }).png().toBuffer())).toBe(false);
    const almost = Buffer.from(opaque);
    almost[63] = 254;
    expect(await hasTransparency(await sharp(almost, { raw: base }).png().toBuffer())).toBe(true);
  });

  it('is false for a JPEG', async () => {
    expect(await hasTransparency(await readFile(fixturePath('small.jpg')))).toBe(false);
  });
});

describe('DiskCache', () => {
  it('survives a damaged entry as a miss', async () => {
    const cache = new DiskCache(join(cacheDir, 'c'));
    await cache.set('k', 'v');
    expect(await cache.get('k')).toBe('v');
    const [file] = await readdir(join(cacheDir, 'c'));
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(cacheDir, 'c', file as string), '{not json');
    expect(await cache.get('k')).toBeUndefined();
  });
});
