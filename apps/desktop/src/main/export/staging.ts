import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Start of the name of the hidden folder a run works in, inside the output folder. Same volume as
 * the output, so that publishing a file is a rename.
 */
export const STAGING_PREFIX = '.travelbook-export-';

const ignore = (): undefined => undefined;

/**
 * Make the output folder if needed and, inside it, a staging folder for one run. A run writes its
 * files there and moves them out with `publishStaged` once it is complete, so an earlier export in
 * the same folder is untouched until then. Staging folders of runs that died (a crash, a kill) are
 * removed first: only one export runs at a time.
 */
export async function createStaging(outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const entries = await readdir(outDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((e) => e.isDirectory() && e.name.startsWith(STAGING_PREFIX))
      .map((e) => rm(join(outDir, e.name), { recursive: true, force: true }).catch(ignore)),
  );
  const staging = join(outDir, `${STAGING_PREFIX}${randomUUID()}`);
  await mkdir(staging);
  return staging;
}

/**
 * Move `names` from `staging` into `outDir`, replacing the files of the same names, and return
 * their paths. All or nothing: an earlier file is first moved aside into `staging`, and if any move
 * fails every earlier file is put back and every new one removed (a file open in a PDF viewer
 * cannot be replaced on Windows, for one). `staging` is the caller's to remove.
 */
export async function publishStaged(
  staging: string,
  outDir: string,
  names: string[],
): Promise<string[]> {
  const aside = join(staging, '.replaced');
  await mkdir(aside, { recursive: true });
  const moved: { name: string; hadEarlier: boolean }[] = [];
  try {
    for (const name of names) {
      const target = join(outDir, name);
      const hadEarlier = await rename(target, join(aside, name)).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return false;
          throw error;
        },
      );
      moved.push({ name, hadEarlier });
      await rename(join(staging, name), target);
    }
  } catch (error) {
    for (const { name, hadEarlier } of moved.reverse()) {
      await rm(join(outDir, name), { force: true }).catch(ignore);
      if (hadEarlier) await rename(join(aside, name), join(outDir, name)).catch(ignore);
    }
    throw error;
  }
  return names.map((name) => join(outDir, name));
}
