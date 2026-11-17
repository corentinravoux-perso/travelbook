import { mapElement } from '@travelbook/core/src/map/test-helpers';
import { newBook, type MapGeometry, type Spread } from '@travelbook/core';
import { describe, expect, it, vi } from 'vitest';
import {
  GEOMETRY_RETRY_AFTER_MS,
  GEOMETRY_TIMEOUT_MS,
  createGeometryCache,
  preloadMapGeometries,
} from './geometryCache';

const geometry: MapGeometry = {
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
    regions: 'M500 0V600',
    selected: 'M0 0H500V600H0Z',
    neighbours: 'M-50 0H0V600H-50Z',
    lakes: 'M400 200h50v50h-50Z',
  },
};

const json = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

function cacheWith(handler: (url: string) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: string | URL | Request) => handler(String(url)));
  const cache = createGeometryCache({
    urlOf: (id) => `tb://asset/${id}?v=original`,
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { cache, fetchMock };
}

describe('geometry cache', () => {
  it('fetches an id once, from tb://asset original', async () => {
    const { cache, fetchMock } = cacheWith(() => json(geometry));
    const [a, b] = await Promise.all([cache.load('map-a'), cache.load('map-a')]);
    await cache.load('map-a');
    expect(a).toEqual(geometry);
    expect(b).toEqual(geometry);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('tb://asset/map-a?v=original');
  });

  it.each([
    ['a 404', () => json('nope', 404)],
    ['invalid JSON', () => json('{not json')],
    ['a wrong version', () => json({ ...geometry, version: 2 })],
    ['a schema failure', () => json({ version: 1, paths: {} })],
    [
      'a network error',
      () => {
        throw new TypeError('network');
      },
    ],
  ])('yields missing, without throwing, for %s', async (_name, handler) => {
    const { cache } = cacheWith(handler);
    await expect(cache.load('map-a')).resolves.toBe('missing');
    expect(cache.peek('map-a')).toBe('missing');
  });

  it('peek is null while loading, then the geometry, and notifies', async () => {
    const { cache } = cacheWith(() => json(geometry));
    const listener = vi.fn();
    cache.subscribe(listener);
    expect(cache.peek('map-a')).toBeNull();
    await cache.load('map-a');
    expect(cache.peek('map-a')).toEqual(geometry);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('invalidate lets a failed id load again', async () => {
    let ok = false;
    const { cache, fetchMock } = cacheWith(() => (ok ? json(geometry) : json('', 404)));
    expect(await cache.load('map-a')).toBe('missing');
    ok = true;
    expect(await cache.load('map-a')).toBe('missing');
    cache.invalidate('map-a');
    expect(await cache.load('map-a')).toEqual(geometry);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores a read that an invalidation overtook', async () => {
    let release: (r: Response) => void = () => undefined;
    let first = true;
    const { cache } = cacheWith(() => {
      if (first) {
        first = false;
        return new Promise<Response>((resolve) => (release = resolve));
      }
      return json(geometry);
    });
    const stale = cache.load('map-a');
    cache.invalidate('map-a');
    expect(await cache.load('map-a')).toEqual(geometry);
    release(json('', 404));
    await stale;
    expect(cache.peek('map-a')).toEqual(geometry);
  });
});

describe('geometry cache lifetime', () => {
  it('clear forgets a cached failure and a cached geometry', async () => {
    let body: Response = json('', 404);
    const { cache, fetchMock } = cacheWith(() => body);
    expect(await cache.load('map-a')).toBe('missing');
    body = json(geometry);
    cache.clear();
    expect(await cache.load('map-a')).toEqual(geometry);
    cache.clear();
    expect(cache.peek('map-a')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('turns a stalled read into missing after the timeout', async () => {
    vi.useFakeTimers();
    try {
      const { cache } = cacheWith(() => new Promise<Response>(() => undefined));
      const pending = cache.load('map-a');
      await vi.advanceTimersByTimeAsync(GEOMETRY_TIMEOUT_MS);
      await expect(pending).resolves.toBe('missing');
      expect(cache.peek('map-a')).toBe('missing');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('geometry cache retry after a timeout', () => {
  /** A fetch that stalls while `stalled` is true, then answers with the geometry. */
  function stallingCache() {
    const state = { stalled: true };
    const { cache, fetchMock } = cacheWith(() =>
      state.stalled ? new Promise<Response>(() => undefined) : json(geometry),
    );
    return { cache, fetchMock, state };
  }

  it('fetches again on the next load once the disk answers', async () => {
    vi.useFakeTimers();
    try {
      const { cache, fetchMock, state } = stallingCache();
      const first = cache.load('map-a');
      await vi.advanceTimersByTimeAsync(GEOMETRY_TIMEOUT_MS);
      await expect(first).resolves.toBe('missing');
      state.stalled = false;
      await expect(cache.load('map-a')).resolves.toEqual(geometry);
      expect(cache.peek('map-a')).toEqual(geometry);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('peek retries on a later render, keeps showing missing meanwhile, then notifies', async () => {
    vi.useFakeTimers();
    try {
      const { cache, fetchMock, state } = stallingCache();
      const listener = vi.fn();
      cache.subscribe(listener);
      expect(cache.peek('map-a')).toBeNull();
      await vi.advanceTimersByTimeAsync(GEOMETRY_TIMEOUT_MS);
      expect(cache.peek('map-a')).toBe('missing');
      // The render that the failure triggers does not refetch at once.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      state.stalled = false;
      await vi.advanceTimersByTimeAsync(GEOMETRY_RETRY_AFTER_MS);
      expect(cache.peek('map-a')).toBe('missing');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(0);
      expect(cache.peek('map-a')).toEqual(geometry);
      // the timeout, the retry allowed, the geometry in
      expect(listener).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('notifies the views when the retry is allowed, so a page left alone draws the map', async () => {
    vi.useFakeTimers();
    try {
      const { cache, fetchMock, state } = stallingCache();
      const listener = vi.fn(() => void cache.peek('map-a')); // a view that peeks on render
      cache.subscribe(listener);
      cache.peek('map-a');
      await vi.advanceTimersByTimeAsync(GEOMETRY_TIMEOUT_MS);
      expect(cache.peek('map-a')).toBe('missing');
      state.stalled = false;
      await vi.advanceTimersByTimeAsync(GEOMETRY_RETRY_AFTER_MS);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(cache.peek('map-a')).toEqual(geometry);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a 404 or a schema failure as missing, without fetching again', async () => {
    vi.useFakeTimers();
    try {
      for (const body of [json('', 404), json({ version: 1, paths: {} })]) {
        const { cache, fetchMock } = cacheWith(() => body.clone());
        expect(await cache.load('map-a')).toBe('missing');
        await vi.advanceTimersByTimeAsync(GEOMETRY_RETRY_AFTER_MS * 10);
        expect(cache.peek('map-a')).toBe('missing');
        expect(await cache.load('map-a')).toBe('missing');
        expect(fetchMock).toHaveBeenCalledTimes(1);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('preloadMapGeometries', () => {
  const spreadWith = (...ids: string[]): Spread => {
    const book = newBook({ title: 'T' });
    return {
      ...book.cover,
      elements: ids.map((id, i) => ({ ...mapElement(), id: `m${i}`, geometryAssetId: id })),
    };
  };

  it('resolves only once every map of the spread is cached', async () => {
    const releases = new Map<string, () => void>();
    const { cache } = cacheWith(
      (url) =>
        new Promise<Response>((resolve) =>
          releases.set(url, () => resolve(url.includes('map-b') ? json('', 404) : json(geometry))),
        ),
    );
    let done = false;
    const pending = preloadMapGeometries(spreadWith('map-a', 'map-b', 'map-a'), cache).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect([...releases.keys()].sort()).toEqual([
      'tb://asset/map-a?v=original',
      'tb://asset/map-b?v=original',
    ]);
    releases.get('tb://asset/map-a?v=original')?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(false);
    releases.get('tb://asset/map-b?v=original')?.();
    await pending;
    expect(done).toBe(true);
    expect(cache.peek('map-a')).toEqual(geometry);
    expect(cache.peek('map-b')).toBe('missing');
  });
});
