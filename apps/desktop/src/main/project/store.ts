import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { BookFormatError, bookForSave, migrate, newBook, type Book } from '@travelbook/core';
import { writeFileAtomic } from './atomic-write';
import { addRecentProject } from './recent';

export interface ProjectHandle {
  dir: string;
  book: Book;
}

const BOOK_FILE = 'book.json';
const PROJECT_SUBDIRS = ['originals', 'assets', 'cache', 'history'] as const;

const LIGATURES: Record<string, string> = { œ: 'oe', æ: 'ae', ß: 'ss' };

/**
 * Lowercase, accents stripped, every run of non-alphanumerics becomes one dash. Letters that do
 * not decompose under NFD but are common in French (`œ`) are transliterated first.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[œæß]/g, (c) => LIGATURES[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'album' : slug;
}

/** Create the first free `<slug>[-n].travelbook` folder; `mkdir` without recursion is the race-free test. */
async function makeProjectFolder(parentDir: string, name: string): Promise<string> {
  await mkdir(parentDir, { recursive: true });
  const slug = slugify(name);
  for (let n = 1; ; n++) {
    const dir = join(parentDir, `${n === 1 ? slug : `${slug}-${n}`}.travelbook`);
    try {
      await mkdir(dir);
      return dir;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
}

/** The recent list is a convenience: failing to update it must not fail the project operation. */
async function noteRecent(dir: string, book: Book): Promise<void> {
  try {
    await addRecentProject({ dir, title: book.title });
  } catch (error) {
    console.warn('Could not update the recent projects list:', error);
  }
}

/**
 * Replace `book.json` atomically: a failure leaves the previous file untouched. The file is
 * `bookForSave(book)`: the format version of what it holds (2 with a map, else 1) and no geometry
 * asset of a map that is gone, whatever the book in memory says.
 */
export function saveBook(dir: string, book: Book): Promise<void> {
  return writeFileAtomic(join(dir, BOOK_FILE), JSON.stringify(bookForSave(book), null, 2) + '\n');
}

export async function createProject(opts: {
  name: string;
  parentDir: string;
  format?: Book['format'];
}): Promise<ProjectHandle> {
  const dir = await makeProjectFolder(opts.parentDir, opts.name);
  await Promise.all(PROJECT_SUBDIRS.map((sub) => mkdir(join(dir, sub))));
  const book = newBook({ title: opts.name, ...(opts.format ? { format: opts.format } : {}) });
  await saveBook(dir, book);
  await noteRecent(dir, book);
  return { dir, book };
}

async function readBook(dir: string): Promise<Book> {
  let text: string;
  try {
    text = await readFile(join(dir, BOOK_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new BookFormatError(
        `Ce dossier n'est pas un album Travelbook : ${BOOK_FILE} est introuvable.`,
      );
    }
    throw error;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BookFormatError(`Fichier d'album illisible : ${BOOK_FILE} n'est pas un JSON valide.`);
  }
  return migrate(raw);
}

/** An asset is present when its file exists inside the project folder. */
async function isPresent(dir: string, file: string): Promise<boolean> {
  const path = resolve(dir, file);
  const rel = relative(resolve(dir), path);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
  return access(path).then(
    () => true,
    () => false,
  );
}

/**
 * Open a project folder: migrate its book, drop a leftover `book.json.tmp` from an interrupted
 * save, recreate `cache/` if it is gone, and list the assets whose original file is missing.
 */
export async function openProject(dir: string): Promise<ProjectHandle & { missing: string[] }> {
  const book = await readBook(dir);
  await rm(join(dir, `${BOOK_FILE}.tmp`), { force: true });
  await mkdir(join(dir, 'cache'), { recursive: true });
  const missing: string[] = [];
  for (const [id, asset] of Object.entries(book.assets)) {
    if (!(await isPresent(dir, asset.file))) missing.push(id);
  }
  await noteRecent(dir, book);
  return { dir, book, missing };
}
