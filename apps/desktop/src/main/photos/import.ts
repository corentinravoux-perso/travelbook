import { createHash } from 'node:crypto';
import { constants, createReadStream, type Dirent } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { AssetRef, Book } from '@travelbook/core';
import type { ImportReport } from '../../shared/api';
import { readPhotoMeta } from './exif';
import { createLimiter } from './limit';
import { ensureProxies } from './proxies';

export type { ImportReport };

export interface ImportOptions {
  /** Go into sub-folders of the given folders too. Default: one level only. */
  recursive?: boolean;
}

/** Lower-case, with the dot. */
const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/** Files read, copied and decoded at the same time. */
const IMPORT_CONCURRENCY = 4;

/** Hex digits of the SHA-256 that make an asset id. */
export const ID_LENGTH = 16;

type Candidate = { path: string } | { path: string; failure: string };

/** Album folders hold originals and proxies: importing them would re-import every photo twice. */
const isProjectFolder = (name: string): boolean => name.toLowerCase().endsWith('.travelbook');

const isPhotoName = (name: string): boolean => PHOTO_EXTENSIONS.has(extname(name).toLowerCase());

export function describeError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT') return 'File not found';
  if (code === 'EACCES' || code === 'EPERM') return 'Permission denied';
  return error instanceof Error ? error.message : String(error);
}

/**
 * The photos in a folder, in name order (numbers compared as numbers, so `IMG_2` precedes
 * `IMG_10`). Hidden files and folders are skipped: cameras and macOS leave `._IMG_0001.jpg`
 * companions that are not photos. Symbolic links to folders and `.travelbook` album folders are
 * not entered.
 */
async function listFolder(folder: string, recursive: boolean): Promise<Candidate[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    return [{ path: folder, failure: describeError(error) }];
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const found: Candidate[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      if (recursive && !isProjectFolder(entry.name))
        found.push(...(await listFolder(path, recursive)));
    } else if ((entry.isFile() || entry.isSymbolicLink()) && isPhotoName(entry.name)) {
      found.push({ path });
    }
  }
  return found;
}

/**
 * Turn the paths given by the user into the files to import. A folder gives its photos; a file
 * is kept whatever it is, so that a named file we cannot take is reported, not ignored.
 */
async function expand(paths: string[], recursive: boolean): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  for (const path of paths) {
    let info;
    try {
      info = await stat(path);
    } catch (error) {
      candidates.push({ path, failure: describeError(error) });
      continue;
    }
    if (info.isDirectory()) {
      candidates.push(...(await listFolder(path, recursive)));
    } else if (!isPhotoName(path)) {
      candidates.push({
        path,
        failure: `Unsupported file type: ${extname(path) || 'no extension'}`,
      });
    } else if (!info.isFile()) {
      candidates.push({ path, failure: 'Not a regular file' });
    } else {
      candidates.push({ path });
    }
  }
  return candidates;
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

type Outcome =
  | { kind: 'added'; asset: AssetRef }
  | { kind: 'duplicate'; assetId: string }
  | { kind: 'failed'; reason: string };

/**
 * Import files into a project. Folders are expanded (one level, or all levels with
 * `{ recursive: true }`) and only .jpg, .jpeg, .png and .webp are taken, in any letter case.
 * Each file is copied byte for byte to `originals/<id>.<ext>`, where the id is the first 16 hex
 * digits of its SHA-256, then checked by reading it back and rendering its proxies. A file that
 * fails any step is reported in `failed` and leaves nothing behind; it never stops the others.
 * A file whose id is already in `book.assets`, or was met earlier in this batch, goes to
 * `duplicates`. `book` is only read: the caller adds `added` to it. All three lists follow the
 * order of the given paths. `onProgress` is called once per file as it completes.
 */
