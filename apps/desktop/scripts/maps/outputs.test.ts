import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapIndex, MapSubjectEntry } from './build-geodata.ts';
import {
  BASE_BUDGET_BYTES,
  BUNDLED_PACKS_BUDGET_BYTES,
  budgetWarnings,
  dirBytes,
  indexFile,
  listedFiles,
  mapDirs,
  measureSizes,
  pruneUnlisted,
  readIndexFile,
  rebuildPacks,
  rebuildSubjects,
  subjectsToKeep,
  type MapDirs,
} from './outputs.ts';
import type { SubjectDef } from './subjects.ts';

let root: string;
let dirs: MapDirs;
beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {}); // the failures are on purpose
  root = await mkdtemp(join(tmpdir(), 'outputs-'));
  dirs = mapDirs(join(root, 'maps'), join(root, 'out'));
  for (const dir of [dirs.subjects, dirs.packs, dirs.places, dirs.outPacks]) {
    await mkdir(dir, { recursive: true });
  }
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const def = (id: string): SubjectDef => ({
  id,
  iso: id.split('-')[0] ?? id,
  kind: 'country',
  country: id,
  skipNeighbours: [],
});
const entry = (
  id: string,
  json: string,
  pack: MapSubjectEntry['pack'] = null,
): MapSubjectEntry => ({
  id,
  iso: id,
  name: id,
  kind: 'country',
  bbox: [0, 0, 1, 1],
  keywords: [id],
  file: `subjects/${id}.topo.json`,
  sha256: sha(json),
  regions: [{ id: `${id}-1`, name: 'r', bbox: [0, 0, 1, 1] }],
  landSource: 'region',
  pack,
});
const packEntry = (id: string, json: string, bundled: boolean): MapSubjectEntry['pack'] => ({
  file: `packs/${id}.topo.json`,
  sha256: sha(json),
  bytes: json.length,
  bundled,
  mode: 'finest',
});
const write = (path: string, text: string): Promise<void> => writeFile(path, text);
const names = (dir: string): Promise<string[]> => readdir(dir).then((n) => n.sort());
const snapshot = async (): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const dir of [dirs.maps, dirs.subjects, dirs.packs, dirs.outPacks, dirs.places]) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isFile())
        out[join(dir, entry.name)] = await readFile(join(dir, entry.name), 'utf8');
    }
  }
  return out;
};

/** A committed state: A and B with a pack each (A bundled), and a stray file in each directory. */
async function seed(): Promise<MapIndex> {
  const index: MapIndex = {
    overture: 'old',
    built: '2026-01-01',
    subjects: [
      entry('A', 'old A', packEntry('A', 'old pack A', true)),
      entry('B', 'old B', packEntry('B', 'old pack B', false)),
    ],
  };
  await write(indexFile(dirs), `${JSON.stringify(index)}\n`);
  await write(join(dirs.subjects, 'A.topo.json'), 'old A');
  await write(join(dirs.subjects, 'B.topo.json'), 'old B');
  await write(join(dirs.subjects, 'GONE.topo.json'), 'subject of an older run');
  await write(join(dirs.packs, 'A.topo.json'), 'old pack A');
  await write(join(dirs.packs, 'GONE.topo.json'), 'pack of an older run');
  await write(join(dirs.outPacks, 'B.topo.json'), 'old pack B');
  await write(join(dirs.outPacks, 'GONE.topo.json'), 'release pack of an older run');
  return index;
}

