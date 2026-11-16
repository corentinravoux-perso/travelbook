/**
 * How the build scripts put their results on disk without ever leaving the committed outputs half
 * replaced: nothing in `resources/maps/` is touched until a whole step has succeeded, every file
 * is written then renamed into place, and what the final `index.json` does not list is removed
 * afterwards, never upfront. No network and no heavy import here, so the tests use temporary
 * directories.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { MapIndex, MapSubjectEntry } from './build-geodata.ts';
import type { PackMode } from './simplify.ts';
import type { SubjectDef } from './subjects.ts';

export interface MapDirs {
  /** `resources/maps/`, which holds `index.json`. */
  maps: string;
  subjects: string;
  /** Bundled packs. */
  packs: string;
  places: string;
  /** Packs that are not bundled (git-ignored). */
  outPacks: string;
  /** Where `boundaries` builds every subject before it swaps them in. */
  staging: string;
}

export const mapDirs = (maps: string, out: string): MapDirs => ({
  maps,
  subjects: join(maps, 'subjects'),
  packs: join(maps, 'packs'),
  places: join(maps, 'places'),
  outPacks: join(out, 'packs'),
  staging: join(out, 'staging'),
});

export const indexFile = (dirs: MapDirs): string => join(dirs.maps, 'index.json');

/** Write to `<path>.tmp`, then rename: a reader (or a crash) sees the old file or the new one. */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

export const writeIndexFile = (dirs: MapDirs, index: MapIndex): Promise<void> =>
  writeFileAtomic(indexFile(dirs), `${JSON.stringify(index, null, 1)}\n`);

/**
 * The committed `index.json`. `undefined` only when the file does not exist (a first run); a file
 * that cannot be read or parsed throws, because a run that took it for "no index" would treat
 * every other subject as unknown and prune their files.
 */
export async function readIndexFile(dirs: MapDirs): Promise<MapIndex | undefined> {
  let text: string;
  try {
    text = await readFile(indexFile(dirs), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(`cannot read ${indexFile(dirs)}: ${messageOf(error)}`, { cause: error });
  }
  try {
    return JSON.parse(text) as MapIndex;
  } catch (error) {
    throw new Error(`${indexFile(dirs)} is not valid JSON: ${messageOf(error)}`, { cause: error });
  }
}

/** File names (not paths) of every directory that the index lists. */
export function listedFiles(index: MapIndex): {
  subjects: Set<string>;
  packs: Set<string>;
  outPacks: Set<string>;
} {
  const listed = {
    subjects: new Set<string>(),
    packs: new Set<string>(),
    outPacks: new Set<string>(),
  };
  for (const subject of index.subjects) {
    listed.subjects.add(basename(subject.file));
    if (subject.pack)
      (subject.pack.bundled ? listed.packs : listed.outPacks).add(basename(subject.pack.file));
  }
  return listed;
}

/** Delete the regular files of `dir` whose name is not in `keep`; returns the names removed. */
export async function pruneUnlisted(dir: string, keep: Set<string>): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || keep.has(entry.name)) continue;
    await rm(join(dir, entry.name));
    removed.push(entry.name);
  }
  return removed.sort();
}

/** Remove every subject and pack file that the index does not list. */
export async function pruneOutputs(index: MapIndex, dirs: MapDirs): Promise<string[]> {
  const listed = listedFiles(index);
  const removed = [
    ...(await pruneUnlisted(dirs.subjects, listed.subjects)).map((f) => `subjects/${f}`),
    ...(await pruneUnlisted(dirs.packs, listed.packs)).map((f) => `packs/${f}`),
    ...(await pruneUnlisted(dirs.outPacks, listed.outPacks)).map((f) => `out/packs/${f}`),
  ];
  return removed;
}

/** Remove the pack files of a subject, wherever they were written. */
export async function removePacks(dirs: MapDirs, id: string): Promise<void> {
  const name = `${id}.topo.json`;
  await rm(join(dirs.packs, name), { force: true });
  await rm(join(dirs.outPacks, name), { force: true });
}

