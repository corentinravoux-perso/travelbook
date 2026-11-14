import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateSchema, newElement, type Template } from '@travelbook/core';
import { setUserDataDir } from '../user-data';
import { deleteUserTemplate, listUserTemplates, saveUserTemplate } from './templates';

// Pass-through wrapper so a test can make `rename` fail (atomic-write test).
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
const { rename: realRename } =
  await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

let work: string;
let folder: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'tb-templates-'));
  setUserDataDir(join(work, 'user data'));
  folder = join(work, 'user data', 'library', 'templates');
});

afterEach(async () => {
  vi.mocked(rename).mockImplementation(realRename);
  setUserDataDir(null);
  await rm(work, { recursive: true, force: true });
});

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

const grid = (id: string, name = `Modèle ${id}`): Template => ({
  id,
  name,
  category: 'photos',
  scope: 'page',
  photoCount: 2,
  origin: 'user',
  grid: {
    root: { split: 'row', weights: [1, 2], children: [{ slot: 'photo' }, { slot: 'photo' }] },
    fullBleed: false,
  },
});

const free = (id: string): Template => ({
  id,
  name: 'Collage libre',
  category: 'double',
  scope: 'spread',
  photoCount: 1,
  origin: 'user',
  free: {
    slots: [
      { kind: 'photo', x: 0.1, y: 0.1, w: 0.5, h: 0.6, rotation: 3, mask: { kind: 'ellipse' } },
      { kind: 'text', x: 0.1, y: 0.75, w: 0.8, h: 0.15, rotation: 0, textRole: 'caption' },
    ],
    decorations: [newElement('shape', { x: 0.7, y: 0.1, w: 0.2, h: 0.2 })],
  },
});

describe('user templates', () => {
  it('is empty before anything was saved, and does not create the folder', async () => {
    expect(await listUserTemplates()).toEqual([]);
    expect(await exists(folder)).toBe(false);
  });

  it('round-trips a grid template and a free template through TemplateSchema', async () => {
    const a = grid('11111111-aaaa');
    const b = free('22222222-bbbb');
    await saveUserTemplate(a);
    await saveUserTemplate(b);
    const listed = await listUserTemplates();
    expect(listed).toHaveLength(2);
    expect(listed).toContainEqual(a);
    expect(listed).toContainEqual(b);
    for (const template of listed) expect(TemplateSchema.safeParse(template).success).toBe(true);
  });

  it('keeps each template in templates/<id>.json as plain JSON', async () => {
    await saveUserTemplate(grid('t1'));
    expect(await readdir(folder)).toEqual(['t1.json']);
    expect(JSON.parse(await readFile(join(folder, 't1.json'), 'utf8'))).toEqual(grid('t1'));
  });

  it('replaces the template with the same id', async () => {
    await saveUserTemplate(grid('t1', 'Avant'));
    await saveUserTemplate(grid('t1', 'Après'));
    expect((await listUserTemplates()).map((t) => t.name)).toEqual(['Après']);
    expect(await readdir(folder)).toEqual(['t1.json']);
  });

  it('lists by name, accents and numbers in French order', async () => {
    await saveUserTemplate(grid('c', 'Vue 10'));
    await saveUserTemplate(grid('a', 'Été'));
    await saveUserTemplate(grid('b', 'Vue 2'));
    await saveUserTemplate(grid('d', 'Zèbre'));
    expect((await listUserTemplates()).map((t) => t.name)).toEqual([
      'Été',
      'Vue 2',
      'Vue 10',
      'Zèbre',
    ]);
  });

  it('deletes a template, and an unknown or already deleted one is not an error', async () => {
    await saveUserTemplate(grid('t1'));
    await saveUserTemplate(grid('t2'));
    await deleteUserTemplate('t1');
    await deleteUserTemplate('t1');
    await deleteUserTemplate('never-there');
    expect((await listUserTemplates()).map((t) => t.id)).toEqual(['t2']);
  });

  describe('save refuses, and writes nothing,', () => {
    it.each([
      ['a template that fails the schema', { ...grid('t1'), photoCount: -1 }],
      ['a template with neither grid nor free', { ...grid('t1'), grid: undefined }],
      ['a template with both grid and free', { ...grid('t1'), free: free('t1').free }],
      ['a bundled template', { ...grid('t1'), origin: 'bundled' }],
      ['an id that is not a plain file name', grid('../outside')],
      ['an id with a separator', grid('a/b')],
      ['an id with a dot', grid('a.b')],
    ])('%s', async (_label, template) => {
      await expect(saveUserTemplate(template as Template)).rejects.toThrow();
      expect(await exists(folder)).toBe(false);
      expect(await exists(join(work, 'user data', 'library', 'outside.json'))).toBe(false);
    });

    it('anything that is not an object', async () => {
      await expect(saveUserTemplate(null as unknown as Template)).rejects.toThrow();
      await expect(saveUserTemplate('t1' as unknown as Template)).rejects.toThrow();
    });
  });

  it('delete refuses an id that is not a plain file name', async () => {
    await saveUserTemplate(grid('t1'));
    await expect(deleteUserTemplate('../templates/t1')).rejects.toThrow();
    await expect(deleteUserTemplate('')).rejects.toThrow();
    expect(await listUserTemplates()).toHaveLength(1);
  });

  describe('list skips, without failing,', () => {
    beforeEach(async () => {
      await saveUserTemplate(grid('good', 'Bon'));
      await mkdir(join(folder, 'folder.json'));
    });

    it('a file that is not JSON, or JSON that is not a template', async () => {
      await writeFile(join(folder, 'broken.json'), '{"id": "broken", "na');
      await writeFile(
        join(folder, 'wrong.json'),
        JSON.stringify({ ...grid('wrong'), photoCount: 'x' }),
      );
      await writeFile(join(folder, 'empty.json'), '');
      await writeFile(join(folder, 'array.json'), '[]');
      await writeFile(join(folder, 'null.json'), 'null');
      expect((await listUserTemplates()).map((t) => t.id)).toEqual(['good']);
    });

    it('a file named for another id than the one inside, and one that is not a user template', async () => {
      await writeFile(join(folder, 'other.json'), JSON.stringify(grid('not-other')));
      await writeFile(
        join(folder, 'bundled.json'),
        JSON.stringify({ ...grid('bundled'), origin: 'bundled' }),
      );
      expect((await listUserTemplates()).map((t) => t.id)).toEqual(['good']);
    });

    it('stray files: a half-written .tmp, other extensions, a folder', async () => {
      await writeFile(join(folder, 'good.json.tmp'), '{"id": "good", "tr');
      await writeFile(join(folder, 'notes.txt'), 'hello');
      expect((await listUserTemplates()).map((t) => t.id)).toEqual(['good']);
    });
  });

  it('is replaced atomically: a failed rename keeps the previous template and leaves no temp file', async () => {
    await saveUserTemplate(grid('t1', 'Avant'));
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(to).endsWith('t1.json')) throw new Error('simulated crash');
      return realRename(from, to);
    });
    await expect(saveUserTemplate(grid('t1', 'Après'))).rejects.toThrow('simulated crash');
    expect((await listUserTemplates()).map((t) => t.name)).toEqual(['Avant']);
    expect(await readdir(folder)).toEqual(['t1.json']);
  });

  it('keeps every template when several are saved at once', async () => {
    await Promise.all(Array.from({ length: 8 }, (_, i) => saveUserTemplate(grid(`t${i}`))));
    expect(await listUserTemplates()).toHaveLength(8);
  });
});
