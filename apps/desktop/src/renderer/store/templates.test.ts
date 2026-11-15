import {
  newBook,
  newElement,
  type Book,
  type PhotoElement,
  type Spread,
  type Template,
  type Theme,
} from '@travelbook/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '../strings/fr';
import { createEditorStore, findSpread, type EditorStore } from './editor';
import { DEFAULT_GAP, createTemplatesStore, type TemplatesStore } from './templates';

const photoSlot = { slot: 'photo' } as const;
let n = 0;
const grid = (photoCount: number, extra: Partial<Template> = {}): Template => ({
  id: `b-g${++n}`,
  name: `Grille ${n}`,
  category: 'photos',
  scope: 'page',
  photoCount,
  origin: 'bundled',
  grid: {
    root:
      photoCount === 1
        ? photoSlot
        : {
            split: 'row',
            weights: Array(photoCount).fill(1),
            children: Array(photoCount).fill(photoSlot),
          },
    fullBleed: false,
  },
  ...extra,
});
const free = (photoCount: number, extra: Partial<Template> = {}): Template => ({
  ...grid(photoCount),
  id: `b-f${++n}`,
  grid: undefined,
  free: {
    slots: Array.from({ length: photoCount }, (_, i) => ({
      kind: 'photo' as const,
      x: 0.1,
      y: 0.1 + i * 0.2,
      w: 0.5,
      h: 0.15,
      rotation: 0,
    })),
    decorations: [],
  },
  ...extra,
});

const theme: Theme = { id: 'th', name: 'Thème', coverTemplateId: 'b-cover', fonts: ['Lora'] };
const cover = grid(1, { id: 'b-cover', category: 'couverture', themeId: 'th' });
const three = [grid(3), grid(3), grid(3)];
const wide = grid(2, { id: 'b-wide', scope: 'spread', category: 'double' });
const bundled = [cover, ...three, grid(1), free(3), wide];

interface Fixture {
  editor: EditorStore;
  store: TemplatesStore;
  book: () => Book;
  spreadId: string;
  user: {
    list: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  loadBundled: ReturnType<typeof vi.fn>;
  stored: Template[];
}

const photo = (id: string, x: number, y: number, assetId: string | null): PhotoElement => ({
  ...newElement('photo', { x, y, w: 40, h: 40 }),
  id,
  assetId,
});

async function setup(photos = ['A', 'B', 'C'], rand = () => 0): Promise<Fixture> {
  const editor = createEditorStore({ save: () => Promise.resolve() });
  const book = newBook({ title: 'T', innerSpreads: 2 });
  book.spreads[1]!.elements = photos.map((asset, i) =>
    photo(`p${i}`, 10 + (i % 6) * 12, 10 + (i % 5) * 50, asset),
  );
  await editor.getState().openWith(() => Promise.resolve({ book }));
  const spreadId = book.spreads[1]!.id;
  editor.getState().goToSpread(spreadId);
  const stored: Template[] = [];
  const user = {
    list: vi.fn(() => Promise.resolve([...stored])),
    save: vi.fn((t: Template) => {
      const at = stored.findIndex((s) => s.id === t.id);
      if (at >= 0) stored[at] = t;
      else stored.push(t);
      return Promise.resolve();
    }),
    delete: vi.fn((id: string) => {
      const at = stored.findIndex((s) => s.id === id);
      if (at >= 0) stored.splice(at, 1);
      return Promise.resolve();
    }),
  };
  const loadBundled = vi.fn(() => Promise.resolve({ templates: bundled, themes: [theme] }));
  const store = createTemplatesStore({ editor, loadBundled, user, rand });
  await store.getState().load();
  return {
    editor,
    store,
    book: () => editor.getState().book!,
    spreadId,
    user,
    loadBundled,
    stored,
  };
}

const spreadOf = (f: Fixture, id = f.spreadId): Spread => findSpread(f.book(), id)!;
const photosOf = (f: Fixture, id = f.spreadId) =>
  spreadOf(f, id).elements.filter((e): e is PhotoElement => e.type === 'photo');
const labels = (f: Fixture) => f.editor.getState().history.labels;

describe('templates store: loading', () => {
  it('reads the bundled and the user templates once and indexes them by photo count', async () => {
    const f = await setup();
    const s = f.store.getState();
    expect(s.status).toBe('ready');
    expect(s.themes).toEqual([theme]);
    expect(s.index.byCount.get(3)).toHaveLength(4);
    await s.load();
    expect(f.loadBundled).toHaveBeenCalledTimes(1);
  });

  it('shows the user templates with the bundled ones, and a failed load can be retried', async () => {
    const editor = createEditorStore({ save: () => Promise.resolve() });
    const mine: Template = { ...grid(2), id: 'user-1', origin: 'user' };
    const loadBundled = vi
      .fn()
      .mockRejectedValueOnce(new Error('no resources'))
      .mockResolvedValue({ templates: bundled, themes: [theme] });
    const store = createTemplatesStore({
      editor,
      loadBundled,
      user: { list: () => Promise.resolve([mine]), save: vi.fn(), delete: vi.fn() },
      rand: () => 0,
    });
    await store.getState().load();
    expect(store.getState().status).toBe('error');
    await store.getState().load();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().index.byId.get('user-1')).toBe(mine);
    expect(store.getState().index.byId.get('b-cover')).toBe(cover);
  });
});

