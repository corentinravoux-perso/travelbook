import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { newBook, type AssetRef, type Book, type Template } from '@travelbook/core';
import { fixturePath } from '../../../../tests/fixtures/make-fixtures';
import { CHANNEL, PROGRESS_CHANNEL, type InvokeChannel } from '../shared/channels';
import type {
  ImportReport,
  LibraryItem,
  OpenedProject,
  ProjectInfo,
  RecentProject,
  SnapshotInfo,
} from '../shared/api';
import {
  createHandlers,
  isTrustedPage,
  registerIpc,
  type HandlerContext,
  type Host,
  type IpcHandlers,
} from './ipc';
import { addToLibrary, listLibrary } from './library/userLibrary';
import { recentProjects } from './project/recent';
import { setUserDataDir } from './user-data';
import { resolveTbUrl } from './protocol';
import { closeSession, currentSession, knownAssets, tbRoots } from './session';
import { AUTO_SNAPSHOTS_KEPT } from './project/snapshots';

let root: string;
let albums: string;
let host: { [K in Exclude<keyof Host, 'clipboard'>]: Mock<Host[K]> } & Pick<Host, 'clipboard'>;
let progress: [number, number][];
let ctx: HandlerContext;
let h: IpcHandlers;

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/** Call a handler the way `ipcMain` does: arguments as they arrive from the renderer. */
const call = <T>(channel: InvokeChannel, ...args: unknown[]): Promise<T> =>
  (h[channel] as IpcHandlers[InvokeChannel])(ctx, ...args) as Promise<T>;

const create = (name = 'Mon livre'): Promise<ProjectInfo> =>
  call<ProjectInfo>(CHANNEL.projectCreate, { name, parentDir: albums });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tb-ipc-'));
  // A parent folder with spaces and accents: the e2e and Windows users have them.
  albums = join(root, 'Été 2026');
  setUserDataDir(join(root, 'userdata'));
  host = {
    pickFolder: vi.fn<Host['pickFolder']>(async () => null),
    pickPhotos: vi.fn<Host['pickPhotos']>(async () => []),
    openExternal: vi.fn<Host['openExternal']>(async () => undefined),
    showInFolder: vi.fn<Host['showInFolder']>(),
    version: vi.fn<Host['version']>(() => '1.2.3'),
    clipboard: { write: async () => undefined, read: async () => null },
  };
  progress = [];
  ctx = { progress: (done, total) => progress.push([done, total]) };
  h = createHandlers(host);
});

afterEach(async () => {
  closeSession();
  setUserDataDir(null);
  await rm(root, { recursive: true, force: true });
});

describe('every channel', () => {
  it('has a handler, and only those channels have one', () => {
    expect(Object.keys(h).sort()).toEqual(Object.values(CHANNEL).sort());
  });

  it('rejects arguments of the wrong shape before doing anything', async () => {
    await expect(call(CHANNEL.appVersion, 'surprise')).rejects.toThrow(/app:version/);
    await expect(call(CHANNEL.projectReveal, {})).rejects.toThrow(/project:reveal/);
    await expect(call(CHANNEL.projectRecent, 1)).rejects.toThrow(/project:recent/);
  });
});

