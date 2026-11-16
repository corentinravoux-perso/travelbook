import { MapGeometrySchema, type MapGeometry, type Spread } from '@travelbook/core';
import { useCallback, useSyncExternalStore } from 'react';

/** What a map reads: the geometry, `null` while it loads, `'missing'` when it cannot be read. */
export type GeometryState = MapGeometry | null | 'missing';

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
  subscribe(listener: () => void): () => void;
  /** Changes at every settled load or invalidation. */
  version(): number;
}

type Entry =
  | { state: 'loading'; promise: Promise<MapGeometry | 'missing'> }
  | {
      state: 'done';
      value: MapGeometry | 'missing';
    };

/**
 * A geometry is a file of the album, read once per id through `urlOf` and checked against
 * `MapGeometrySchema`. A failed read (404, network, bad JSON, bad shape) is cached as `'missing'`.
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

  async function read(assetId: string): Promise<MapGeometry | 'missing'> {
    try {
      const response = await (options.fetch ?? fetch)(options.urlOf(assetId));
      if (!response.ok) return 'missing';
      const parsed = MapGeometrySchema.safeParse(await response.json());
      return parsed.success ? parsed.data : 'missing';
    } catch {
      return 'missing';
    }
  }

  function load(assetId: string): Promise<MapGeometry | 'missing'> {
    const known = entries.get(assetId);
    if (known?.state === 'loading') return known.promise;
    if (known?.state === 'done') return Promise.resolve(known.value);
    const promise = read(assetId).then((value) => {
      // An invalidation during the read replaced the entry: this answer is stale.
      if (entries.get(assetId) === entry) {
        entries.set(assetId, { state: 'done', value });
        bump();
      }
      return value;
    });
    const entry: Entry = { state: 'loading', promise };
    entries.set(assetId, entry);
    return promise;
  }

  return {
    load,
    peek(assetId) {
      const known = entries.get(assetId);
      if (known?.state === 'done') return known.value;
      if (known === undefined) void load(assetId);
      return null;
    },
    invalidate(assetId) {
      if (entries.delete(assetId)) bump();
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
