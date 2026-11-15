import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';
import type { AssetRef } from '@travelbook/core';
import type { ImportedAssetKind } from '../../shared/api';
import { sanitizeSvg } from '../library/stickers/sanitizeSvg';
import { copyFileVerified, describeError, ID_LENGTH, sha256File } from '../photos/import';

const RASTER_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const RASTER_FORMATS = new Set(['png', 'jpeg', 'webp']);

/** Lower-case, with the dot. */
export const ASSET_EXTENSIONS: Record<ImportedAssetKind, ReadonlySet<string>> = {
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
 * An SVG must parse but has no pixel size; `importAssetFiles` sanitises it before it gets here.
 */
export async function inspectImage(
  input: string | Buffer,
  ext: string,
): Promise<{ w: number; h: number } | undefined> {
  const meta = await sharp(input).metadata();
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
  await sharp(input).resize({ width: CHECK_EDGE, height: CHECK_EDGE, fit: 'inside' }).toBuffer();
  return { w, h };
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/**
 * Copy files into the project's `assets/` as `assets/<sha16>.<ext>`, where `sha16` is the first
 * 16 hex digits of the SHA-256 and the extension is lower-cased. A file already there is not
 * copied again. The asset's id is `<kind>-<sha16>`, not the bare `sha16` of a photo: ids key
 * `Book.assets`, and a photo used as a background (same bytes) must not replace the photo, nor
 * be mistaken for it by the photo import. The same bytes give the same asset of a given kind
 * however often they come, and one file is shared by the kinds. Raster images are decoded to prove they are whole and are measured; fonts are taken
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
  const extensions = ASSET_EXTENSIONS[kind];
  if (extensions === undefined) throw new Error(`Unsupported asset kind: ${String(kind)}`);
  const assets = new Map<string, AssetRef>();
  /** Files this call put in `assets/`. */
  const created: string[] = [];

  /** Sanitised copies of SVG files, in a scratch folder removed when the call ends. */
  let scratch: string | undefined;

  /**
   * The file whose bytes are stored. An SVG is sanitised first, whatever its origin (spec: every
   * SVG is sanitised before it is stored): when that changes it, a clean copy in a scratch folder
   * is stored instead, and a file that is not an acceptable SVG is refused.
   */
  async function storableSource(path: string, ext: string): Promise<string> {
    if (ext !== '.svg') return path;
    const original = await readFile(path);
    const clean = Buffer.from(sanitizeSvg(original.toString('utf8')), 'utf8');
    if (clean.equals(original)) return path;
    scratch ??= await mkdtemp(join(tmpdir(), 'tb-svg-'));
    const file = join(scratch, `${assets.size}-${created.length}.svg`);
    await writeFile(file, clean);
    return file;
  }

  async function importOne(path: string): Promise<void> {
    const info = await stat(path);
    if (!info.isFile()) throw new Error('Not a regular file');
    const ext = extname(path).toLowerCase();
    if (!extensions.has(ext)) {
      throw new Error(`Unsupported file type for a ${kind}: ${ext || 'no extension'}`);
    }
    const source = await storableSource(path, ext);
    const pixel = kind === 'font' ? undefined : await inspectImage(source, ext);

    const sha256 = await sha256File(source);
    const hash16 = sha256.slice(0, ID_LENGTH);
    const id = `${kind}-${hash16}`;
    if (assets.has(id)) return;
    const file = `assets/${hash16}${ext}`;
    const stored = join(dir, file);
    if (!(await exists(stored))) {
      await mkdir(join(dir, 'assets'), { recursive: true });
      await copyFileVerified(source, stored, sha256);
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
  } finally {
    if (scratch !== undefined) await rm(scratch, { recursive: true, force: true });
  }
  return [...assets.values()];
}
