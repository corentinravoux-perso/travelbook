import { resolve } from 'node:path';
import { currentSession, recordBook } from '../session';
import { matchFolderToTitle } from './folder';
import { recentProjects, retitleRecentProject } from './recent';
import { readBook, saveBook, type ProjectHandle } from './store';

/** The longest title an album may have (as when it is created). */
export const MAX_TITLE_LENGTH = 200;

/**
 * Give the album in `dir` a new title, from the home screen: `book.json` takes it, the folder
 * takes its name (`matchFolderToTitle`: `<slug>.travelbook`, kept as it is when it cannot be
 * renamed) and the recent list shows both where the album already stands. The snapshots of
 * `history/` keep their own title (a restore brings back the book as it was, title included).
 * Only an album of the recent list whose folder holds a readable book is renamed. When main
 * still has it open (its close waits for an import), only its title changes now, in the session
 * book too; its folder follows when it closes.
 */
export async function renameProject(dir: string, title: string): Promise<ProjectHandle> {
  const name = title.trim();
  if (name === '' || name.length > MAX_TITLE_LENGTH) {
    throw new Error(`An album title has 1 to ${MAX_TITLE_LENGTH} characters`);
  }
  const target = resolve(dir);
  const listed = (await recentProjects()).find((r) => resolve(r.dir) === target);
  if (!listed) throw new Error('Only an album of the recent list can be renamed');
  const book = { ...(await readBook(listed.dir)), title: name };
  await saveBook(listed.dir, book);
  try {
    await retitleRecentProject(listed.dir, name);
  } catch (error) {
    // The recent list is a convenience: the album is renamed all the same.
    console.warn('Could not update the recent projects list:', error);
  }
  const session = currentSession();
  if (session && resolve(session.dir) === target) {
    recordBook(session, book);
    return { dir: listed.dir, book };
  }
  return { dir: await matchFolderToTitle(listed.dir, name), book };
}