describe('project', () => {
  describe('create', () => {
    it('creates the project in the given folder and opens it', async () => {
      const info = await create();
      expect(info.dir).toBe(join(albums, 'mon-livre.travelbook'));
      expect(info.book.title).toBe('Mon livre');
      expect(await exists(join(info.dir, 'book.json'))).toBe(true);
      expect(currentSession()?.dir).toBe(info.dir);
      expect(host.pickFolder).not.toHaveBeenCalled();
      expect((await recentProjects())[0]?.dir).toBe(info.dir);
    });

    it('takes a page format', async () => {
      const info = await call<ProjectInfo>(CHANNEL.projectCreate, {
        name: 'A5',
        parentDir: albums,
        format: { width: 148, height: 210 },
      });
      expect(info.book.format).toEqual({ width: 148, height: 210 });
    });

    it('asks for a folder when none is given', async () => {
      host.pickFolder.mockResolvedValueOnce(albums);
      const info = await call<ProjectInfo>(CHANNEL.projectCreate, { name: 'Islande' });
      expect(host.pickFolder).toHaveBeenCalledTimes(1);
      expect(info.dir).toBe(join(albums, 'islande.travelbook'));
    });

    it('answers null, creates nothing and keeps the open project when the dialog is cancelled', async () => {
      const first = await create('Premier');
      host.pickFolder.mockResolvedValueOnce(null);
      expect(await call(CHANNEL.projectCreate, { name: 'Second' })).toBeNull();
      expect(currentSession()?.dir).toBe(first.dir);
      expect(await readdir(albums)).toEqual(['premier.travelbook']);
    });

    it.each([
      ['no argument', []],
      ['a string', ['Mon livre']],
      ['no name', [{ parentDir: '/tmp' }]],
      ['an empty name', [{ name: '   ' }]],
      ['a name that is too long', [{ name: 'x'.repeat(201) }]],
      ['a numeric name', [{ name: 42 }]],
      ['a relative parent folder', [{ name: 'A', parentDir: 'albums' }]],
      ['an empty parent folder', [{ name: 'A', parentDir: '' }]],
      ['a parent folder with a NUL', [{ name: 'A', parentDir: '/tmp/a\0b' }]],
      ['an unknown key', [{ name: 'A', parentDir: '/tmp', extra: 1 }]],
      ['a negative width', [{ name: 'A', parentDir: '/tmp', format: { width: -1, height: 10 } }]],
      ['a missing height', [{ name: 'A', parentDir: '/tmp', format: { width: 10 } }]],
      ['an infinite height', [{ name: 'A', format: { width: 10, height: Infinity } }]],
      ['two arguments', [{ name: 'A', parentDir: '/tmp' }, 'x']],
    ])('rejects %s', async (_label, args) => {
      await expect(call(CHANNEL.projectCreate, ...args)).rejects.toThrow(/project:create/);
      expect(host.pickFolder).not.toHaveBeenCalled();
      expect(currentSession()).toBeNull();
    });
  });

  describe('pickFolder', () => {
    it('gives the folder the user picks, or null on cancel', async () => {
      host.pickFolder.mockResolvedValueOnce('/albums');
      expect(await call(CHANNEL.projectPickFolder)).toBe('/albums');
      expect(host.pickFolder).toHaveBeenLastCalledWith('create');
      host.pickFolder.mockResolvedValueOnce(null);
      expect(await call(CHANNEL.projectPickFolder)).toBeNull();
      await expect(call(CHANNEL.projectPickFolder, 'x')).rejects.toThrow(/project:pickFolder/);
    });
  });

  describe('open', () => {
    it('opens a project folder and returns its book and its missing assets', async () => {
      const created = await create();
      closeSession();
      const opened = await call<OpenedProject>(CHANNEL.projectOpen, created.dir);
      expect(opened.dir).toBe(created.dir);
      expect(opened.book).toEqual(created.book);
      expect(opened.missing).toEqual([]);
      expect(currentSession()?.dir).toBe(created.dir);
    });

    it('lists the assets whose original is gone', async () => {
      const created = await create();
      const asset: AssetRef = {
        id: 'gone',
        kind: 'photo',
        file: 'originals/gone.jpg',
        originalName: 'gone.jpg',
        sha256: 'x',
      };
      await call(CHANNEL.projectSave, { ...created.book, assets: { gone: asset } });
      const opened = await call<OpenedProject>(CHANNEL.projectOpen, created.dir);
      expect(opened.missing).toEqual(['gone']);
    });

    it('asks for a folder when none is given', async () => {
      const created = await create();
      closeSession();
      host.pickFolder.mockResolvedValueOnce(created.dir);
      const opened = await call<OpenedProject>(CHANNEL.projectOpen);
      expect(opened.dir).toBe(created.dir);
    });

    it('answers null when the dialog is cancelled', async () => {
      expect(await call(CHANNEL.projectOpen)).toBeNull();
      expect(currentSession()).toBeNull();
    });

    it('treats an explicit undefined (what the preload sends for open()) as no folder', async () => {
      const created = await create();
      closeSession();
      host.pickFolder.mockResolvedValueOnce(created.dir);
      expect((await call<OpenedProject>(CHANNEL.projectOpen, undefined)).dir).toBe(created.dir);
      expect(host.pickFolder).toHaveBeenCalledWith('open');
    });

    it('rejects a folder that is not a project and keeps the open project', async () => {
      const created = await create();
      await expect(call(CHANNEL.projectOpen, albums)).rejects.toThrow(/book\.json/);
      expect(currentSession()?.dir).toBe(created.dir);
    });

    it.each([
      ['a relative path', ['albums/x.travelbook']],
      ['a number', [3]],
      ['two paths', ['/a', '/b']],
    ])('rejects %s', async (_label, args) => {
      await expect(call(CHANNEL.projectOpen, ...args)).rejects.toThrow(/project:open/);
    });
  });

  describe('save', () => {
    it('replaces book.json and remembers the book', async () => {
      const created = await create();
      const next: Book = { ...created.book, title: 'Renommé' };
      await call(CHANNEL.projectSave, next);
      const onDisk = JSON.parse(await readFile(join(created.dir, 'book.json'), 'utf8')) as Book;
      expect(onDisk.title).toBe('Renommé');
      expect(currentSession()?.book.title).toBe('Renommé');
    });

    it('indexes the assets of the saved book', async () => {
      const created = await create();
      const asset: AssetRef = {
        id: 'abc',
        kind: 'photo',
        file: 'originals/abc.jpg',
        originalName: 'a.jpg',
        sha256: 'x',
      };
      await call(CHANNEL.projectSave, { ...created.book, assets: { abc: asset } });
      const session = currentSession();
      expect(session && knownAssets(session)).toEqual({ abc: asset });
    });

    it('rejects when no project is open', async () => {
      await expect(call(CHANNEL.projectSave, newBook({ title: 'x' }))).rejects.toThrow(
        /No project is open/,
      );
    });

    it.each([
      ['null', null],
      ['a string', 'book'],
      ['an object that is not a book', { title: 'x' }],
      ['a wrong schema version', { schemaVersion: 7 }],
    ])('rejects %s and leaves book.json alone', async (_label, value) => {
      const created = await create();
      const before = await readFile(join(created.dir, 'book.json'), 'utf8');
      await expect(call(CHANNEL.projectSave, value)).rejects.toThrow(/project:save/);
      expect(await readFile(join(created.dir, 'book.json'), 'utf8')).toBe(before);
    });

    it('rejects a book with a bad spread structure', async () => {
      const created = await create();
      const broken = { ...created.book, cover: { ...created.book.cover, kind: 'inner' } };
      await expect(call(CHANNEL.projectSave, broken)).rejects.toThrow(/project:save/);
    });
  });

  describe('snapshots', () => {
    it('copies the book as last saved into history/', async () => {
      const created = await create();
      await call(CHANNEL.projectSave, { ...created.book, title: 'Version 2' });
      const info = await call<SnapshotInfo>(CHANNEL.projectSnapshot, 'manual');
      expect(info).toMatchObject({ label: 'manual', pages: expect.any(Number) });
      const listed = await call<SnapshotInfo[]>(CHANNEL.projectListSnapshots);
      expect(listed.map((s) => s.id)).toEqual([info.id]);
      const read = await call<Book>(CHANNEL.projectReadSnapshot, info.id);
      expect(read.title).toBe('Version 2');
    });

    it('prunes automatic snapshots beyond the newest 50 and keeps every manual one', async () => {
      await create();
      await call(CHANNEL.projectSnapshot, 'manual');
      for (let i = 0; i < AUTO_SNAPSHOTS_KEPT + 3; i++) await call(CHANNEL.projectSnapshot, 'auto');
      const listed = await call<SnapshotInfo[]>(CHANNEL.projectListSnapshots);
      expect(listed.filter((s) => s.label === 'auto')).toHaveLength(AUTO_SNAPSHOTS_KEPT);
      expect(listed.filter((s) => s.label === 'manual')).toHaveLength(1);
    });

    it('needs an open project', async () => {
      for (const [channel, args] of [
        [CHANNEL.projectSnapshot, ['auto']],
        [CHANNEL.projectListSnapshots, []],
        [CHANNEL.projectReadSnapshot, ['2026-03-04T10-20-30-456Z-auto']],
        [CHANNEL.projectReveal, []],
      ] as const) {
        await expect(call(channel, ...args)).rejects.toThrow(/No project is open/);
      }
    });

    it.each([
      ['an unknown label', CHANNEL.projectSnapshot, ['weekly']],
      ['a missing label', CHANNEL.projectSnapshot, []],
      ['a path as snapshot id', CHANNEL.projectReadSnapshot, ['../book']],
      ['an encoded path as snapshot id', CHANNEL.projectReadSnapshot, ['..%2Fbook']],
      ['a number as snapshot id', CHANNEL.projectReadSnapshot, [1]],
      ['an over-long snapshot id', CHANNEL.projectReadSnapshot, ['a'.repeat(65)]],
    ] as const)('rejects %s', async (_label, channel, args) => {
      await create();
      await expect(call(channel, ...args)).rejects.toThrow(new RegExp(channel));
    });
  });

  it('lists the recent projects', async () => {
    const a = await create('A');
    const b = await create('B');
    const recent = await call<RecentProject[]>(CHANNEL.projectRecent);
    expect(recent.map((r) => r.dir)).toEqual([b.dir, a.dir]);
  });

  it('reveals book.json in the file manager', async () => {
    const created = await create();
    await call(CHANNEL.projectReveal);
    expect(host.showInFolder).toHaveBeenCalledExactlyOnceWith(join(created.dir, 'book.json'));
  });
});

