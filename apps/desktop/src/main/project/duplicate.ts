import { cp, mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { migrate, newId, bookForSave } from '@travelbook/core';
import type { Book } from '@travelbook/core';
import { writeFileAtomic } from './atomic-write';
import { noteRecent, readBook, saveBook, slugify } from './store';
import type { ProjectHandle } from './store';

const HISTORY_DIR = 'history';

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/** `<title> (copie)`, then `(copie 2)`, … for the first one whose folder is free. */
async function freeName(parentDir: string, title: string): Promise<{ title: string; dir: string }> {
  for (let n = 1; ; n++) {
    const candidate = `${title} (copie${n === 1 ? '' : ` ${n}`})`;
    const dir = join(parentDir, `${slugify(candidate)}.travelbook`);
    if (!(await exists(dir))) return { title: candidate, dir };
  }
}

/** Snapshots carry the whole book: give them the copy's id and title too (a restore keeps both). */
async function rewriteSnapshots(dir: string, id: string, title: string): Promise<void> {
  const historyDir = join(dir, HISTORY_DIR);
  let names: string[];
  try {
    names = await readdir(historyDir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const file = join(historyDir, name);
    try {
      const snapshot: Book = migrate(JSON.parse(await readFile(file, 'utf8')));
      await writeFileAtomic(
        file,
        JSON.stringify(bookForSave({ ...snapshot, id, title }), null, 2) + '\n',
      );
    } catch {
      // An unreadable snapshot is skipped by the history list as well: copy it as it is.
    }
  }
}

/**
 * Copy the project folder `dir` next to itself as `<title> (copie)` (`(copie 2)`, …), with a new
 * book id and the new title in `book.json` and in every snapshot, so the two albums never share
 * an id. The copy is built in a temporary sibling folder and renamed into place: a failure at any
 * point leaves no folder behind. The copy is added to the recent list.
 */
export async function duplicateProject(dir: string): Promise<ProjectHandle> {
  const source = await readBook(dir);
  const parentDir = dirname(dir);
  const { title, dir: target } = await freeName(parentDir, source.title);
  const book: Book = { ...source, id: newId(), title };
  const temp = await mkdtemp(join(parentDir, `.${basename(target)}.tmp-`));
  try {
    await cp(dir, temp, {
      recursive: true,
      filter: (path) => basename(path) !== 'book.json.tmp',
    });
    await saveBook(temp, book);
    await rewriteSnapshots(temp, book.id, title);
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
  await noteRecent(target, book);
  return { dir: target, book };
}
