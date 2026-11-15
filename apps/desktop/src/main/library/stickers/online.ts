import { join } from 'node:path';
import { DiskCache } from './cache';
import { createCommonsSource } from './commons';
import { createIconifySource } from './iconify';
import { createOpenversePhotosSource, createOpenverseSource } from './openverse';
import { SourceHttp, userAgent, type StickerSource } from './source';

/**
 * The online sources, each with its own HTTP limits and its own cache folder
 * (`<cacheDir>/<source>`, answers kept 7 days). `version` is the app's version, for the
 * User-Agent. `fetchImpl` and `now` are for tests.
 */
export function createOnlineSources(options: {
  cacheDir: string;
  version: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): StickerSource[] {
  const http = (id: string): SourceHttp =>
    new SourceHttp({
      userAgent: userAgent(options.version),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      cache: new DiskCache(join(options.cacheDir, id), options.now ? { now: options.now } : {}),
    });
  return [
    createIconifySource(http('iconify')),
    createOpenverseSource(http('openverse')),
    createCommonsSource(http('commons')),
    createOpenversePhotosSource(http('openverse-photos')),
  ];
}
