import { createHash } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomic } from './atomic-write';

/** Long edge of the cover thumbnail, in px. */
export const COVER_THUMB_EDGE = 320;

/** Where a project keeps its cover thumbnail: a cache, rebuilt when missing (spec §7.1). */
export const COVER_THUMB_FILE = join('cache', 'cover-thumb.jpg');

/**
 * `tb://cover/<id>` names the cover thumbnail of a project that is not necessarily the open one
 * (the home screen lists albums that are closed). The renderer never names a folder: the id is a
 * digest of the folder, and main only answers for the folders it listed itself.
 */
const dirsById = new Map<string, string>();

/** The id of a project folder in `tb://cover/<id>`; remembers which folder it stands for. */
export function coverId(dir: string): string {
  const id = createHash('sha256').update(dir).digest('hex').slice(0, 16);
  dirsById.set(id, dir);
  return id;
}

/** The project folder a cover id stands for, if main handed that id out. */
export function coverDirOf(id: string): string | undefined {
  return dirsById.get(id);
}

/** Replace the cover thumbnail of the project in `dir` with these JPEG bytes. */
export async function writeCoverThumb(dir: string, jpeg: Uint8Array): Promise<void> {
  await mkdir(join(dir, 'cache'), { recursive: true });
  await writeFileAtomic(join(dir, COVER_THUMB_FILE), jpeg);
}

/**
 * `tb://cover/<id>?v=<mtime>` when the project has a cover thumbnail, else `undefined`. The
 * query only defeats the page's image cache after the thumbnail was rewritten.
 */
export async function coverThumbUrl(dir: string): Promise<string | undefined> {
  try {
    const info = await stat(join(dir, COVER_THUMB_FILE));
    if (!info.isFile()) return undefined;
    return `tb://cover/${coverId(dir)}?v=${Math.floor(info.mtimeMs)}`;
  } catch {
    return undefined;
  }
}
