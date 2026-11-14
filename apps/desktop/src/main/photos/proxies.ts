import { randomUUID } from 'node:crypto';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import type { AssetRef } from '@travelbook/core';
import { serialize } from '../project/atomic-write';
import { createLimiter } from './limit';

/** Long edge of the preview and of the thumbnail, in pixels. */
export const PREVIEW_EDGE = 2560;
export const THUMB_EDGE = 320;
const PREVIEW_QUALITY = 85;
const THUMB_QUALITY = 80;

/** sharp has its own thread pool: this only bounds how many images are in flight at once. */
const MAX_CONCURRENT_JOBS = 4;
const sharpQueue = createLimiter(MAX_CONCURRENT_JOBS);

/** Safe in a file name: no separator, no dot sequence, not empty. */
const ASSET_ID = /^[A-Za-z0-9_-]+$/;

function cachePaths(dir: string, id: string): { preview: string; thumb: string } {
  if (!ASSET_ID.test(id)) throw new Error(`Invalid asset id: ${JSON.stringify(id)}`);
  return {
    preview: join(dir, 'cache', `${id}.preview.jpg`),
    thumb: join(dir, 'cache', `${id}.thumb.jpg`),
  };
}

/** Absolute path of an asset file, which must lie inside the project folder. */
function sourcePath(dir: string, file: string): string {
  const path = resolve(dir, file);
  const rel = relative(resolve(dir), path);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Asset file is outside the project folder: ${file}`);
  }
  return path;
}

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

/**
 * Write one JPEG proxy. The image is turned upright from its EXIF orientation first (the
 * output carries no orientation tag), then shrunk to fit a `edge` x `edge` square without ever
 * being enlarged, flattened onto white where it has transparency, and converted to sRGB (the
 * embedded profile is applied, then dropped). The file appears under its final name only when
 * complete, so a failed or interrupted render leaves nothing behind.
 */
async function render(src: string, dst: string, edge: number, quality: number): Promise<void> {
  const tmp = `${dst}.${randomUUID()}.tmp`;
  try {
    await sharpQueue(() =>
      sharp(src)
        .rotate()
        .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .toColourspace('srgb')
        .jpeg({ quality })
        .toFile(tmp),
    );
    await rename(tmp, dst);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Make sure `cache/<id>.preview.jpg` (long edge 2560, quality 85) and `cache/<id>.thumb.jpg`
 * (long edge 320, quality 80) exist for `asset` and return their absolute paths. Existing
 * proxies are kept as they are: only the missing ones are rendered, and the original is not
 * read when none is missing. Concurrent calls for one asset share the work. Rejects, leaving
 * nothing in `cache/`, when the original cannot be decoded.
 */
export async function ensureProxies(
  dir: string,
  asset: AssetRef,
): Promise<{ preview: string; thumb: string }> {
  const paths = cachePaths(dir, asset.id);
  const src = sourcePath(dir, asset.file);
  return serialize(`proxies:${resolve(dir)}:${asset.id}`, async () => {
    const wanted = [
      { dst: paths.preview, edge: PREVIEW_EDGE, quality: PREVIEW_QUALITY },
      { dst: paths.thumb, edge: THUMB_EDGE, quality: THUMB_QUALITY },
    ];
    const missing: typeof wanted = [];
    for (const proxy of wanted) {
      if (!(await exists(proxy.dst))) missing.push(proxy);
    }
    if (missing.length > 0) {
      await mkdir(join(dir, 'cache'), { recursive: true });
      // Let every render finish before reporting a failure, so none is still writing afterwards.
      const results = await Promise.allSettled(
        missing.map(({ dst, edge, quality }) => render(src, dst, edge, quality)),
      );
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
      }
    }
    return paths;
  });
}
