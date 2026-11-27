import { access, rename } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { moveRecentProject } from './recent';
import { slugify } from './store';

const SUFFIX = '.travelbook';

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

/**
 * Whether a folder called `name` already bears `title`: `<slug>.travelbook`, as a new album of
 * that title is named, or `<slug>-<n>.travelbook` when that name was taken.
 */
export function folderFitsTitle(name: string, title: string): boolean {
  const slug = slugify(title);
  return name === `${slug}${SUFFIX}` || new RegExp(`^${slug}-\\d+\\${SUFFIX}$`).test(name);
}

/**
 * Give the album folder `dir` the name of its title, where it is: `<slug>.travelbook` as for a
 * new album, `<slug>-2.travelbook` and so on when another folder has that name. Its entry of the
 * recent list follows it. Resolves to the folder as it now is: `dir` itself when its name already
 * fits, or when it cannot be renamed (a file in use, a read-only disk): the album works as well
 * from where it is, and the next close tries again. Never call it on the album main has open.
 */
export async function matchFolderToTitle(dir: string, title: string): Promise<string> {
  if (folderFitsTitle(basename(dir), title)) return dir;
  const parent = dirname(dir);
  const slug = slugify(title);
  for (let n = 1; ; n++) {
    const target = join(parent, `${n === 1 ? slug : `${slug}-${n}`}${SUFFIX}`);
    // On a disk that ignores case, `Islande.travelbook` "exists" as `islande.travelbook`: itself.
    const itself = resolve(target).toLowerCase() === resolve(dir).toLowerCase();
    if (!itself && (await exists(target))) continue;
    try {
      await rename(dir, target);
    } catch (error) {
      console.warn(`Could not rename the album folder ${dir}:`, error);
      return dir;
    }
    await moveRecentProject(dir, target).catch((error: unknown) =>
      console.warn('Could not update the recent projects list:', error),
    );
    return target;
  }
}
