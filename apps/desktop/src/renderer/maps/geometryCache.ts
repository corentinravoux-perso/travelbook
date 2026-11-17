import { MapGeometrySchema, type MapGeometry, type Spread } from '@travelbook/core';
import { useCallback, useSyncExternalStore } from 'react';

/** What a map reads: the geometry, `null` while it loads, `'missing'` when it cannot be read. */
export type GeometryState = MapGeometry | null | 'missing';

/** Longest a geometry file may take to read: a stalled read becomes `'missing'`. */
export const GEOMETRY_TIMEOUT_MS = 15_000;

/**
 * A read that timed out is tried again by the next `load`, or by the next `peek` once this long
 * has passed since it gave up (a render right after the failure does not refetch in a loop).
 */
export const GEOMETRY_RETRY_AFTER_MS = 5_000;

export interface GeometryCache {
  /** The geometry of an asset. Never rejects: a geometry that cannot be read is `'missing'`. */
  load(assetId: string): Promise<MapGeometry | 'missing'>;
  /** What is known now; starts the load of an asset not asked for yet. */
  peek(assetId: string): GeometryState;
  /**
   * Forget an asset (cached geometry or cached failure). Call it after a save of the same id
   * (a re-bake) so the next read fetches the file again.
   */
  invalidate(assetId: string): void;
  /** Forget everything: another album may hold the same id with another content. */
  clear(): void;
  subscribe(listener: () => void): () => void;
  /** Changes at every settled load or invalidation. */
  version(): number;
}

/** Why a read gave no geometry: a stall is worth another try, a bad file is not. */
type Failure = 'timeout' | 'invalid';

type Entry =
  | {
      state: 'loading';
      promise: Promise<MapGeometry | 'missing'>;
      /** What `peek` shows meanwhile: `'missing'` while a timed-out read is retried. */
      shown: 'missing' | null;
    }
  | { state: 'done'; value: MapGeometry }
  | { state: 'done'; value: 'missing'; failure: Failure; at: number };

/**
 * A geometry is a file of the album, read once per id through `urlOf` and checked against
 * `MapGeometrySchema`. A failed read (404, network, bad JSON, bad shape) is cached as `'missing'`;
 * a read that stalled past the timeout is `'missing'` too, but tried again later (see
 * `GEOMETRY_RETRY_AFTER_MS`), so a map comes back once the disk answers.
 */
export function createGeometryCache(options: {
  urlOf(assetId: string): string;
  fetch?: typeof fetch;
}): GeometryCache {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let version = 0;
  const bump = () => {
    version += 1;
    for (const listener of [...listeners]) listener();
  };

  async function read(assetId: string): Promise<MapGeometry | Failure> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve('timeout');
      }, GEOMETRY_TIMEOUT_MS);
    });
    const reading = (async (): Promise<MapGeometry | Failure> => {
      try {
        const response = await (options.fetch ?? fetch)(options.urlOf(assetId), {
          signal: controller.signal,
        });
        if (!response.ok) return 'invalid';
        const parsed = MapGeometrySchema.safeParse(await response.json());
        return parsed.success ? parsed.data : 'invalid';
      } catch {
        return 'invalid';
      }
    })();
    try {
      return await Promise.race([reading, stalled]);
    } finally {
      clearTimeout(timer);
    }
  }

  const timedOut = (known: Entry | undefined): boolean =>
    known?.state === 'done' && known.value === 'missing' && known.failure === 'timeout';

  function load(assetId: string): Promise<MapGeometry | 'missing'> {
    const known = entries.get(assetId);
    if (known?.state === 'loading') return known.promise;
    if (known?.state === 'done' && !timedOut(known)) return Promise.resolve(known.value);
    const promise = read(assetId).then((result) => {
      const value = typeof result === 'string' ? 'missing' : result;
      // An invalidation during the read replaced the entry: this answer is stale.
      if (entries.get(assetId) === entry) {
        entries.set(
          assetId,
          typeof result === 'string'
            ? { state: 'done', value: 'missing', failure: result, at: Date.now() }
            : { state: 'done', value: result },
        );
        bump();
      }
      return value;
    });
    const entry: Entry = { state: 'loading', promise, shown: known ? 'missing' : null };
    entries.set(assetId, entry);
    return promise;
  }

  return {
    load,
    peek(assetId) {
      const known = entries.get(assetId);
      if (known === undefined) {
        void load(assetId);
        return null;
      }
      if (known.state === 'loading') return known.shown;
      if (
        known.value === 'missing' &&
        known.failure === 'timeout' &&
        Date.now() - known.at >= GEOMETRY_RETRY_AFTER_MS
      ) {
        void load(assetId);
      }
      return known.value;
    },
    invalidate(assetId) {
      if (entries.delete(assetId)) bump();
    },
    clear() {
      if (entries.size === 0) return;
      entries.clear();
      bump();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,
  };
}

/** The cache of the editor windows: the open album's files through `tb://asset`. */
export const geometryCache: GeometryCache = createGeometryCache({
  urlOf: (id) => `tb://asset/${encodeURIComponent(id)}?v=original`,
});

export const loadMapGeometry = (
  assetId: string,
  cache: GeometryCache = geometryCache,
): Promise<MapGeometry | 'missing'> => cache.load(assetId);

/** Every map of the spread, loaded: resolves once each is cached (as a geometry or `'missing'`). */
export async function preloadMapGeometries(
  spread: Spread,
  cache: GeometryCache = geometryCache,
): Promise<void> {
  const ids = new Set<string>();
  for (const el of spread.elements) if (el.type === 'map') ids.add(el.geometryAssetId);
  await Promise.all([...ids].map((id) => cache.load(id)));
}

/** One map's geometry, re-rendered when it loads. */
export function useMapGeometry(
  assetId: string,
  cache: GeometryCache = geometryCache,
): GeometryState {
  useSyncExternalStore(cache.subscribe, cache.version);
  return cache.peek(assetId);
}

/**
 * The `mapGeometry` prop of `SpreadView`: a lookup that starts the loads it is asked for and
 * changes identity whenever one settles, so the view draws again.
 */
export function useMapGeometryLookup(
  cache: GeometryCache = geometryCache,
): (assetId: string) => GeometryState {
  const version = useSyncExternalStore(cache.subscribe, cache.version);
  // `version` is a dependency on purpose: a new function makes memoised children redraw.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((assetId: string) => cache.peek(assetId), [cache, version]);
}