describe('photos', () => {
  it('returns what the picker returns', async () => {
    host.pickPhotos.mockResolvedValueOnce(['/a/b.jpg']);
    expect(await call(CHANNEL.photosPick)).toEqual(['/a/b.jpg']);
  });

  it('imports photos, reports progress to the caller and indexes the assets', async () => {
    const created = await create();
    const report = await call<ImportReport>(CHANNEL.photosImport, [
      fixturePath('landscape.jpg'),
      fixturePath('pano.jpg'),
    ]);
    expect(report.added.map((a) => a.originalName)).toEqual(['landscape.jpg', 'pano.jpg']);
    expect(progress.at(-1)).toEqual([2, 2]);
    expect(progress).toHaveLength(2);
    const session = currentSession();
    expect(session && Object.keys(knownAssets(session)).sort()).toEqual(
      report.added.map((a) => a.id).sort(),
    );
    for (const asset of report.added) {
      expect(await exists(join(created.dir, asset.file))).toBe(true);
    }
    // The renderer has not saved: the import did not touch the book on disk.
    const onDisk = JSON.parse(await readFile(join(created.dir, 'book.json'), 'utf8')) as Book;
    expect(onDisk.assets).toEqual({});
  });

  it('serves the imported assets through the tb: roots at once', async () => {
    await create();
    const report = await call<ImportReport>(CHANNEL.photosImport, [fixturePath('small.jpg')]);
    const roots = tbRoots(currentSession(), { libraryDir: '/lib', resourcesDir: '/res' });
    const id = report.added[0]?.id ?? '';
    expect(roots.asset(id)).toEqual({ file: `originals/${id}.jpg`, proxies: true });
  });

  it('reports a photo imported earlier as a duplicate, saved or not', async () => {
    await create();
    const first = await call<ImportReport>(CHANNEL.photosImport, [fixturePath('small.jpg')]);
    const again = await call<ImportReport>(CHANNEL.photosImport, [fixturePath('small.jpg')]);
    expect(first.added).toHaveLength(1);
    expect(again.added).toEqual([]);
    expect(again.duplicates).toEqual([
      { path: fixturePath('small.jpg'), assetId: first.added[0]?.id },
    ]);
  });

  it('runs overlapping imports into one project one after the other', async () => {
    await create();
    const src = [fixturePath('landscape.jpg'), fixturePath('small.jpg')];
    const [a, b, c] = await Promise.all([
      call<ImportReport>(CHANNEL.photosImport, src),
      call<ImportReport>(CHANNEL.photosImport, src),
      call<ImportReport>(CHANNEL.photosImport, [fixturePath('landscape.jpg')]),
    ]);
    // The first import owns the files; the later ones see them as duplicates, and the file the
    // first one wrote is still there (an unserialised second import could delete it).
    expect(a.added).toHaveLength(2);
    expect(b.added).toEqual([]);
    expect(b.duplicates).toHaveLength(2);
    expect(c.added).toEqual([]);
    expect(c.duplicates).toHaveLength(1);
    const session = currentSession();
    expect(session && (await readdir(join(session.dir, 'originals'))).sort()).toEqual(
      a.added.map((x) => x.file.replace('originals/', '')).sort(),
    );
  });

  it('does not let a failed import hold up the next one', async () => {
    await create();
    const failing = call<ImportReport>(CHANNEL.photosImport, [fixturePath('truncated.jpg')]);
    const next = call<ImportReport>(CHANNEL.photosImport, [fixturePath('small.jpg')]);
    expect((await failing).failed).toHaveLength(1);
    expect((await next).added).toHaveLength(1);
  });

  it('indexes into the project the import started on, even if another is opened meanwhile', async () => {
    const first = await create('Premier');
    const importing = call<ImportReport>(CHANNEL.photosImport, [fixturePath('landscape.jpg')]);
    const firstSession = currentSession();
    await create('Second');
    const report = await importing;
    expect(report.added).toHaveLength(1);
    expect(firstSession && Object.keys(knownAssets(firstSession))).toEqual([report.added[0]?.id]);
    const second = currentSession();
    expect(second?.dir).not.toBe(first.dir);
    expect(second && knownAssets(second)).toEqual({});
  });

  it('needs an open project', async () => {
    await expect(call(CHANNEL.photosImport, [fixturePath('small.jpg')])).rejects.toThrow(
      /No project is open/,
    );
  });

  it('accepts an empty list and imports nothing', async () => {
    await create();
    expect(await call<ImportReport>(CHANNEL.photosImport, [])).toEqual({
      added: [],
      duplicates: [],
      failed: [],
    });
    expect(progress).toEqual([]);
  });

  it.each([
    ['no argument', []],
    ['a string instead of a list', ['/a/b.jpg']],
    ['a relative path', [['photos/a.jpg']]],
    ['an empty path', [['']]],
    ['a number in the list', [[3]]],
    ['a NUL in a path', [['/a/b\0.jpg']]],
    ['a list that is too long', [Array.from({ length: 10_001 }, (_, i) => `/p/${i}.jpg`)]],
    ['two arguments', [['/a/b.jpg'], true]],
  ])('rejects %s', async (_label, args) => {
    await create();
    await expect(call(CHANNEL.photosImport, ...args)).rejects.toThrow(/photos:import/);
  });
});

