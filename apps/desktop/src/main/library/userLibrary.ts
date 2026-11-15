import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { z } from 'zod';
import { LicenceSchema, type AssetRef, type Book, type Licence } from '@travelbook/core';
import type { LibraryItem, LibraryItemKind, LibraryQuery } from '../../shared/api';
import {
  ASSET_EXTENSIONS,
  copyFileVerified,
  importAssetFiles,
  inspectImage,
} from '../assets/import-files';
import { describeError, ID_LENGTH, sha256File } from '../photos/import';
import { serialize, writeFileAtomic } from '../project/atomic-write';
import { projectFilePath } from '../protocol';
import { userDataDir } from '../user-data';
import { sanitizeSvg } from './stickers/sanitizeSvg';

export type { LibraryItem, LibraryQuery };

/** The library folder inside the user's data folder. */
export const LIBRARY_FOLDER = 'library';
const INDEX_FILE = 'index.json';
const FILES_FOLDER = 'files';
const INDEX_VERSION = 1;

/** Absolute path of the library folder (`<userData>/library`); it may not exist yet. */
export async function libraryDir(): Promise<string> {
  return join(await userDataDir(), LIBRARY_FOLDER);
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
/** `files/<id>.<ext>`: the one place an item's file may be, so that a hand-edited index cannot point elsewhere. */
const FILE_PATTERN = /^files\/[A-Za-z0-9_-]{1,128}\.[a-z0-9]{1,8}$/;
const EXTENSION_PATTERN = /^\.[a-z0-9]{1,8}$/;

const LibraryItemSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  kind: z.enum(['sticker', 'background', 'font', 'template']),
  file: z.string().regex(FILE_PATTERN),
  title: z.string(),
  tags: z.array(z.string()),
  licence: LicenceSchema.optional(),
  addedAt: z.string(),
  favourite: z.boolean(),
  lastUsedAt: z.string().optional(),
});

const IndexSchema = z.object({ items: z.array(z.unknown()) });

/**
 * The items of the index. No index yet is an empty library, and an entry that is not a well-formed
 * item (or names a file outside `files/`) is left out: the library is a convenience and must not
 * stop the app. An index that is not an index at all (hand-edited) is set aside as
 * `index.json.corrupt` and read as empty, so that the next write does not destroy it. Any other
 * failure to read (permissions, a lock held by another program) is an error, not an empty
 * library: the next write would replace a library that is only unreadable for the moment.
 * Writes are atomic, so a crash cannot leave a half-written index.
 */
async function readIndex(root: string): Promise<LibraryItem[]> {
  const file = join(root, INDEX_FILE);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  let parsed: z.infer<typeof IndexSchema>;
  try {
    parsed = IndexSchema.parse(JSON.parse(text));
  } catch {
    await rename(file, `${file}.corrupt`).catch(() => undefined);
    return [];
  }
  const items: LibraryItem[] = [];
  for (const entry of parsed.items) {
    const item = LibraryItemSchema.safeParse(entry);
    if (item.success && item.data.file.startsWith(`${FILES_FOLDER}/${item.data.id}.`)) {
      items.push(item.data);
    }
  }
  return items;
}

/**
 * `tb://library/<id>` is answered from this synchronous map of item id to file, because the
 * protocol handler looks files up synchronously. Every read and write of the index refreshes it
 * (they all run in one queue, so it never goes back to an older index).
 */
let fileById = new Map<string, string>();

/** The file of a library item, relative to the library folder: the `tb://library` lookup. */
export function libraryFile(itemId: string): string | undefined {
  return fileById.get(itemId);
}

const remember = (items: readonly LibraryItem[]): void => {
  fileById = new Map(items.map((item) => [item.id, item.file]));
};

/** Run `task` on the library's items, one task at a time per library folder. */
async function withIndex<T>(
  task: (
    items: LibraryItem[],
    commit: (next: LibraryItem[]) => Promise<void>,
    root: string,
  ) => Promise<T>,
): Promise<T> {
  const root = await libraryDir();
  return serialize(`library:${root}`, async () => {
    const items = await readIndex(root);
    remember(items);
    const commit = async (next: LibraryItem[]): Promise<void> => {
      await mkdir(root, { recursive: true });
      await writeFileAtomic(
        join(root, INDEX_FILE),
        JSON.stringify({ version: INDEX_VERSION, items: next }, null, 2) + '\n',
      );
      remember(next);
    };
    return task(items, commit, root);
  });
}

/** Read the index so that `libraryFile` knows the items already on disk (call once at start-up). */
export async function primeLibraryLookup(): Promise<void> {
  await withIndex(async () => undefined);
}

export interface LibrarySource {
  /** A file to copy. Exactly one of `path` and `bytes`. */
  path?: string;
  bytes?: Buffer;
  /** File extension: lower-cased, with or without the dot (`.png`, `PNG`). */
  ext: string;
}

