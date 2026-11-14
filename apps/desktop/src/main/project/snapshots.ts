import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { migrate, pageCount, type Book } from '@travelbook/core';
import type { SnapshotInfo } from '../../shared/api';
import { serialize, writeFileAtomic } from './atomic-write';

export type { SnapshotInfo };

/** Auto snapshots older than the newest 50 are pruned; manual ones are never pruned. */
export const AUTO_SNAPSHOTS_KEPT = 50;

const HISTORY_DIR = 'history';
const ID_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-(auto|manual)$/;

interface SnapshotEntry {
  id: string;
  at: string;
  label: SnapshotInfo['label'];
}

/** `2026-03-04T10:20:30.456Z` becomes `2026-03-04T10-20-30-456Z`: safe on every file system. */
function safeTimestamp(at: Date): string {
  return at.toISOString().replace(/[:.]/g, '-');
}

function parseId(id: string): SnapshotEntry | null {
  const m = ID_PATTERN.exec(id);
  if (!m) return null;
  const [, date, hh, mm, ss, ms, label] = m;
  return { id, at: `${date}T${hh}:${mm}:${ss}.${ms}Z`, label: label as SnapshotInfo['label'] };
}

function snapshotPath(dir: string, id: string): string {
  return join(dir, HISTORY_DIR, `${id}.json`);
}

/** Snapshot files named like ours, newest first. Reads names only. */
async function readEntries(dir: string): Promise<SnapshotEntry[]> {
  let names: string[];
  try {
    names = await readdir(join(dir, HISTORY_DIR));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return names
    .filter((n) => n.endsWith('.json'))
    .map((n) => parseId(n.slice(0, -'.json'.length)))
    .filter((e): e is SnapshotEntry => e !== null)
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/**
 * Copy the book into `history/`. The timestamp moves forward until the file name is free;
 * calls for the same project are serialised so two of them cannot pick the same name.
 */
export function writeSnapshot(
  dir: string,
  book: Book,
  label: SnapshotInfo['label'],
): Promise<SnapshotInfo> {
  return serialize(`snapshot:${dir}`, async () => {
    await mkdir(join(dir, HISTORY_DIR), { recursive: true });
    let time = Date.now();
    let id = `${safeTimestamp(new Date(time))}-${label}`;
    while (await exists(snapshotPath(dir, id))) {
      time += 1;
      id = `${safeTimestamp(new Date(time))}-${label}`;
    }
    await writeFileAtomic(snapshotPath(dir, id), JSON.stringify(book, null, 2) + '\n');
    return { id, at: new Date(time).toISOString(), label, pages: pageCount(book) };
  });
}

/** Snapshots of a project, most recent first. Unreadable or invalid files are skipped. */
export async function listSnapshots(dir: string): Promise<SnapshotInfo[]> {
  const infos = await Promise.all(
    (await readEntries(dir)).map(async (entry): Promise<SnapshotInfo | null> => {
      try {
        const book = migrate(JSON.parse(await readFile(snapshotPath(dir, entry.id), 'utf8')));
        return { ...entry, pages: pageCount(book) };
      } catch {
        return null;
      }
    }),
  );
  return infos.filter((i): i is SnapshotInfo => i !== null);
}

export async function readSnapshot(dir: string, id: string): Promise<Book> {
  // `id` can come from the renderer: only ever build a path from a well-formed one.
  if (parseId(id) === null) throw new Error(`Invalid snapshot id: ${JSON.stringify(id)}`);
  return migrate(JSON.parse(await readFile(snapshotPath(dir, id), 'utf8')));
}

/** Keep every manual snapshot and the newest `AUTO_SNAPSHOTS_KEPT` auto ones. */
export async function pruneSnapshots(dir: string): Promise<void> {
  const stale = (await readEntries(dir))
    .filter((e) => e.label === 'auto')
    .slice(AUTO_SNAPSHOTS_KEPT);
  await Promise.all(stale.map((e) => rm(snapshotPath(dir, e.id), { force: true })));
}
