import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { currentSession } from '../session';
import { recentProjects, removeRecentProject } from './recent';
import { readBook } from './store';

/**
 * Delete the album in `dir` from the home screen: its folder goes to the system trash through
 * `trash` (never removed for good, so the user can take it back), then it leaves the recent list.
 * Only an album of the recent list, which is not the one open, and whose folder holds a readable
 * book, is trashed; a folder that is already gone just leaves the list.
 */
export async function deleteProject(
  dir: string,
  trash: (path: string) => Promise<void>,
): Promise<void> {
  const target = resolve(dir);
  const session = currentSession();
  if (session && resolve(session.dir) === target) {
    throw new Error('The open album cannot be deleted');
  }
  const listed = (await recentProjects()).some((r) => resolve(r.dir) === target);
  if (!listed) throw new Error('Only an album of the recent list can be deleted');
  const there = await stat(target).then(
    () => true,
    () => false,
  );
  if (there) {
    await readBook(target); // throws when the folder is not an album: nothing is trashed
    await trash(target);
  }
  await removeRecentProject(target);
}