export async function importPhotos(
  dir: string,
  book: Book,
  paths: string[],
  onProgress?: (done: number, total: number) => void,
  options: ImportOptions = {},
): Promise<ImportReport> {
  const candidates = await expand(paths, options.recursive ?? false);
  const total = candidates.length;
  await mkdir(join(dir, 'originals'), { recursive: true });

  /** Ids being imported right now, each settling when its import is over, whatever the result. */
  const inFlight = new Map<string, Promise<void>>();
  /** Ids this batch added. */
  const addedIds = new Set<string>();

  /**
   * Files take their turn to claim an id in the order they were given, however long each one
   * took to hash, so that of several identical files the first one given is the one imported.
   * Workers start in that order, which is what makes the line.
   */
  let claimLine: Promise<void> = Promise.resolve();

  async function importFile(path: string): Promise<Outcome> {
    const previous = claimLine;
    let leaveLine!: () => void;
    claimLine = new Promise<void>((resolve) => {
      leaveLine = resolve;
    });

    let sha256: string | undefined;
    let readError: unknown;
    try {
      sha256 = await sha256File(path);
    } catch (error) {
      readError = error;
    }
    await previous;
    leaveLine();
    if (sha256 === undefined) throw readError;
    const id = sha256.slice(0, ID_LENGTH);

    // A twin that is still being imported decides: if it works, this file is a duplicate; if it
    // fails, this file (the same bytes) gets its own try and reports its own failure. Nothing
    // is awaited between the last check and `inFlight.set` below, so the claim is atomic.
    for (;;) {
      if (book.assets[id] !== undefined || addedIds.has(id))
        return { kind: 'duplicate', assetId: id };
      const twin = inFlight.get(id);
      if (twin === undefined) break;
      await twin;
    }

    const work = store(path, id, sha256).then((asset) => {
      addedIds.add(id);
      return asset;
    });
    // Waiters wake up only once this id is out of `inFlight`, and `addedIds` is already set.
    inFlight.set(
      id,
      work
        .then(
          () => undefined,
          () => undefined,
        )
        .then(() => {
          inFlight.delete(id);
        }),
    );
    return { kind: 'added', asset: await work };
  }

  /** Copy, verify and describe one new photo; on any failure remove what was written. */
  async function store(path: string, id: string, sha256: string): Promise<AssetRef> {
    const ext = extname(path).toLowerCase();
    const file = `originals/${id}${ext}`;
    const stored = join(dir, file);
    try {
      await copyFile(path, stored, constants.COPYFILE_FICLONE);
      if ((await sha256File(stored)) !== sha256) {
        throw new Error('The copy does not match the source: the file changed during the import');
      }
      const { pixel, exif } = await readPhotoMeta(stored);
      const asset: AssetRef = {
        id,
        kind: 'photo',
        file,
        originalName: basename(path),
        sha256,
        pixel,
        ...(exif ? { exif } : {}),
      };
      // Rendering the proxies decodes every pixel, which is what proves the file is whole.
      await ensureProxies(dir, asset);
      return asset;
    } catch (error) {
      await Promise.all(
        [
          stored,
          join(dir, 'cache', `${id}.preview.jpg`),
          join(dir, 'cache', `${id}.thumb.jpg`),
        ].map((leftover) => rm(leftover, { force: true }).catch(() => undefined)),
      );
      throw error;
    }
  }

  let done = 0;
  const limit = createLimiter(IMPORT_CONCURRENCY);
  const outcomes = await Promise.all(
    candidates.map((candidate) =>
      limit(async (): Promise<Outcome> => {
        let outcome: Outcome;
        if ('failure' in candidate) {
          outcome = { kind: 'failed', reason: candidate.failure };
        } else {
          try {
            outcome = await importFile(candidate.path);
          } catch (error) {
            outcome = { kind: 'failed', reason: describeError(error) };
          }
        }
        done++;
        try {
          onProgress?.(done, total);
        } catch (error) {
          console.warn('The import progress callback threw:', error);
        }
        return outcome;
      }),
    ),
  );

  const report: ImportReport = { added: [], duplicates: [], failed: [] };
  outcomes.forEach((outcome, i) => {
    const path = (candidates[i] as Candidate).path;
    if (outcome.kind === 'added') report.added.push(outcome.asset);
    else if (outcome.kind === 'duplicate')
      report.duplicates.push({ path, assetId: outcome.assetId });
    else report.failed.push({ path, reason: outcome.reason });
  });
  return report;
}