describe('templates store: apply', () => {
  it('lays a template out on the page pointed at, as one undo step', async () => {
    const f = await setup();
    const t = three[0]!;
    f.editor.getState().setActivePage('left');
    f.store.getState().apply(t);
    const frames = photosOf(f);
    expect(frames).toHaveLength(3);
    expect(frames.map((p) => p.assetId)).toEqual(['A', 'B', 'C']);
    expect(frames.every((p) => p.x < 210)).toBe(true);
    expect(labels(f)).toEqual([fr.templates.undoApply]);
    expect(f.store.getState().last[`${f.spreadId}:left`]).toBe(t.id);
  });

  it('puts the page template on the right page when that is the one pointed at', async () => {
    const f = await setup([]);
    f.editor.getState().setActivePage('right');
    f.store.getState().apply(three[0]!);
    expect(photosOf(f).every((p) => p.x >= 210)).toBe(true);
  });

  it('puts a spread template on both pages', async () => {
    const f = await setup([]);
    f.store.getState().apply(wide);
    const [a, b] = photosOf(f);
    expect(a!.x).toBeLessThan(210);
    expect(b!.x).toBeGreaterThan(210);
  });

  it('puts any page template on the front of the cover', async () => {
    const f = await setup([]);
    f.editor.getState().goToSpread(f.book().cover.id);
    f.store.getState().apply(three[0]!);
    const frames = photosOf(f, f.book().cover.id);
    expect(frames).toHaveLength(3);
    expect(frames.every((p) => p.x >= 210)).toBe(true);
  });

  it('uses the book safe margin until the margin slider is moved', async () => {
    const f = await setup([]);
    f.store.getState().apply(grid(1));
    expect(photosOf(f)[0]!.y).toBe(f.book().safeMargin);
    expect(DEFAULT_GAP).toBe(4);
  });

  it('puts a themed template background on the page', async () => {
    const f = await setup([]);
    f.store
      .getState()
      .apply(grid(1, { themeId: 'th', background: { kind: 'color', color: '#eadcc4' } }));
    expect(spreadOf(f).background.left).toEqual({ kind: 'color', color: '#eadcc4' });
  });
});

describe('templates store: margin and gap sliders', () => {
  it('re-apply the last grid template live, one undo step per gesture', async () => {
    const f = await setup();
    f.store.getState().apply(three[0]!);
    const width = () => photosOf(f)[0]!.w;
    const before = width();
    f.store.getState().setGap(12, 'g1');
    const wider = width();
    expect(wider).toBeLessThan(before);
    f.store.getState().setGap(16, 'g1');
    f.store.getState().setGap(20, 'g1');
    expect(width()).toBeLessThan(wider);
    expect(labels(f)).toEqual([fr.templates.undoApply, fr.templates.undoSpacing]);
    f.store.getState().setMargin(20, 'g2');
    f.store.getState().setMargin(24, 'g2');
    expect(labels(f)).toHaveLength(3);
    // The photos keep their order through every re-layout.
    expect(photosOf(f).map((p) => p.assetId)).toEqual(['A', 'B', 'C']);
    f.editor.getState().undo();
    f.editor.getState().undo();
    f.editor.getState().undo();
    expect(width()).toBe(40);
  });

  it('do not touch a page that was edited since, or after an undo, and only set the values', async () => {
    const f = await setup();
    f.store.getState().apply(three[0]!);
    const frame = photosOf(f)[0]!;
    f.editor.getState().apply(
      (b) => ({
        ...b,
        spreads: b.spreads.map((s) =>
          s.id === f.spreadId
            ? {
                ...s,
                elements: s.elements.map((e) => (e.id === frame.id ? { ...e, x: e.x + 1 } : e)),
              }
            : s,
        ),
      }),
      'Déplacer',
    );
    const steps = labels(f).length;
    f.store.getState().setGap(10, 'g1');
    expect(f.store.getState().gap).toBe(10);
    expect(labels(f)).toHaveLength(steps);
    expect(photosOf(f)[0]!.x).toBe(frame.x + 1);
  });

  it('leave another spread alone: only the page in view is theirs', async () => {
    const f = await setup();
    f.store.getState().apply(three[0]!);
    const laidOut = spreadOf(f).elements;
    f.editor.getState().goToSpread(f.book().spreads[2]!.id);
    const steps = labels(f).length;
    f.store.getState().setGap(10, 'g1');
    expect(labels(f)).toHaveLength(steps);
    expect(spreadOf(f).elements).toBe(laidOut);
    expect(f.store.getState().gap).toBe(10);
  });

  it('leave a free template alone', async () => {
    const f = await setup();
    f.store.getState().apply(bundled.find((t) => t.free)!);
    const steps = labels(f).length;
    f.store.getState().setGap(9, 'g1');
    f.store.getState().setMargin(3, 'g1');
    expect(labels(f)).toHaveLength(steps);
    expect(f.store.getState().gap).toBe(9);
    expect(f.store.getState().margin).toBe(3);
  });

  it('make the next template use the new values', async () => {
    const f = await setup([]);
    f.store.getState().setMargin(30, 'g1');
    f.store.getState().apply(grid(1));
    expect(photosOf(f)[0]!.y).toBe(30);
  });
});