describe('assets', () => {
  describe('importFiles', () => {
    it('copies files into assets/, indexes them and returns them', async () => {
      const created = await create();
      const assets = await call<AssetRef[]>(CHANNEL.assetsImportFiles, 'sticker', [
        fixturePath('alpha.png'),
        fixturePath('plain.svg'),
      ]);
      expect(assets.map((a) => [a.kind, a.originalName])).toEqual([
        ['sticker', 'alpha.png'],
        ['sticker', 'plain.svg'],
      ]);
      expect(assets[0]?.pixel).toEqual({ w: 400, h: 300 });
      for (const asset of assets) expect(await exists(join(created.dir, asset.file))).toBe(true);
      const session = currentSession();
      expect(session && Object.keys(knownAssets(session)).sort()).toEqual(
        assets.map((a) => a.id).sort(),
      );
    });

    describe('a photo and an asset with the same bytes', () => {
      const src = (): string => fixturePath('small.jpg');
      const roots = () => tbRoots(currentSession(), { libraryDir: '/lib', resourcesDir: '/res' });

      it('photo first: both stay in the index, the photo keeps its proxies', async () => {
        await create();
        const imported = await call<ImportReport>(CHANNEL.photosImport, [src()]);
        const photo = imported.added[0] as AssetRef;
        const [background] = await call<AssetRef[]>(CHANNEL.assetsImportFiles, 'background', [
          src(),
        ]);
        expect(background?.id).toBe(`background-${photo.id}`);
        const session = currentSession();
        expect(session && Object.keys(knownAssets(session)).sort()).toEqual(
          [photo.id, `background-${photo.id}`].sort(),
        );
        expect(roots().asset(photo.id)).toEqual({ file: photo.file, proxies: true });
        expect(roots().asset(`background-${photo.id}`)).toEqual({
          file: background?.file,
          proxies: false,
        });
        // The photo is still a photo: importing it again is a duplicate of that photo.
        const again = await call<ImportReport>(CHANNEL.photosImport, [src()]);
        expect(again.added).toEqual([]);
        expect(again.duplicates).toEqual([{ path: src(), assetId: photo.id }]);
      });

      it('background first: the photo is still imported, under its own id', async () => {
        const created = await create();
        const [background] = await call<AssetRef[]>(CHANNEL.assetsImportFiles, 'background', [
          src(),
        ]);
        const imported = await call<ImportReport>(CHANNEL.photosImport, [src()]);
        expect(imported.duplicates).toEqual([]);
        expect(imported.failed).toEqual([]);
        expect(imported.added).toHaveLength(1);
        const photo = imported.added[0] as AssetRef;
        expect(photo.kind).toBe('photo');
        expect(photo.id).toMatch(/^[0-9a-f]{16}$/);
        expect(background?.id).toBe(`background-${photo.id}`);
        expect(await exists(join(created.dir, photo.file))).toBe(true);
        expect(roots().asset(photo.id)).toEqual({ file: photo.file, proxies: true });
        expect(roots().asset(`background-${photo.id}`)?.proxies).toBe(false);
      });

      it('both can be saved in one book and reopened', async () => {
        const created = await create();
        const imported = await call<ImportReport>(CHANNEL.photosImport, [src()]);
        const [background] = await call<AssetRef[]>(CHANNEL.assetsImportFiles, 'background', [
          src(),
        ]);
        const photo = imported.added[0] as AssetRef;
        await call(CHANNEL.projectSave, {
          ...created.book,
          assets: { [photo.id]: photo, [(background as AssetRef).id]: background },
        });
        const opened = await call<OpenedProject>(CHANNEL.projectOpen, created.dir);
        expect(Object.keys(opened.book.assets).sort()).toEqual(
          [photo.id, (background as AssetRef).id].sort(),
        );
        expect(opened.missing).toEqual([]);
        expect(roots().asset(photo.id)?.proxies).toBe(true);
      });
    });

    it('needs an open project', async () => {
      await expect(
        call(CHANNEL.assetsImportFiles, 'sticker', [fixturePath('alpha.png')]),
      ).rejects.toThrow(/No project is open/);
    });

    it.each([
      ['the photo kind', ['photo', ['/a/b.png']]],
      ['an unknown kind', ['emoji', ['/a/b.png']]],
      ['no paths', ['sticker']],
      ['a relative path', ['sticker', ['b.png']]],
      ['a string instead of a list', ['sticker', '/a/b.png']],
    ])('rejects %s', async (_label, args) => {
      await create();
      await expect(call(CHANNEL.assetsImportFiles, ...args)).rejects.toThrow(/assets:importFiles/);
    });

    it('passes a refusal on to the renderer and indexes nothing', async () => {
      await create();
      await expect(
        call(CHANNEL.assetsImportFiles, 'sticker', [fixturePath('truncated.jpg')]),
      ).rejects.toThrow(/truncated\.jpg/);
      const session = currentSession();
      expect(session && knownAssets(session)).toEqual({});
    });
  });

  describe('fromLibrary', () => {
    const licence = {
      source: 'Openclipart',
      author: 'Une auteure',
      licence: 'CC0 1.0',
      url: 'https://openclipart.org/detail/1',
      requiresAttribution: false,
    };
    const stickerItem = (title = 'Étoile'): Promise<LibraryItem> =>
      addToLibrary('sticker', { path: fixturePath('alpha.png'), ext: '.png' }, { title, licence });

    it('copies the item into assets/, indexes the asset and serves it through tb://', async () => {
      const created = await create();
      const item = await stickerItem();
      const asset = await call<AssetRef>(CHANNEL.assetsFromLibrary, item.id);
      expect(asset).toMatchObject({
        id: item.id,
        kind: 'sticker',
        originalName: 'Étoile.png',
        pixel: { w: 400, h: 300 },
        licence,
      });
      expect(asset.file).toBe(`assets/${item.id.split('-')[1]}.png`);
      expect(await exists(join(created.dir, asset.file))).toBe(true);
      const session = currentSession();
      expect(session && knownAssets(session)).toEqual({ [asset.id]: asset });
      const resolved = resolveTbUrl(
        `tb://asset/${asset.id}?v=original`,
        tbRoots(session, { libraryDir: '/lib', resourcesDir: '/res' }),
      );
      expect(resolved).toMatchObject({ ok: true, path: join(created.dir, asset.file) });
    });

    it('gives the same asset as importFiles for the same bytes (plus the licence it lacked)', async () => {
      await create();
      const item = await stickerItem();
      const [imported] = await call<AssetRef[]>(CHANNEL.assetsImportFiles, 'sticker', [
        fixturePath('alpha.png'),
      ]);
      const asset = await call<AssetRef>(CHANNEL.assetsFromLibrary, item.id);
      expect(asset).toEqual({ ...imported, licence });
      expect(await readdir(join(currentSession()?.dir ?? '', 'assets'))).toHaveLength(1);
      const session = currentSession();
      expect(session && knownAssets(session)).toEqual({ [asset.id]: asset });
    });

    it('marks the item as used, each time', async () => {
      await create();
      const item = await stickerItem();
      expect(await listLibrary('sticker', { recent: 5 })).toEqual([]);
      await call(CHANNEL.assetsFromLibrary, item.id);
      const [used] = await listLibrary('sticker', { recent: 5 });
      expect(used?.id).toBe(item.id);
      const first = used?.lastUsedAt ?? '';
      await new Promise((resolve) => setTimeout(resolve, 5));
      await call(CHANNEL.assetsFromLibrary, item.id);
      expect(((await listLibrary('sticker', { recent: 5 }))[0]?.lastUsedAt ?? '') > first).toBe(
        true,
      );
    });

    it('twice, even at the same time, gives one file and one asset', async () => {
      const created = await create();
      const item = await stickerItem();
      const results = await Promise.all([
        call<AssetRef>(CHANNEL.assetsFromLibrary, item.id),
        call<AssetRef>(CHANNEL.assetsFromLibrary, item.id),
        call<AssetRef>(CHANNEL.assetsFromLibrary, item.id),
      ]);
      expect(new Set(results.map((a) => JSON.stringify(a))).size).toBe(1);
      expect(await readdir(join(created.dir, 'assets'))).toHaveLength(1);
      const session = currentSession();
      expect(session && Object.keys(knownAssets(session))).toEqual([item.id]);
    });

    it('answers with the asset the book already holds once the renderer saved it', async () => {
      await create();
      const item = await stickerItem();
      const first = await call<AssetRef>(CHANNEL.assetsFromLibrary, item.id);
      const session = currentSession();
      const book = { ...(session?.book ?? newBook({ title: 'x' })), assets: { [first.id]: first } };
      await call(CHANNEL.projectSave, book);
      expect(await call<AssetRef>(CHANNEL.assetsFromLibrary, item.id)).toEqual(first);
    });

    it('needs an open project', async () => {
      const item = await stickerItem();
      await expect(call(CHANNEL.assetsFromLibrary, item.id)).rejects.toThrow(/No project is open/);
      expect(await listLibrary('sticker', { recent: 5 })).toEqual([]);
    });

    it('rejects an item the library does not hold, and indexes nothing', async () => {
      await create();
      await expect(call(CHANNEL.assetsFromLibrary, 'sticker-0000000000000000')).rejects.toThrow(
        /Unknown library item/,
      );
      const session = currentSession();
      expect(session && knownAssets(session)).toEqual({});
    });

    it.each([
      ['no id', []],
      ['an id with a separator', ['a/b']],
      ['a number', [1]],
      ['two ids', ['a', 'b']],
    ])('rejects %s', async (_label, args) => {
      await expect(call(CHANNEL.assetsFromLibrary, ...args)).rejects.toThrow(/assets:fromLibrary/);
    });
  });

  describe('palette', () => {
    it('returns the dominant colours of photos (through their thumbnails) and stickers', async () => {
      await create();
      const photos = await call<ImportReport>(CHANNEL.photosImport, [fixturePath('small.jpg')]);
      const stickers = await call<AssetRef[]>(CHANNEL.assetsImportFiles, 'sticker', [
        fixturePath('alpha.png'),
      ]);
      const ids = [...photos.added, ...stickers].map((a) => a.id);
      const colours = await call<string[]>(CHANNEL.assetsPalette, ids);
      expect(colours.length).toBeGreaterThan(0);
      expect(colours.length).toBeLessThanOrEqual(6);
      for (const colour of colours) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('renders the thumbnail of a photo that has none yet', async () => {
      const created = await create();
      const photos = await call<ImportReport>(CHANNEL.photosImport, [fixturePath('small.jpg')]);
      const id = photos.added[0]?.id ?? '';
      await rm(join(created.dir, 'cache', `${id}.thumb.jpg`));
      expect((await call<string[]>(CHANNEL.assetsPalette, [id])).length).toBeGreaterThan(0);
      expect(await exists(join(created.dir, 'cache', `${id}.thumb.jpg`))).toBe(true);
    });

    it('skips fonts and answers nothing for an empty list', async () => {
      await create();
      const font = join(root, 'Inter.woff2');
      await writeFile(font, 'font bytes');
      const [asset] = await call<AssetRef[]>(CHANNEL.assetsImportFiles, 'font', [font]);
      expect(await call(CHANNEL.assetsPalette, [asset?.id])).toEqual([]);
      expect(await call(CHANNEL.assetsPalette, [])).toEqual([]);
    });

    it('rejects an asset the project does not hold', async () => {
      await create();
      await expect(call(CHANNEL.assetsPalette, ['nope'])).rejects.toThrow(/Unknown asset: nope/);
    });

    it('refuses an asset whose file leaves the project', async () => {
      const created = await create();
      const evil: AssetRef = {
        id: 'evil',
        kind: 'sticker',
        file: '../outside.png',
        originalName: 'x.png',
        sha256: 'x',
      };
      await call(CHANNEL.projectSave, { ...created.book, assets: { evil } });
      await expect(call(CHANNEL.assetsPalette, ['evil'])).rejects.toThrow(/no usable file/);
    });

    it.each([
      ['a string instead of a list', 'abc'],
      ['an id with a separator', ['a/b']],
      ['an id with dot-dot', ['..']],
      ['a number', [1]],
      ['too many ids', Array.from({ length: 501 }, (_, i) => `id${i}`)],
    ])('rejects %s', async (_label, ids) => {
      await create();
      await expect(call(CHANNEL.assetsPalette, ids)).rejects.toThrow(/assets:palette/);
    });
  });
});

describe('library', () => {
  const add = (kind: string, ...paths: string[]): Promise<LibraryItem[]> =>
    call<LibraryItem[]>(CHANNEL.libraryAdd, kind, paths);
  const list = (kind: string, query?: unknown): Promise<LibraryItem[]> =>
    call<LibraryItem[]>(CHANNEL.libraryList, kind, query);

  describe('add and list', () => {
    it('keeps copies of files, titled with the file name, and lists them', async () => {
      const [a, b] = await add('sticker', fixturePath('alpha.png'), fixturePath('évasion n°1.jpg'));
      expect([a?.title, b?.title]).toEqual(['alpha', 'évasion n°1']);
      expect([a?.kind, b?.kind]).toEqual(['sticker', 'sticker']);
      expect(a?.id).toMatch(/^sticker-[0-9a-f]{16}$/);
      expect(await list('sticker')).toEqual([b, a]);
      expect(await list('background')).toEqual([]);
    });

    it('gives the existing item for the same bytes, once even if named twice', async () => {
      const [first] = await add('sticker', fixturePath('alpha.png'));
      const again = await add('sticker', fixturePath('alpha.png'), fixturePath('alpha.png'));
      expect(again).toEqual([first]);
      expect(await list('sticker')).toHaveLength(1);
    });

    it('takes fonts, and answers an empty list with nothing', async () => {
      const font = join(root, 'Inter.woff2');
      await writeFile(font, 'font bytes');
      const [item] = await add('font', font);
      expect(item).toMatchObject({ kind: 'font', title: 'Inter', file: `files/${item?.id}.woff2` });
      expect(await add('sticker')).toEqual([]);
    });

    it('stops at a file it refuses, names it, and keeps the files before it', async () => {
      await expect(
        add(
          'sticker',
          fixturePath('alpha.png'),
          fixturePath('truncated.jpg'),
          fixturePath('opaque.png'),
        ),
      ).rejects.toThrow(/truncated\.jpg/);
      expect((await list('sticker')).map((i) => i.title)).toEqual(['alpha']);
    });

    it('refuses a file of the wrong type for the kind, and a missing file', async () => {
      await expect(add('font', fixturePath('alpha.png'))).rejects.toThrow(/alpha\.png/);
      await expect(add('sticker', join(root, 'absent.png'))).rejects.toThrow(/absent\.png/);
      expect(await list('sticker')).toEqual([]);
    });

    it('searches and filters like listLibrary', async () => {
      const [a, b] = await add('sticker', fixturePath('alpha.png'), fixturePath('opaque.png'));
      await call(CHANNEL.librarySetFavourite, a?.id, true);
      expect((await list('sticker', { text: 'OPAQ' })).map((i) => i.id)).toEqual([b?.id]);
      expect((await list('sticker', { favourite: true })).map((i) => i.id)).toEqual([a?.id]);
      expect(await list('sticker', { recent: 3 })).toEqual([]);
      expect(await list('sticker', undefined)).toHaveLength(2);
      expect(await list('sticker', {})).toHaveLength(2);
    });

    it.each([
      ['no kind', []],
      ['an unknown kind', ['video']],
      ['a pattern (not a library kind)', ['pattern']],
      ['an unknown query key', ['sticker', { colour: 'red' }]],
      ['a text that is not a string', ['sticker', { text: 1 }]],
      ['a favourite that is not a boolean', ['sticker', { favourite: 'yes' }]],
      ['a negative recent', ['sticker', { recent: -1 }]],
      ['a fractional recent', ['sticker', { recent: 1.5 }]],
      ['a huge recent', ['sticker', { recent: 1e9 }]],
      ['a query that is not an object', ['sticker', 'x']],
      ['too many arguments', ['sticker', {}, 'x']],
    ])('list rejects %s', async (_label, args) => {
      await expect(call(CHANNEL.libraryList, ...args)).rejects.toThrow(/library:list/);
    });

    it.each([
      ['no arguments', []],
      ['the template kind', ['template', [fixturePath('alpha.png')]]],
      ['an unknown kind', ['video', [fixturePath('alpha.png')]]],
      ['paths that are not a list', ['sticker', fixturePath('alpha.png')]],
      ['a relative path', ['sticker', ['alpha.png']]],
      ['a path with a NUL', ['sticker', ['/tmp/a\0.png']]],
      ['an empty path', ['sticker', ['']]],
    ])('add rejects %s', async (_label, args) => {
      await expect(call(CHANNEL.libraryAdd, ...args)).rejects.toThrow(/library:add/);
      expect(await list('sticker')).toEqual([]);
    });
  });

  describe('setFavourite and remove', () => {
    it('flips the favourite flag', async () => {
      const [item] = await add('sticker', fixturePath('alpha.png'));
      await call(CHANNEL.librarySetFavourite, item?.id, true);
      expect((await list('sticker'))[0]?.favourite).toBe(true);
      await call(CHANNEL.librarySetFavourite, item?.id, false);
      expect((await list('sticker'))[0]?.favourite).toBe(false);
    });

    it('rejects an unknown item', async () => {
      await expect(
        call(CHANNEL.librarySetFavourite, 'sticker-0000000000000000', true),
      ).rejects.toThrow(/Unknown library item/);
    });

    it('removes an item and its file; removing it again is fine', async () => {
      const [item] = await add('sticker', fixturePath('alpha.png'));
      const file = join(root, 'userdata', 'library', item?.file ?? '');
      expect(await exists(file)).toBe(true);
      await call(CHANNEL.libraryRemove, item?.id);
      await call(CHANNEL.libraryRemove, item?.id);
      expect(await list('sticker')).toEqual([]);
      expect(await exists(file)).toBe(false);
    });

    it('leaves the copy that an album already holds', async () => {
      const info = await create();
      const [item] = await add('sticker', fixturePath('alpha.png'));
      const asset = await call<AssetRef>(CHANNEL.assetsFromLibrary, item?.id);
      await call(CHANNEL.libraryRemove, item?.id);
      expect(await exists(join(info.dir, asset.file))).toBe(true);
    });

    it.each([
      ['setFavourite with no flag', CHANNEL.librarySetFavourite, ['sticker-1']],
      ['setFavourite with a non-boolean flag', CHANNEL.librarySetFavourite, ['sticker-1', 1]],
      ['setFavourite with a bad id', CHANNEL.librarySetFavourite, ['../x', true]],
      ['remove with no id', CHANNEL.libraryRemove, []],
      ['remove with a bad id', CHANNEL.libraryRemove, ['a/b']],
      ['remove with a number', CHANNEL.libraryRemove, [1]],
    ])('rejects %s', async (_label, channel, args) => {
      await expect(call(channel, ...args)).rejects.toThrow(new RegExp(channel));
    });
  });

  describe('user templates', () => {
    const template = (id: string, name = 'Deux photos'): Template => ({
      id,
      name,
      category: 'photos',
      scope: 'page',
      photoCount: 2,
      origin: 'user',
      grid: {
        root: { split: 'row', weights: [1, 1], children: [{ slot: 'photo' }, { slot: 'photo' }] },
        fullBleed: false,
      },
    });

    it('saves, lists and deletes', async () => {
      await call(CHANNEL.libraryTemplateSave, template('t1', 'B'));
      await call(CHANNEL.libraryTemplateSave, template('t2', 'A'));
      expect(await call<Template[]>(CHANNEL.libraryTemplateList)).toEqual([
        template('t2', 'A'),
        template('t1', 'B'),
      ]);
      await call(CHANNEL.libraryTemplateDelete, 't1');
      await call(CHANNEL.libraryTemplateDelete, 't1');
      expect((await call<Template[]>(CHANNEL.libraryTemplateList)).map((t) => t.id)).toEqual([
        't2',
      ]);
    });

    it.each([
      ['an empty object', {}],
      ['a template with a bad scope', { ...template('t1'), scope: 'book' }],
      ['a template with neither grid nor free', { ...template('t1'), grid: undefined }],
      ['a template with a negative photo count', { ...template('t1'), photoCount: -1 }],
      ['a string', 'template'],
    ])('rejects %s before writing', async (_label, value) => {
      await expect(call(CHANNEL.libraryTemplateSave, value)).rejects.toThrow(
        /library:saveTemplate/,
      );
      expect(await call(CHANNEL.libraryTemplateList)).toEqual([]);
    });

    it('rejects a bundled template and an id that is not a plain file name', async () => {
      await expect(
        call(CHANNEL.libraryTemplateSave, { ...template('t1'), origin: 'bundled' }),
      ).rejects.toThrow(/user/);
      await expect(call(CHANNEL.libraryTemplateSave, template('../escape'))).rejects.toThrow();
      expect(await call(CHANNEL.libraryTemplateList)).toEqual([]);
    });

    it.each([
      ['save with no argument', CHANNEL.libraryTemplateSave, []],
      ['save with two arguments', CHANNEL.libraryTemplateSave, [{}, {}]],
      ['list with an argument', CHANNEL.libraryTemplateList, ['x']],
      ['delete with no id', CHANNEL.libraryTemplateDelete, []],
      ['delete with a bad id', CHANNEL.libraryTemplateDelete, ['../t1']],
    ])('rejects %s', async (_label, channel, args) => {
      await expect(call(channel, ...args)).rejects.toThrow(new RegExp(channel));
    });
  });
});

describe('app', () => {
  it('answers the version', async () => {
    expect(await call(CHANNEL.appVersion)).toBe('1.2.3');
  });

  it('opens an https URL', async () => {
    await call(CHANNEL.appOpenExternal, 'https://commons.wikimedia.org/wiki/Main_Page');
    expect(host.openExternal).toHaveBeenCalledExactlyOnceWith(
      'https://commons.wikimedia.org/wiki/Main_Page',
    );
  });

  it('hands the host the normalised URL', async () => {
    await call(CHANNEL.appOpenExternal, 'HTTPS://Example.COM/a b');
    expect(host.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/a%20b');
  });

  it.each([
    'http://example.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'mailto:someone@example.com',
    'ftp://example.com/x',
    'tb://asset/abc?v=original',
    'steam://run/1',
    'vscode://file/etc/passwd',
    '//example.com',
    'example.com',
    'https:',
    'https://',
    '',
    `https://example.com/${'a'.repeat(2048)}`,
  ])('refuses %j and never calls the host', async (url) => {
    await expect(call(CHANNEL.appOpenExternal, url)).rejects.toThrow(/app:openExternal/);
    expect(host.openExternal).not.toHaveBeenCalled();
  });

  it.each([[[]], [[42]], [[null]], [[{ href: 'https://example.com' }]], [['https://a.com', 'x']]])(
    'refuses the arguments %j',
    async (args) => {
      await expect(call(CHANNEL.appOpenExternal, ...args)).rejects.toThrow(/app:openExternal/);
      expect(host.openExternal).not.toHaveBeenCalled();
    },
  );
});

describe('registerIpc', () => {
  function fakeIpcMain(): {
    ipcMain: Pick<IpcMain, 'handle'>;
    handlers: Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>>;
  } {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>
    >();
    const ipcMain = {
      handle: (channel: string, listener: never) => {
        handlers.set(channel, listener);
      },
    } as Pick<IpcMain, 'handle'>;
    return { ipcMain, handlers };
  }

  const eventFrom = (send = vi.fn(), destroyed = false): IpcMainInvokeEvent =>
    ({ sender: { send, isDestroyed: () => destroyed } }) as unknown as IpcMainInvokeEvent;

  it('registers every channel', () => {
    const { ipcMain, handlers } = fakeIpcMain();
    registerIpc(ipcMain, host, () => true);
    expect([...handlers.keys()].sort()).toEqual(Object.values(CHANNEL).sort());
  });

  it('serves a trusted sender and sends progress to that sender only', async () => {
    const { ipcMain, handlers } = fakeIpcMain();
    registerIpc(ipcMain, host, () => true);
    await create();
    const send = vi.fn();
    const report = (await handlers.get(CHANNEL.photosImport)?.(eventFrom(send), [
      fixturePath('small.jpg'),
    ])) as ImportReport;
    expect(report.added).toHaveLength(1);
    expect(send).toHaveBeenCalledExactlyOnceWith(PROGRESS_CHANNEL, 1, 1);
  });

  it('refuses an untrusted sender before reading its arguments', async () => {
    const { ipcMain, handlers } = fakeIpcMain();
    registerIpc(ipcMain, host, () => false);
    await expect(handlers.get(CHANNEL.appVersion)?.(eventFrom())).rejects.toThrow(
      /untrusted sender/i,
    );
    expect(host.version).not.toHaveBeenCalled();
  });

  it('does not fail an import because the window is gone', async () => {
    const { ipcMain, handlers } = fakeIpcMain();
    registerIpc(ipcMain, host, () => true);
    await create();
    const send = vi.fn();
    const report = (await handlers.get(CHANNEL.photosImport)?.(eventFrom(send, true), [
      fixturePath('small.jpg'),
    ])) as ImportReport;
    expect(report.added).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('isTrustedPage', () => {
  // Native paths, so that the same test holds on Windows.
  const file = join(tmpdir(), 'Été 2026', 'app', 'out', 'renderer', 'index.html');

  it('accepts the app page loaded from a file, whatever the encoding of the path', () => {
    const url = pathToFileURL(file).href;
    expect(url).toContain('%C3%89t%C3%A9%202026');
    expect(isTrustedPage(url, { file })).toBe(true);
    expect(isTrustedPage(`${url}#/x`, { file })).toBe(true);
    expect(isTrustedPage(`${url}?x=1`, { file })).toBe(true);
  });

  it('refuses another file, another scheme and rubbish', () => {
    for (const url of [
      pathToFileURL(join(dirname(file), 'other.html')).href,
      pathToFileURL(join(tmpdir(), 'passwd')).href,
      'file:///etc/passwd',
      'https://example.com/app/out/renderer/index.html',
      'tb://asset/abc?v=original',
      'about:blank',
      '',
      'not a url',
    ]) {
      expect(isTrustedPage(url, { file })).toBe(false);
    }
  });

  it('accepts the dev server origin, and nothing else', () => {
    const dev = { origin: 'http://localhost:5173' };
    expect(isTrustedPage('http://localhost:5173/', dev)).toBe(true);
    expect(isTrustedPage('http://localhost:5173/index.html?x=1', dev)).toBe(true);
    expect(isTrustedPage('http://localhost:5174/', dev)).toBe(false);
    expect(isTrustedPage('http://localhost:5173.evil.com/', dev)).toBe(false);
    expect(isTrustedPage('https://localhost:5173/', dev)).toBe(false);
    expect(isTrustedPage('file:///app/index.html', dev)).toBe(false);
  });
});