export interface LibraryMeta {
  title: string;
  tags?: string[];
  licence?: Licence;
}

const cleanTags = (tags: readonly string[] = []): string[] => [
  ...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag !== '')),
];

/**
 * Keep a copy of a file in the library. The item's id is `<kind>-<sha16>` of the bytes, so the
 * same bytes added again give the item that is already there, unchanged. The copy is stored as
 * `files/<id>.<ext>` and the index is updated only after the file is in place; if the index
 * cannot be written the new file is removed again.
 *
 * Images are decoded to prove they are whole, like an album import does. An SVG goes through
 * `sanitizeSvg` first (scripts, event handlers and external references are removed, a file that
 * is not an SVG is refused), and it is the sanitised file that is hashed and stored, so the id
 * still matches the stored bytes. Templates are not files: they are kept with `saveUserTemplate`.
 */
export async function addToLibrary(
  kind: LibraryItemKind,
  src: LibrarySource,
  meta: LibraryMeta,
): Promise<LibraryItem> {
  if (kind === 'template') {
    throw new Error('A template is not a library file: save it with saveUserTemplate');
  }
  const allowed = ASSET_EXTENSIONS[kind];
  if (allowed === undefined) throw new Error(`Unsupported library kind: ${String(kind)}`);
  const ext = (src.ext.startsWith('.') ? src.ext : `.${src.ext}`).toLowerCase();
  if (!EXTENSION_PATTERN.test(ext) || !allowed.has(ext)) {
    throw new Error(`Unsupported file type for a ${kind}: ${src.ext || 'no extension'}`);
  }
  if ((src.path === undefined) === (src.bytes === undefined)) {
    throw new Error('A library source is given by its path or bytes, not both and not neither');
  }
  const title = meta.title.trim();
  if (title === '') throw new Error('A library item needs a title');

  return withIndex(async (items, commit, root) => {
    // An SVG is sanitised before anything else, whatever its origin: the clean bytes replace
    // the source from here on.
    let source: LibrarySource = src;
    if (ext === '.svg') {
      const raw = src.path !== undefined ? await readFile(src.path) : (src.bytes as Buffer);
      source = { bytes: Buffer.from(sanitizeSvg(raw.toString('utf8')), 'utf8'), ext };
    }
    let sha256: string;
    if (source.path !== undefined) {
      if (!(await stat(source.path)).isFile()) throw new Error('Not a regular file');
      sha256 = await sha256File(source.path);
    } else {
      sha256 = createHash('sha256')
        .update(source.bytes as Buffer)
        .digest('hex');
    }
    const id = `${kind}-${sha256.slice(0, ID_LENGTH)}`;
    const existing = items.find((item) => item.id === id);
    if (existing) return existing;

    if (kind !== 'font') await inspectImage(source.path ?? (source.bytes as Buffer), ext);

    const file = `${FILES_FOLDER}/${id}${ext}`;
    const stored = join(root, file);
    await mkdir(join(root, FILES_FOLDER), { recursive: true });
    if (source.path !== undefined) await copyFileVerified(source.path, stored, sha256);
    else await writeFileAtomic(stored, source.bytes as Buffer);

    const item: LibraryItem = {
      id,
      kind,
      file,
      title,
      tags: cleanTags(meta.tags),
      ...(meta.licence ? { licence: meta.licence } : {}),
      addedAt: new Date().toISOString(),
      favourite: false,
    };
    try {
      await commit([...items, item]);
    } catch (error) {
      await rm(stored, { force: true }).catch(() => undefined);
      throw error;
    }
    return item;
  });
}

/** The most files a dropped folder may give. */
export const MAX_FOLDER_FILES = 2000;

/**
 * The files to add to the library for the paths the user dropped: a file is kept as it is (a
 * wrong one is reported when it is added), a folder gives the files of the kind in it and in its
 * sub-folders, in name order. Hidden entries and `.travelbook` albums are skipped.
 */
export async function expandLibraryPaths(
  kind: Exclude<LibraryItemKind, 'template'>,
  paths: readonly string[],
): Promise<string[]> {
  const allowed = ASSET_EXTENSIONS[kind];
  const out: string[] = [];
  const walk = async (folder: string): Promise<void> => {
    const entries = await readdir(folder, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.endsWith('.travelbook')) continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && allowed.has(extname(entry.name).toLowerCase())) out.push(path);
      if (out.length > MAX_FOLDER_FILES) throw new Error('Too many files in the folder');
    }
  };
  for (const path of paths) {
    // A path that cannot be read stays in the list: adding it names the file in the error.
    const info = await stat(path).catch(() => undefined);
    if (info?.isDirectory()) await walk(path);
    else out.push(path);
  }
  return out;
}

