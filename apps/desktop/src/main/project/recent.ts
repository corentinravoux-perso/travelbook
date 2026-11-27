import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { RecentProject } from '../../shared/api';
import { userDataDir } from '../user-data';
import { serialize, writeFileAtomic } from './atomic-write';
import { coverThumbUrl } from './cover-thumb';

export type { RecentProject };

export const MAX_RECENT_PROJECTS = 20;
const FILE_NAME = 'recent-projects.json';

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

/**
 * Recently opened projects, most recent first. A project's cover thumbnail is looked up on disk
 * each time (`tb://cover/<id>`), so a deleted cache simply shows no cover until it is rebuilt.
 */
export async function recentProjects(): Promise<RecentProject[]> {
  const list = await readList(join(await userDataDir(), FILE_NAME));
  return Promise.all(
    list.map(async (entry) => {
      const coverThumb = (await coverThumbUrl(entry.dir)) ?? entry.coverThumb;
      const base: RecentProject = { dir: entry.dir, title: entry.title, openedAt: entry.openedAt };
      return coverThumb === undefined ? base : { ...base, coverThumb };
    }),
  );
}

/** Take a project out of the recent list (its folder is left alone). */
export async function removeRecentProject(projectDir: string): Promise<void> {
  const dir = await userDataDir();
  const file = join(dir, FILE_NAME);
  await serialize(`recent:${file}`, async () => {
    const list = await readList(file);
    const kept = list.filter((r) => resolve(r.dir) !== resolve(projectDir));
    if (kept.length === list.length) return;
    await writeFileAtomic(file, JSON.stringify(kept, null, 2) + '\n');
  });
}

/**
 * Give a project of the recent list a new title where it stands: its place, its date and its
 * cover are kept. A project not in the list is left out of it.
 */
export async function retitleRecentProject(projectDir: string, title: string): Promise<void> {
  const dir = await userDataDir();
  const file = join(dir, FILE_NAME);
  await serialize(`recent:${file}`, async () => {
    const list = await readList(file);
    const entry = list.find((r) => resolve(r.dir) === resolve(projectDir));
    if (entry === undefined || entry.title === title) return;
    const updated = list.map((r) => (r === entry ? { ...r, title } : r));
    await writeFileAtomic(file, JSON.stringify(updated, null, 2) + '\n');
  });
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