describe('listedFiles and pruneUnlisted', () => {
  it('lists the subject files and the packs, bundled or not, by directory', () => {
    const index: MapIndex = {
      overture: 'x',
      built: 'd',
      subjects: [
        entry('A', 'a', packEntry('A', 'p', true)),
        entry('B', 'b', packEntry('B', 'p', false)),
        entry('C', 'c'),
      ],
    };
    const listed = listedFiles(index);
    expect([...listed.subjects].sort()).toEqual(['A.topo.json', 'B.topo.json', 'C.topo.json']);
    expect([...listed.packs]).toEqual(['A.topo.json']);
    expect([...listed.outPacks]).toEqual(['B.topo.json']);
  });

  it('removes the files that are not listed, leaves the rest, and tolerates a missing dir', async () => {
    await write(join(dirs.subjects, 'keep.json'), '1');
    await write(join(dirs.subjects, 'drop.json'), '2');
    await write(join(dirs.subjects, 'drop.json.tmp'), '3');
    expect(await pruneUnlisted(dirs.subjects, new Set(['keep.json']))).toEqual([
      'drop.json',
      'drop.json.tmp',
    ]);
    expect(await names(dirs.subjects)).toEqual(['keep.json']);
    expect(await pruneUnlisted(join(root, 'absent'), new Set())).toEqual([]);
  });
});

describe('readIndexFile', () => {
  it('is undefined for a missing index (a first run), and reads a good one', async () => {
    expect(await readIndexFile(dirs)).toBeUndefined();
    const index = await seed();
    expect(await readIndexFile(dirs)).toEqual(index);
  });

  it('throws on an index that is unreadable or not JSON, so that nothing is pruned', async () => {
    await write(indexFile(dirs), '{"overture": "old", "subjects": [');
    await expect(readIndexFile(dirs)).rejects.toThrow(/index\.json is not valid JSON/);
    await rm(indexFile(dirs));
    await mkdir(indexFile(dirs)); // a directory: EISDIR, not ENOENT
    await expect(readIndexFile(dirs)).rejects.toThrow(/cannot read .*index\.json/);
  });
});

describe('readIndexFile shape', () => {
  it.each([
    ['an empty object', '{}'],
    ['an array', '[]'],
    ['null', 'null'],
    ['a list that is not one', '{"overture":"x","subjects":{}}'],
    ['no release', '{"subjects":[]}'],
  ])(
    'rejects %s, which would make a partial run prune every other subject',
    async (_name, body) => {
      await write(indexFile(dirs), body);
      await expect(readIndexFile(dirs)).rejects.toThrow(
        /has no `overture` release and `subjects` list/,
      );
    },
  );

  it('accepts an index with no subjects yet', async () => {
    await write(indexFile(dirs), '{"overture":"x","built":"d","subjects":[]}');
    expect((await readIndexFile(dirs))?.subjects).toEqual([]);
  });
});

describe('subjectsToKeep', () => {
  const previous: MapIndex = {
    overture: 'r1',
    built: 'd',
    subjects: [entry('A', 'a'), entry('B', 'b')],
  };

  it('does not read the index for a full run, so a corrupt one cannot block the rebuild', async () => {
    const read = vi.fn().mockRejectedValue(new Error('index.json is not valid JSON'));
    expect(await subjectsToKeep(undefined, 'r1', read)).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps the entries of a partial run from the same release, and fails on an unreadable index', async () => {
    expect(await subjectsToKeep(['A'], 'r1', async () => previous)).toEqual(previous.subjects);
    expect(await subjectsToKeep(['A'], 'r2', async () => previous)).toEqual([]);
    expect(await subjectsToKeep(['A'], 'r1', async () => undefined)).toEqual([]);
    await expect(
      subjectsToKeep(['A'], 'r1', () => Promise.reject(new Error('not valid JSON'))),
    ).rejects.toThrow('not valid JSON');
  });
});

