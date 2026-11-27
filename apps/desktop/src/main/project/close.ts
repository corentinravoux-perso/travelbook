import { serialize, isBusy } from './atomic-write';
import { geometryLock } from '../maps/purge-geometries';
import { closeSession, currentSession, projectQueue } from '../session';
import { matchFolderToTitle } from './folder';

/**
 * Close the album main has open (the one of book `bookId`, when given: another one is left
 * open), once what still writes into its folder is done (an import, a font copy, a purge of map
 * geometries), then give its folder the name of its title (`matchFolderToTitle`). With
 * `onlyIfIdle` (the app quits) nothing is waited for: a folder still in use keeps its name until
 * the album is closed again. Renaming a folder while the album is open would pull it from under
 * its imports, its exports and the `tb:` pictures: that is why it waits for the close.
 */
export async function closeProject(
  options: { bookId?: string; onlyIfIdle?: boolean } = {},
): Promise<void> {
  const session = currentSession();
  if (session === null) return;
  if (options.bookId !== undefined && session.book.id !== options.bookId) return;
  const queues = [projectQueue(session.dir), geometryLock(session.dir)];
  const idle = !queues.some(isBusy);
  if (!idle && !options.onlyIfIdle) {
    for (const queue of queues) await serialize(queue, async () => undefined);
  }
  // Another album was opened, or this one again, while the queues emptied.
  if (currentSession() !== session) return;
  closeSession();
  if (idle || !options.onlyIfIdle) await matchFolderToTitle(session.dir, session.book.title);
}
