import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssetRef, Licence } from '@travelbook/core';
import { sanitizeSvg } from '../library/stickers/sanitizeSvg';
import { ID_LENGTH } from '../photos/import';
import { inspectImage } from './import-files';

/**
 * Store an SVG made by the renderer (a recoloured poster illustration) in the project's
 * `assets/` as a sticker: sanitised first, then kept as `assets/<sha16>.svg` with the id
 * `sticker-<sha16>` (the convention of `importAssetFiles`), written once whatever the number of
 * calls. `name` becomes the original name; `licence`, when given, travels with the asset to the
 * credits (none for the user's own file).
 */
export async function assetFromSvg(
  dir: string,
  svg: string,
  meta: { name: string; licence?: Licence },
): Promise<AssetRef> {
  const clean = Buffer.from(sanitizeSvg(svg), 'utf8');
  await inspectImage(clean, '.svg');
  const sha256 = createHash('sha256').update(clean).digest('hex');
  const hash16 = sha256.slice(0, ID_LENGTH);
  const file = `assets/${hash16}.svg`;
  const stored = join(dir, file);
  const there = await stat(stored).then(
    () => true,
    () => false,
  );
  if (!there) {
    await mkdir(join(dir, 'assets'), { recursive: true });
    await writeFile(stored, clean);
  }
  return {
    id: `sticker-${hash16}`,
    kind: 'sticker',
    file,
    originalName: `${meta.name}.svg`,
    sha256,
    ...(meta.licence ? { licence: { ...meta.licence } } : {}),
  };
}