describe('rebuildSubjects (boundaries)', () => {
  const build =
    (failing: string[] = []) =>
    async (d: SubjectDef) => {
      if (failing.includes(d.id)) throw new Error(`no geometry for ${d.id}`);
      const json = `new ${d.id}`;
      return { entry: entry(d.id, json), json };
    };

  it('touches nothing when a subject fails, and lists every failure', async () => {
    await seed();
    const before = await snapshot();
    await expect(
      rebuildSubjects({
        defs: [def('A'), def('X'), def('Y')],
        build: build(['X', 'Y']),
        kept: [],
        dirs,
        release: 'new',
        date: '2026-02-02',
      }),
    ).rejects.toThrow(/2 subject\(s\) failed, nothing was written[\s\S]*X: no geometry[\s\S]*Y: /);
    expect(await snapshot()).toEqual(before);
    expect(await names(dirs.maps)).not.toContain('.staging');
    await expect(readdir(dirs.staging)).rejects.toThrow(); // the scratch dir is gone too
  });

  it('does not wipe anything before the build: the old files are there until the swap', async () => {
    await seed();
    let seen: Record<string, string> = {};
    await rebuildSubjects({
      defs: [def('A'), def('C')],
      build: async (d) => {
        if (d.id === 'C') seen = await snapshot(); // mid-run, A is built, C is being built
        return build()(d);
      },
      kept: [],
      dirs,
      release: 'new',
      date: '2026-02-02',
    });
    expect(seen[join(dirs.subjects, 'A.topo.json')]).toBe('old A');
    expect(seen[join(dirs.subjects, 'B.topo.json')]).toBe('old B');
    expect(JSON.parse(seen[indexFile(dirs)] ?? '{}').overture).toBe('old');
  });

  it('swaps in the new files, then removes every subject and pack the index does not list', async () => {
    await seed();
    const { index, removed } = await rebuildSubjects({
      defs: [def('A'), def('C')],
      build: build(),
      kept: [], // a new Overture release: B is not carried over
      dirs,
      release: 'new',
      date: '2026-02-02',
    });
    expect(index.subjects.map((s) => s.id)).toEqual(['A', 'C']);
    expect([...removed].sort()).toEqual([
      'out/packs/B.topo.json',
      'out/packs/GONE.topo.json',
      'packs/A.topo.json', // the old pack of a rebuilt subject: the one prune removes it
      'packs/GONE.topo.json',
      'subjects/B.topo.json',
      'subjects/GONE.topo.json',
    ]);
    expect(await names(dirs.subjects)).toEqual(['A.topo.json', 'C.topo.json']);
    expect(await readFile(join(dirs.subjects, 'A.topo.json'), 'utf8')).toBe('new A');
    // B and GONE left no pack behind, and A's old pack went with its old regions
    expect(await names(dirs.packs)).toEqual([]);
    expect(await names(dirs.outPacks)).toEqual([]);
    const written = JSON.parse(await readFile(indexFile(dirs), 'utf8')) as MapIndex;
    expect(written.overture).toBe('new');
    for (const s of written.subjects) {
      expect(sha(await readFile(join(dirs.maps, s.file), 'utf8')), s.id).toBe(s.sha256);
    }
  });

  it('keeps the other subjects of a partial run, with their packs', async () => {
    const old = await seed();
    const { index } = await rebuildSubjects({
      defs: [def('A')],
      build: build(),
      kept: old.subjects,
      dirs,
      release: 'old',
      date: '2026-02-02',
    });
    expect(index.subjects.map((s) => s.id)).toEqual(['A', 'B']);
    expect(index.subjects[0]?.pack).toBeNull(); // rebuilt: its pack went
    expect(index.subjects[1]?.pack?.bundled).toBe(false);
    expect(await names(dirs.packs)).toEqual([]);
    expect(await names(dirs.outPacks)).toEqual(['B.topo.json']); // GONE is not listed
    expect(await names(dirs.subjects)).toEqual(['A.topo.json', 'B.topo.json']);
  });
});

