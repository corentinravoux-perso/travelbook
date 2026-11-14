import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUserDataDir } from '../user-data';
import { addRecentProject, recentProjects } from './recent';

let userData: string;

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'tb-recent-'));
  setUserDataDir(userData);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-06T07:08:09.000Z'));
});

afterEach(async () => {
  vi.useRealTimers();
  setUserDataDir(null);
  await rm(userData, { recursive: true, force: true });
});

describe('recentProjects', () => {
  it('is empty before anything was added', async () => {
    expect(await recentProjects()).toEqual([]);
  });

  it('lists the most recent project first with an ISO openedAt', async () => {
    await addRecentProject({ dir: '/p/a.travelbook', title: 'A' });
    vi.setSystemTime(new Date('2026-05-06T08:00:00.000Z'));
    await addRecentProject({ dir: '/p/b.travelbook', title: 'B' });
    expect(await recentProjects()).toEqual([
      { dir: '/p/b.travelbook', title: 'B', openedAt: '2026-05-06T08:00:00.000Z' },
      { dir: '/p/a.travelbook', title: 'A', openedAt: '2026-05-06T07:08:09.000Z' },
    ]);
  });

  it('de-duplicates by dir: re-adding moves it to the front with the new title', async () => {
    await addRecentProject({ dir: '/p/a.travelbook', title: 'A' });
    await addRecentProject({ dir: '/p/b.travelbook', title: 'B' });
    vi.setSystemTime(new Date('2026-05-06T09:00:00.000Z'));
    await addRecentProject({ dir: '/p/a.travelbook', title: 'A renamed' });
    const list = await recentProjects();
    expect(list.map((r) => r.dir)).toEqual(['/p/a.travelbook', '/p/b.travelbook']);
    expect(list[0]).toMatchObject({ title: 'A renamed', openedAt: '2026-05-06T09:00:00.000Z' });
  });

  it('keeps at most 20 entries, dropping the oldest', async () => {
    for (let i = 0; i < 25; i++) {
      await addRecentProject({ dir: `/p/${i}.travelbook`, title: `P${i}` });
    }
    const list = await recentProjects();
    expect(list).toHaveLength(20);
    expect(list[0]?.dir).toBe('/p/24.travelbook');
    expect(list[19]?.dir).toBe('/p/5.travelbook');
  });

  it('keeps the cover thumbnail across a re-open that does not supply one', async () => {
    await addRecentProject({ dir: '/p/a.travelbook', title: 'A', coverThumb: 'tb://thumb/a' });
    await addRecentProject({ dir: '/p/a.travelbook', title: 'A' });
    expect((await recentProjects())[0]?.coverThumb).toBe('tb://thumb/a');
    await addRecentProject({ dir: '/p/a.travelbook', title: 'A', coverThumb: 'tb://thumb/new' });
    expect((await recentProjects())[0]?.coverThumb).toBe('tb://thumb/new');
  });

  it('stores the list as JSON in the injected directory', async () => {
    await addRecentProject({ dir: '/p/a.travelbook', title: 'A' });
    const raw = JSON.parse(await readFile(join(userData, 'recent-projects.json'), 'utf8'));
    expect(raw).toEqual([
      { dir: '/p/a.travelbook', title: 'A', openedAt: '2026-05-06T07:08:09.000Z' },
    ]);
  });

  it('creates the directory when it does not exist yet', async () => {
    const nested = join(userData, 'not', 'yet');
    setUserDataDir(nested);
    await addRecentProject({ dir: '/p/a.travelbook', title: 'A' });
    expect(await recentProjects()).toHaveLength(1);
  });

  it('treats a corrupt or malformed file as an empty list', async () => {
    const file = join(userData, 'recent-projects.json');
    await writeFile(file, '{"not": "an array"');
    expect(await recentProjects()).toEqual([]);
    await writeFile(file, JSON.stringify({ nope: true }));
    expect(await recentProjects()).toEqual([]);
    await writeFile(
      file,
      JSON.stringify([
        { dir: '/p/ok.travelbook', title: 'OK', openedAt: '2026-01-01T00:00:00.000Z' },
        { dir: 42 },
        'junk',
      ]),
    );
    expect((await recentProjects()).map((r) => r.dir)).toEqual(['/p/ok.travelbook']);
    // A write after corruption starts a clean list.
    await addRecentProject({ dir: '/p/new.travelbook', title: 'N' });
    expect((await recentProjects()).map((r) => r.dir)).toEqual([
      '/p/new.travelbook',
      '/p/ok.travelbook',
    ]);
  });

  it('does not lose entries when adds run concurrently', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        addRecentProject({ dir: `/p/${i}.travelbook`, title: `P${i}` }),
      ),
    );
    expect(await recentProjects()).toHaveLength(10);
  });
});
