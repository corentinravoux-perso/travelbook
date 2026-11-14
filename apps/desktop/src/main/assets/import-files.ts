import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';
import type { AssetRef } from '@travelbook/core';
import type { ImportedAssetKind } from '../../shared/api';
import { describeError, ID_LENGTH, sha256File } from '../photos/import';

const RASTER_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const RASTER_FORMATS = new Set(['png', 'jpeg', 'webp']);

/** Lower-case, with the dot. */
const EXTENSIONS: Record<ImportedAssetKind, ReadonlySet<string>> = {
  sticker: new Set([...RASTER_EXTENSIONS, '.svg']),
  background: new Set([...RASTER_EXTENSIONS, '.svg']),
  pattern: new Set([...RASTER_EXTENSIONS, '.svg']),
  font: new Set(['.ttf', '.otf', '.woff', '.woff2']),
};

/** Long edge of the throw-away render that proves an image can be decoded. */
const CHECK_EDGE = 64;

/**
 * Check an image and measure it. Raster images must be whole (decoding them to a small size reads
 * the entire file, which rejects a truncated one) and give their size after EXIF orientation.
 * An SVG must parse but has no pixel size, and is not sanitised here (Task 6.2).
 */
async function inspectImage(
  path: string,
  ext: string,
): Promise<{ w: number; h: number } | undefined> {
  const meta = await sharp(path).metadata();
  if (ext === '.svg') {
    if (meta.format !== 'svg') throw new Error('Not an SVG file');
    return undefined;
  }
  if (!meta.format || !RASTER_FORMATS.has(meta.format)) {
    throw new Error(`Unsupported image format${meta.format ? `: ${meta.format}` : ''}`);
  }
  const w = meta.autoOrient.width;
  const h = meta.autoOrient.height;
  if (!(w > 0 && h > 0)) throw new Error('The image has no readable size');
  await sharp(path).resize({ width: CHECK_EDGE, height: CHECK_EDGE, fit: 'inside' }).toBuffer();
  return { w, h };
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/**
 * Copy files into the project's `assets/` as `assets/<id>.<ext>`, where the id is the first 16 hex
 * digits of the SHA-256 (the id of a photo with the same bytes) and the extension is lower-cased.
 * A file already there is not copied again, so the same bytes give the same asset however often
 * they come. Raster images are decoded to prove they are whole and are measured; fonts are taken
 * as they are. The assets are returned in the order of `paths`, once each.
 *
 * All or nothing: if any file is refused, the files this call copied are removed and the error
 * names the file that failed. Sources are only read.
 */
export async function importAssetFiles(
  dir: string,
  kind: ImportedAssetKind,
  paths: string[],
): Promise<AssetRef[]> {
  const extensions = EXTENSIONS[kind];
  if (extensions === undefined) throw new Error(`Unsupported asset kind: ${String(kind)}`);
  const assets = new Map<string, AssetRef>();
  /** Files this call put in `assets/`. */
  const created: string[] = [];

  async function importOne(path: string): Promise<void> {
    const info = await stat(path);
    if (!info.isFile()) throw new Error('Not a regular file');
    const ext = extname(path).toLowerCase();
    if (!extensions.has(ext)) {
      throw new Error(`Unsupported file type for a ${kind}: ${ext || 'no extension'}`);
    }
    const pixel = kind === 'font' ? undefined : await inspectImage(path, ext);

    const sha256 = await sha256File(path);
    const id = sha256.slice(0, ID_LENGTH);
    if (assets.has(id)) return;
    const file = `assets/${id}${ext}`;
    const stored = join(dir, file);
    if (!(await exists(stored))) {
      await mkdir(join(dir, 'assets'), { recursive: true });
      // Copied under a temporary name and renamed, so that `assets/` never holds a partial file.
      const tmp = `${stored}.${randomUUID()}.tmp`;
      try {
        await copyFile(path, tmp, constants.COPYFILE_FICLONE);
        if ((await sha256File(tmp)) !== sha256) {
          throw new Error('The copy does not match the source: the file changed during the import');
        }
        await rename(tmp, stored);
      } catch (error) {
        await rm(tmp, { force: true }).catch(() => undefined);
        throw error;
      }
      created.push(stored);
    }
    assets.set(id, {
      id,
      kind,
      file,
      originalName: basename(path),
      sha256,
      ...(pixel ? { pixel } : {}),
    });
  }

  try {
    for (const path of paths) {
      try {
        await importOne(path);
      } catch (error) {
        throw new Error(`${basename(path)}: ${describeError(error)}`, { cause: error });
      }
    }
  } catch (error) {
    await Promise.all(created.map((file) => rm(file, { force: true }).catch(() => undefined)));
    throw error;
  }
  return [...assets.values()];
}