// --- boundaries: build everything, then swap -------------------------------------------------

export interface BuiltSubject {
  entry: MapSubjectEntry;
  json: string;
}

/** Message of a thrown value. */
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Build every subject into `dirs.staging`, then, only when all of them succeeded, move the files
 * into `subjects/`, drop the packs of the rebuilt subjects (their regions may differ), write the
 * index and remove what it does not list. A subject that fails does not stop the others (so one
 * run reports every failure), but nothing is committed: a crash or a failure leaves the previous
 * outputs and index exactly as they were.
 */
export async function rebuildSubjects(opts: {
  defs: SubjectDef[];
  build: (def: SubjectDef) => Promise<BuiltSubject>;
  /** Entries of the previous index that stay (the other subjects of a partial run). */
  kept: MapSubjectEntry[];
  dirs: MapDirs;
  release: string;
  /** `YYYY-MM-DD`. */
  date: string;
  log?: (info: { done: number; total: number; subject: BuiltSubject; seconds: number }) => void;
}): Promise<{ index: MapIndex; removed: string[] }> {
  const { dirs } = opts;
  await rm(dirs.staging, { recursive: true, force: true });
  await mkdir(dirs.staging, { recursive: true });
  const built = new Map(opts.kept.map((s) => [s.id, s]));
  const rebuilt: MapSubjectEntry[] = [];
  const failures: string[] = [];
  for (const def of opts.defs) {
    const started = Date.now();
    try {
      const subject = await opts.build(def);
      await writeFile(join(dirs.staging, basename(subject.entry.file)), subject.json);
      rebuilt.push(subject.entry);
      opts.log?.({
        done: rebuilt.length + failures.length,
        total: opts.defs.length,
        subject,
        seconds: (Date.now() - started) / 1000,
      });
    } catch (error) {
      failures.push(`${def.id}: ${messageOf(error)}`);
      console.error(`${def.id}: FAILED, ${messageOf(error)}`);
    }
  }
  if (failures.length > 0) {
    await rm(dirs.staging, { recursive: true, force: true });
    throw new Error(
      `${failures.length} subject(s) failed, nothing was written:\n  ${failures.join('\n  ')}`,
    );
  }
  await mkdir(dirs.subjects, { recursive: true });
  for (const entry of rebuilt) {
    await rename(join(dirs.staging, basename(entry.file)), join(dirs.maps, entry.file));
    built.set(entry.id, entry); // restarts without a pack: the prune below removes its old file
  }
  const index: MapIndex = {
    overture: opts.release,
    built: opts.date,
    subjects: [...built.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
  await writeIndexFile(dirs, index);
  const removed = await pruneOutputs(index, dirs);
  await rm(dirs.staging, { recursive: true, force: true });
  return { index, removed };
}

// --- packs: one file and one index write at a time --------------------------------------------

export interface PackBuild {
  json: string;
  mode: PackMode;
  /** One line for the log. */
  note: string;
}

/**
 * Write the pack of a subject, atomically, into the bundled or the release directory and remove a
 * copy left in the other one (a pack that was bundled and no longer is, or the reverse).
 */
export async function storePack(
  dirs: MapDirs,
  id: string,
  bundled: boolean,
  json: string,
): Promise<void> {
  const name = `${id}.topo.json`;
  await mkdir(bundled ? dirs.packs : dirs.outPacks, { recursive: true });
  await writeFileAtomic(join(bundled ? dirs.packs : dirs.outPacks, name), json);
  await rm(join(bundled ? dirs.outPacks : dirs.packs, name), { force: true });
}

/**
 * Build and store the pack of every subject of `defs` that has regions. The index is rewritten
 * after each pack, so an interrupted run keeps what it has built, consistently. A subject whose
 * pack fails is reported, never skipped silently; the others go on. The packs that the final
 * index does not list are removed at the end, never before.
 */
export async function rebuildPacks(opts: {
  index: MapIndex;
  defs: SubjectDef[];
  make: (def: SubjectDef, entry: MapSubjectEntry) => Promise<PackBuild>;
  bundled: string[];
  dirs: MapDirs;
  log?: (info: {
    done: number;
    total: number;
    def: SubjectDef;
    build: PackBuild;
    entry: MapSubjectEntry;
    seconds: number;
  }) => void;
}): Promise<{ failures: string[]; removed: string[] }> {
  const { index, dirs } = opts;
  const failures: string[] = [];
  for (const [n, def] of opts.defs.entries()) {
    const started = Date.now();
    const entry = index.subjects.find((s) => s.id === def.id);
    if (!entry) throw new Error(`${def.id} is not in index.json: run \`boundaries\` first`);
    if (entry.regions.length === 0) {
      await removePacks(dirs, def.id);
      entry.pack = null;
      continue;
    }
    try {
      const build = await opts.make(def, entry);
      const bundled = opts.bundled.includes(def.id);
      await storePack(dirs, def.id, bundled, build.json);
      entry.pack = {
        file: `packs/${def.id}.topo.json`,
        sha256: createHash('sha256').update(build.json).digest('hex'),
        bytes: Buffer.byteLength(build.json),
        bundled,
        mode: build.mode,
      };
      await writeIndexFile(dirs, index);
      opts.log?.({
        done: n + 1,
        total: opts.defs.length,
        def,
        build,
        entry,
        seconds: (Date.now() - started) / 1000,
      });
    } catch (error) {
      failures.push(`${def.id}: ${messageOf(error)}`);
      console.error(`${def.id}: FAILED, ${messageOf(error)}`);
    }
  }
  await writeIndexFile(dirs, index);
  return { failures, removed: await pruneOutputs(index, dirs) };
}

// --- sizes -----------------------------------------------------------------------------------

/**
 * The size budget of design section 7.4. The owner lifted the limit (2026-11-16): going over it
 * only prints a warning, it never fails a run and triggers no fallback.
 */
export const BASE_BUDGET_BYTES = 25_000_000;
export const BUNDLED_PACKS_BUDGET_BYTES = 25_000_000;

/** Total size of the regular files directly inside `dir` (0 when it does not exist). */
export async function dirBytes(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    if (entry.isFile()) total += (await stat(join(dir, entry.name))).size;
  }
  return total;
}

export interface Sizes {
  /** `subjects/` + `places/` + `index.json`. */
  base: number;
  /** The four bundled packs. */
  bundledPacks: number;
  /** `out/packs/`: uploaded to the release by hand. */
  outPacks: number;
}

export async function measureSizes(dirs: MapDirs): Promise<Sizes> {
  const index = await stat(indexFile(dirs)).catch(() => ({ size: 0 }));
  return {
    base: (await dirBytes(dirs.subjects)) + (await dirBytes(dirs.places)) + index.size,
    bundledPacks: await dirBytes(dirs.packs),
    outPacks: await dirBytes(dirs.outPacks),
  };
}

const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(2)} MB`;

export function sizeReport(sizes: Sizes): string[] {
  return [
    `base (subjects/ + places/ + index.json): ${mb(sizes.base)} (budget ${mb(BASE_BUDGET_BYTES)})`,
    `bundled packs (packs/): ${mb(sizes.bundledPacks)} (budget ${mb(BUNDLED_PACKS_BUDGET_BYTES)})`,
    `release packs (scripts/maps/out/packs/): ${mb(sizes.outPacks)}`,
  ];
}

/** What is over the budget, one line each (empty when everything fits). Warnings, never errors. */
export function budgetWarnings(sizes: Sizes): string[] {
  const warnings: string[] = [];
  if (sizes.base > BASE_BUDGET_BYTES) {
    warnings.push(`the base files are ${mb(sizes.base)}, over the ${mb(BASE_BUDGET_BYTES)} budget`);
  }
  if (sizes.bundledPacks > BUNDLED_PACKS_BUDGET_BYTES) {
    warnings.push(
      `the bundled packs are ${mb(sizes.bundledPacks)}, over the ${mb(BUNDLED_PACKS_BUDGET_BYTES)} budget`,
    );
  }
  return warnings;
}