describe('rebuildPacks (packs)', () => {
  const make =
    (failing: string[] = []) =>
    async (d: SubjectDef) => {
      if (failing.includes(d.id)) throw new Error('regions differ');
      return { json: `new pack ${d.id}`, mode: 'per-region' as const, note: '' };
    };

  it('does not wipe the packs upfront: a failing pack leaves the old files and a consistent index', async () => {
    const index = await seed();
    const result = await rebuildPacks({
      index,
      defs: [def('A'), def('B')],
      make: make(['B']),
      bundled: ['A'],
      dirs,
    });
    expect(result.failures).toEqual(['B: regions differ']);
    // A was replaced, and the index says so; B is as it was
    expect(await readFile(join(dirs.packs, 'A.topo.json'), 'utf8')).toBe('new pack A');
    expect(await readFile(join(dirs.outPacks, 'B.topo.json'), 'utf8')).toBe('old pack B');
    const written = JSON.parse(await readFile(indexFile(dirs), 'utf8')) as MapIndex;
    expect(written.subjects[0]?.pack?.sha256).toBe(sha('new pack A'));
    expect(written.subjects[0]?.pack?.mode).toBe('per-region');
    expect(written.subjects[1]?.pack?.sha256).toBe(sha('old pack B'));
    // and the leftovers that no index lists are gone, after the build
    expect(await names(dirs.packs)).toEqual(['A.topo.json']);
    expect(await names(dirs.outPacks)).toEqual(['B.topo.json']);
  });

  it('keeps the pack file and entry of a subject a partial run does not touch', async () => {
    const index = await seed();
    const result = await rebuildPacks({
      index,
      defs: [def('A')], // only A
      make: make(),
      bundled: ['A'],
      dirs,
    });
    expect(result.failures).toEqual([]);
    expect([...result.removed].sort()).toEqual([
      'out/packs/GONE.topo.json',
      'packs/GONE.topo.json',
      'subjects/GONE.topo.json',
    ]);
    expect(await readFile(join(dirs.packs, 'A.topo.json'), 'utf8')).toBe('new pack A');
    expect(await readFile(join(dirs.outPacks, 'B.topo.json'), 'utf8')).toBe('old pack B');
    const written = JSON.parse(await readFile(indexFile(dirs), 'utf8')) as MapIndex;
    expect(written.subjects[1]?.pack).toEqual(packEntry('B', 'old pack B', false));
  });

  it('moves a pack to the other directory when it is bundled or not bundled any more', async () => {
    const index = await seed();
    await rebuildPacks({
      index,
      defs: [def('A'), def('B')],
      make: make(),
      bundled: ['B'], // the reverse of the seed
      dirs,
    });
    expect(await names(dirs.packs)).toEqual(['B.topo.json']);
    expect(await names(dirs.outPacks)).toEqual(['A.topo.json']);
    expect(index.subjects.map((s) => s.pack?.bundled)).toEqual([false, true]);
  });

  it('removes the pack of a subject without regions, and refuses one that is not in the index', async () => {
    const index = await seed();
    const [a] = index.subjects;
    if (a) a.regions = [];
    await rebuildPacks({ index, defs: [def('A')], make: make(), bundled: ['A'], dirs });
    expect(a?.pack).toBeNull();
    expect(await names(dirs.packs)).toEqual([]);
    await expect(
      rebuildPacks({ index, defs: [def('Z')], make: make(), bundled: [], dirs }),
    ).rejects.toThrow('Z is not in index.json');
  });
});

describe('the size report', () => {
  it('sums the base (subjects, places, index) apart from the bundled and the release packs', async () => {
    await write(join(dirs.subjects, 'A.topo.json'), 'x'.repeat(100));
    await write(join(dirs.places, 'A.json'), 'x'.repeat(10));
    await write(indexFile(dirs), 'x'.repeat(1));
    await write(join(dirs.packs, 'A.topo.json'), 'x'.repeat(1000));
    await write(join(dirs.outPacks, 'B.topo.json'), 'x'.repeat(5000));
    expect(await measureSizes(dirs)).toEqual({ base: 111, bundledPacks: 1000, outPacks: 5000 });
    expect(await dirBytes(join(root, 'absent'))).toBe(0);
  });

  it('warns above 25 MB, base and bundled packs each, and says which one is over', () => {
    const fits = {
      base: BASE_BUDGET_BYTES,
      bundledPacks: BUNDLED_PACKS_BUDGET_BYTES,
      outPacks: 9e9,
    };
    expect(budgetWarnings(fits)).toEqual([]);
    expect(budgetWarnings({ ...fits, base: BASE_BUDGET_BYTES + 1 })).toEqual([
      expect.stringMatching(/base files are .* over the 25\.00 MB budget/),
    ]);
    const both = budgetWarnings({ ...fits, base: 3e7, bundledPacks: 3e7 });
    expect(both).toHaveLength(2);
    expect(both[1]).toMatch(/bundled packs/);
  });
});