describe('templates store: random layout', () => {
  it('picks another template with as many photos as the page has, and keeps the photos in order', async () => {
    const f = await setup();
    f.store.getState().apply(three[0]!);
    const steps = labels(f).length;
    expect(f.store.getState().randomLayout(f.spreadId, 'left')).toBe(true);
    const picked = f.store.getState().last[`${f.spreadId}:left`];
    expect(picked).not.toBe(three[0]!.id);
    expect(f.store.getState().index.byId.get(picked!)!.photoCount).toBe(3);
    expect(photosOf(f)).toHaveLength(3);
    expect(photosOf(f).map((p) => p.assetId)).toEqual(['A', 'B', 'C']);
    expect(labels(f)).toHaveLength(steps + 1);
    expect(labels(f).at(-1)).toBe(fr.templates.undoRandom);
  });

  it('never repeats the template it last applied', async () => {
    let r = 0;
    const f = await setup(['A', 'B', 'C'], () => (r = (r + 0.37) % 1));
    f.store.getState().apply(three[0]!);
    let previous = f.store.getState().last[`${f.spreadId}:left`];
    for (let i = 0; i < 12; i++) {
      f.store.getState().randomLayout(f.spreadId, 'left');
      const now = f.store.getState().last[`${f.spreadId}:left`];
      expect(now).not.toBe(previous);
      previous = now;
    }
  });

  it('does nothing on a page without photos', async () => {
    const f = await setup([]);
    expect(f.store.getState().randomLayout(f.spreadId, 'left')).toBe(false);
    expect(labels(f)).toEqual([]);
  });

  it('says so when no other template has that many photos', async () => {
    const f = await setup(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(f.store.getState().randomLayout(f.spreadId, 'left')).toBe(false);
    expect(f.editor.getState().notice).toBe(fr.templates.randomNone);
  });
});

describe('templates store: my templates', () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await setup();
    f.editor.getState().setActivePage('left');
  });

  it('saves a page as a model with a user- id, and shows it in Mes modèles', async () => {
    await f.store.getState().saveAs('left');
    const [saved] = f.stored;
    expect(saved).toMatchObject({
      origin: 'user',
      scope: 'page',
      photoCount: 3,
      name: fr.templates.defaultName(1),
    });
    expect(saved!.id.startsWith('user-')).toBe(true);
    const s = f.store.getState();
    expect(s.tab).toBe('mine');
    expect(s.saved).toBe(saved!.name);
    expect(s.user).toEqual([saved]);
    expect(s.index.byId.get(saved!.id)).toBe(saved);
  });

  it('names the next model apart from the ones that exist', async () => {
    await f.store.getState().saveAs('left');
    await f.store.getState().saveAs('left');
    expect(f.stored.map((t) => t.name)).toEqual([
      fr.templates.defaultName(1),
      fr.templates.defaultName(2),
    ]);
  });

  it('applies a saved model to another page', async () => {
    f.store.getState().apply(three[0]!);
    await f.store.getState().saveAs('left');
    const mine = f.stored[0]!;
    f.editor.getState().setActivePage('right');
    f.store.getState().apply(mine);
    expect(photosOf(f).filter((p) => p.x >= 210)).toHaveLength(3);
  });

  it('saves the cover as a cover model and a spread as a spread model', async () => {
    f.editor.getState().goToSpread(f.book().cover.id);
    await f.store.getState().saveAs('right');
    f.editor.getState().goToSpread(f.spreadId);
    await f.store.getState().saveAs('spread');
    expect(f.stored.map((t) => [t.category, t.scope])).toEqual([
      ['couverture', 'page'],
      ['double', 'spread'],
    ]);
  });

  it('refuses a page with more than 16 photos, and tells the user when saving fails', async () => {
    const many = await setup(Array.from({ length: 17 }, (_, i) => `P${i}`));
    await many.store.getState().saveAs('left');
    expect(many.stored).toEqual([]);
    expect(many.editor.getState().notice).toBe(fr.templates.tooManyPhotos);

    f.user.save.mockRejectedValueOnce(new Error('disk'));
    await f.store.getState().saveAs('left');
    expect(f.editor.getState().notice).toBe(fr.templates.saveFailed);
    expect(f.store.getState().saved).toBeNull();
  });

  it('renames and deletes, ignoring an empty name', async () => {
    await f.store.getState().saveAs('left');
    const id = f.stored[0]!.id;
    await f.store.getState().rename(id, '  Ma page  ');
    expect(f.store.getState().user[0]!.name).toBe('Ma page');
    await f.store.getState().rename(id, '   ');
    expect(f.store.getState().user[0]!.name).toBe('Ma page');
    await f.store.getState().remove(id);
    expect(f.store.getState().user).toEqual([]);
    expect(f.store.getState().index.byId.has(id)).toBe(false);
  });
});
