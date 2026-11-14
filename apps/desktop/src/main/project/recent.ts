import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RecentProject } from '../../shared/api';
import { serialize, writeFileAtomic } from './atomic-write';

export type { RecentProject };

export const MAX_RECENT_PROJECTS = 20;
const FILE_NAME = 'recent-projects.json';

let injectedDir: string | null = null;

/** Point the recent list at a directory (tests). Pass null to use Electron's userData again. */
export function setUserDataDir(dir: string | null): void {
  injectedDir = dir;
}

async function userDataDir(): Promise<string> {
  if (injectedDir !== null) return injectedDir;
  // Loaded lazily so that importing this module never requires Electron (unit tests).
  const { app } = await import('electron');
  return app.getPath('userData');
}

function isRecentProject(value: unknown): value is RecentProject {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['dir'] === 'string' &&
    typeof v['title'] === 'string' &&
    typeof v['openedAt'] === 'string' &&
    (v['coverThumb'] === undefined || typeof v['coverThumb'] === 'string')
  );
}

async function readList(file: string): Promise<RecentProject[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    // Missing or unreadable: the recent list is a convenience, start again from empty.
    return [];
  }
  return Array.isArray(parsed) ? parsed.filter(isRecentProject) : [];
}

/** Recently opened projects, most recent first. */
export async function recentProjects(): Promise<RecentProject[]> {
  return readList(join(await userDataDir(), FILE_NAME));
}

/**
 * Put a project at the front of the recent list (de-duplicated by `dir`, at most 20 entries).
 * A re-add that carries no `coverThumb` keeps the one already stored.
 */
export async function addRecentProject(
  entry: Pick<RecentProject, 'dir' | 'title'> & { coverThumb?: string },
): Promise<void> {
  const dir = await userDataDir();
  const file = join(dir, FILE_NAME);
  await serialize(`recent:${file}`, async () => {
    const list = await readList(file);
    const previous = list.find((r) => r.dir === entry.dir);
    const coverThumb = entry.coverThumb ?? previous?.coverThumb;
    const next: RecentProject = {
      dir: entry.dir,
      title: entry.title,
      openedAt: new Date().toISOString(),
      ...(coverThumb !== undefined ? { coverThumb } : {}),
    };
    const updated = [next, ...list.filter((r) => r.dir !== entry.dir)].slice(
      0,
      MAX_RECENT_PROJECTS,
    );
    await mkdir(dir, { recursive: true });
    await writeFileAtomic(file, JSON.stringify(updated, null, 2) + '\n');
  });
}