/** ISO 8601 timestamps in the same zone sort as text; no locale involved. */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Lower case, accents removed: `Été` and `ete` are the same word. */
const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const matchesText = (item: LibraryItem, words: readonly string[]): boolean => {
  const haystack = fold([item.title, ...item.tags].join('\n'));
  return words.every((word) => haystack.includes(word));
};

/**
 * The items of one kind, newest first (items added within the same millisecond keep the later
 * one first). `text` and `favourite` filter; `recent: n` then keeps the `n` items used most
 * recently, most recent first, and drops the ones never used.
 */
export async function listLibrary(
  kind: LibraryItemKind,
  query: LibraryQuery = {},
): Promise<LibraryItem[]> {
  const all = await withIndex(async (items) => items);
  const words = fold(query.text ?? '')
    .split(/\s+/)
    .filter((word) => word !== '');
  // Position in the index breaks ties: it is the order of addition.
  let found = all
    .map((item, position) => ({ item, position }))
    .filter(
      ({ item }) =>
        item.kind === kind &&
        (query.favourite !== true || item.favourite) &&
        matchesText(item, words),
    );
  if (query.recent !== undefined) {
    found = found
      .filter(({ item }) => item.lastUsedAt !== undefined)
      .sort(
        (a, b) =>
          compare(b.item.lastUsedAt as string, a.item.lastUsedAt as string) ||
          b.position - a.position,
      )
      .slice(0, Math.max(0, query.recent));
  } else {
    found.sort((a, b) => compare(b.item.addedAt, a.item.addedAt) || b.position - a.position);
  }
  return found.map(({ item }) => item);
}

/** Change one item and write the index. */
function updateItem(itemId: string, change: (item: LibraryItem) => LibraryItem): Promise<void> {
  return withIndex(async (items, commit) => {
    if (!items.some((item) => item.id === itemId)) {
      throw new Error(`Unknown library item: ${itemId}`);
    }
    await commit(items.map((item) => (item.id === itemId ? change(item) : item)));
  });
}

export function setFavourite(itemId: string, on: boolean): Promise<void> {
  return updateItem(itemId, (item) => ({ ...item, favourite: on }));
}

/** Remember that an item was just used (copied into an album). */
export function touchUsed(itemId: string): Promise<void> {
  return updateItem(itemId, (item) => ({ ...item, lastUsedAt: new Date().toISOString() }));
}

/**
 * Forget an item and delete its file; an item that is not there is not an error. The index is
 * written first: a crash in between leaves an unlisted file, never a listed item without a file.
 * Albums that copied the item keep their copy.
 */
export async function removeFromLibrary(itemId: string): Promise<void> {
  await withIndex(async (items, commit, root) => {
    const item = items.find((candidate) => candidate.id === itemId);
    if (item === undefined) return;
    await commit(items.filter((candidate) => candidate !== item));
    await rm(join(root, item.file), { force: true });
  });
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/**
 * Copy a library item into a project's `assets/` and describe it as `importFiles` would: id
 * `<kind>-<sha16>`, file `assets/<sha16>.<ext>`, pixel size for an image. The asset also carries
 * the item's licence, and the item's title (with the extension) as its original name.
 *
 * Copying twice gives one file and one asset: an asset of that id that `book.assets` already
 * holds, with its file in the folder, is returned as it is (with the item's licence if it had
 * none); a file already in `assets/`, whether it came from this library or from an import of the
 * same bytes, is not copied again. `book` is only read.
 */
export async function copyIntoProject(dir: string, book: Book, itemId: string): Promise<AssetRef> {
  const { items, root } = await withIndex(async (items, _commit, root) => ({ items, root }));
  const item = items.find((i) => i.id === itemId);
  if (item === undefined) throw new Error(`Unknown library item: ${itemId}`);
  if (item.kind === 'template') {
    throw new Error(`Library item ${itemId} is a template, not a file to copy into a project`);
  }

  const held = book.assets[item.id];
  if (held !== undefined) {
    const heldFile = projectFilePath(dir, held.file);
    if (heldFile !== null && (await exists(heldFile))) {
      // Same bytes, so the same asset; it only gains the licence it did not have.
      return held.licence === undefined && item.licence ? { ...held, licence: item.licence } : held;
    }
  }

  const source = join(root, item.file);
  // Checked before anything is copied: a library file that was replaced would otherwise land in
  // `assets/` under a name that is not its id.
  let actual: string;
  try {
    actual = await sha256File(source);
  } catch (error) {
    throw new Error(`${item.title}: ${describeError(error)}`, { cause: error });
  }
  if (`${item.kind}-${actual.slice(0, ID_LENGTH)}` !== item.id) {
    throw new Error(`The library file of ${item.title} changed since it was added`);
  }

  const [asset] = await importAssetFiles(dir, item.kind, [source]);
  if (asset === undefined) throw new Error(`${item.title}: nothing was copied`);
  return {
    ...asset,
    originalName: `${item.title}${extname(item.file)}`,
    ...(item.licence ? { licence: item.licence } : {}),
  };
}
