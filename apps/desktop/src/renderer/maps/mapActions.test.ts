// @vitest-environment jsdom
import { mapElement } from '@travelbook/core/src/map/test-helpers';
import {
  MAP_LICENCE,
  addElement,
  bookForSave,
  newBook,
  type AssetRef,
  type Book,
  type MapElement,
} from '@travelbook/core';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveGeometryAsset } from '../../main/maps/geometry-asset';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';
import {
  closeMapDialog,
  mapDialogStore,
  openMapDialog,
  pickSubject,
  updateSpec,
} from './dialogModel';
import { geometryCache } from './geometryCache';
import { applyMap, resetWorldCache } from './mapActions';
import { setSubjectIndex, type SubjectIndex } from './subjects';

const RESOURCES = join(import.meta.dirname, '../../../resources/maps');
const read = (file: string) => readFileSync(join(RESOURCES, file), 'utf8');
const index = JSON.parse(read('index.json')) as SubjectIndex;

let dir: string;
let saved: AssetRef[];
let packReply: 'bundled' | { ok: false; reason: 'offline' | 'checksum' | 'unknown' };
const loadPack = vi.fn(async (id: string) => {
  if (packReply !== 'bundled') return packReply;
  const entry = index.subjects.find((s) => s.id === id);
  if (!entry?.pack?.bundled) return { ok: false as const, reason: 'unknown' as const };
  return { ok: true as const, json: read(entry.pack.file) };
});
const saveGeometry = vi.fn(async (json: string, meta: { name: string }) => {
  const asset = await saveGeometryAsset(dir, json, meta);
  saved.push(asset);
  return asset;
});

let book: Book;
let spreadId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tb-mapactions-'));
  saved = [];
  packReply = 'bundled';
  resetWorldCache();
  setSubjectIndex(index);
  loadPack.mockClear();
  saveGeometry.mockClear();
  (window as unknown as { tb: unknown }).tb = {
    maps: { loadPack, saveGeometry },
    project: { save: () => Promise.resolve() },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      try {
        return new Response(read(String(url).replace('tb://resource/maps/', '')));
      } catch {
        return new Response('', { status: 404 });
      }
    }),
  );
  book = { ...newBook({ title: 'Thaï', innerSpreads: 2 }), safeMargin: 8 };
  spreadId = book.spreads[0]!.id;
  await editorStore.getState().openWith(() => Promise.resolve({ book }));
  editorStore.getState().goToSpread(spreadId);
});
afterEach(async () => {
  closeMapDialog();
  vi.unstubAllGlobals();
  editorStore.getState().notify(null);
  await rm(dir, { recursive: true, force: true });
});

const maps = (b: Book) =>
  [b.cover, ...b.spreads]
    .flatMap((s) => s.elements)
    .filter((e): e is MapElement => e.type === 'map');
const labels = () => editorStore.getState().history.labels;

async function newThailand() {
  await openMapDialog();
  await pickSubject('TH');
  await applyMap(mapDialogStore.getState());
}

describe('applyMap, new map', () => {
  it('adds one map on the page in view, as one undo step', async () => {
    const before = editorStore.getState().book!;
    await newThailand();
    const after = editorStore.getState().book!;
    const [el] = maps(after);
    expect(maps(after)).toHaveLength(1);
    expect(after.spreads[0]!.elements).toContain(el);
    expect(labels()).toEqual([fr.maps.undoCreate]);
    expect(mapDialogStore.getState().open).toBe(false);
    expect(editorStore.getState().selection).toEqual([el!.id]);

    const w = after.format.width;
    // the first spread has no left page: the map goes on its right page
    const x0 = w;
    expect(el).toMatchObject({
      x: x0 + 8,
      y: 8,
      w: w - 16,
      h: after.format.height - 16,
      rotation: 0,
      opacity: 1,
      name: 'Thaïlande',
    });
    expect(el!.subject).toMatchObject({ id: 'TH', showLakes: true });

    editorStore.getState().undo();
    expect(maps(editorStore.getState().book!)).toHaveLength(0);
    expect(editorStore.getState().book!.spreads[0]!.elements).toEqual(before.spreads[0]!.elements);
    expect(editorStore.getState().history.canUndo).toBe(false);
  });

  it('stores a valid geometry with the ODbL licence, and the element points at it', async () => {
    await newThailand();
    const el = maps(editorStore.getState().book!)[0]!;
    expect(saveGeometry).toHaveBeenCalledTimes(1);
    expect(saveGeometry.mock.calls[0]![1]).toEqual({ name: 'Thaïlande' });
    const asset = saved[0]!;
    expect(el.geometryAssetId).toBe(asset.id);
    expect(editorStore.getState().book!.assets[asset.id]).toEqual(asset);
    expect(asset.licence).toEqual(MAP_LICENCE);
    expect(asset.kind).toBe('map');
    const file = JSON.parse(await readFile(join(dir, asset.file), 'utf8'));
    expect(file.paths.land.length).toBeGreaterThan(1000);
  });

  it('saves the album as version 2 once it holds a map', async () => {
    expect(bookForSave(editorStore.getState().book!).schemaVersion).toBe(1);
    await newThailand();
    expect(bookForSave(editorStore.getState().book!).schemaVersion).toBe(2);
  });

  it('forgets the cached geometry of the saved id before the element uses it', async () => {
    const order: string[] = [];
    const invalidate = vi
      .spyOn(geometryCache, 'invalidate')
      .mockImplementation(() => void order.push('invalidate'));
    const stop = editorStore.subscribe((s, prev) => {
      if (s.book !== prev.book) order.push('book');
    });
    await newThailand();
    stop();
    expect(invalidate).toHaveBeenCalledWith(saved[0]!.id);
    expect(order[0]).toBe('invalidate');
    expect(order).toContain('book');
    invalidate.mockRestore();
  });

  it('uses the name typed in the dialog', async () => {
    await openMapDialog();
    await pickSubject('TH');
    mapDialogStore.setState({ name: 'Notre Thaïlande' });
    await applyMap(mapDialogStore.getState());
    expect(maps(editorStore.getState().book!)[0]!.name).toBe('Notre Thaïlande');
  });

  it('bakes a region subject from its bundled fine pack', async () => {
    await openMapDialog();
    await pickSubject('IT');
    updateSpec({ subject: { ...mapDialogStore.getState().spec!.subject, regions: [] } });
    await applyMap(mapDialogStore.getState());
    expect(loadPack).toHaveBeenCalledWith('IT');
    expect(mapDialogStore.getState().packFallback).toBeNull();
    expect(maps(editorStore.getState().book!)).toHaveLength(1);
  });

  it.each(['offline', 'checksum', 'unknown'] as const)(
    'bakes from the base file when the pack is %s, and the dialog says why from the pick on',
    async (reason) => {
      packReply = { ok: false, reason };
      await openMapDialog();
      await pickSubject('IT');
      expect(mapDialogStore.getState().packFallback).toBe(reason);
      await applyMap(mapDialogStore.getState());
      expect(maps(editorStore.getState().book!)).toHaveLength(1);
      // nothing is left after the dialog closes
      expect(mapDialogStore.getState().packFallback).toBeNull();
    },
  );

  it('treats a throwing pack call as offline', async () => {
    loadPack.mockRejectedValueOnce(new Error('ipc'));
    await openMapDialog();
    await pickSubject('IT');
    expect(mapDialogStore.getState().packFallback).toBe('offline');
    await applyMap(mapDialogStore.getState());
    expect(maps(editorStore.getState().book!)).toHaveLength(1);
  });

  it('asks for a pack only when the index lists one: no pack, no call and no fallback', async () => {
    // every subject of the shipped index lists a pack: take it off Thailand
    setSubjectIndex({
      subjects: index.subjects.map((x) => ({ ...x, pack: undefined })),
    });
    packReply = { ok: false, reason: 'unknown' };
    await openMapDialog();
    await pickSubject('TH');
    expect(loadPack).not.toHaveBeenCalled();
    expect(mapDialogStore.getState().packFallback).toBeNull();
    await applyMap(mapDialogStore.getState());
    expect(loadPack).not.toHaveBeenCalled();
  });

  it('loads the subject data once: the pick loads it, the apply reuses it', async () => {
    await openMapDialog();
    await pickSubject('IT');
    await applyMap(mapDialogStore.getState());
    expect(loadPack).toHaveBeenCalledTimes(1);
  });

  it('preselects the region of a search hit', async () => {
    const sicily = index.subjects
      .find((x) => x.id === 'IT')!
      .regions!.find((r) => r.name === 'Sicile')!;
    await openMapDialog();
    await pickSubject('IT', sicily.id);
    expect(mapDialogStore.getState().spec!.subject.regions).toEqual([sicily.id]);
  });

  it('does nothing without a subject', async () => {
    await openMapDialog();
    await applyMap(mapDialogStore.getState());
    expect(saveGeometry).not.toHaveBeenCalled();
    expect(labels()).toEqual([]);
  });

  it('on failure leaves the book alone, keeps the dialog open and tells the user', async () => {
    saveGeometry.mockRejectedValueOnce(new Error('disk full'));
    await openMapDialog();
    await pickSubject('TH');
    await applyMap(mapDialogStore.getState());
    expect(maps(editorStore.getState().book!)).toHaveLength(0);
    expect(labels()).toEqual([]);
    expect(mapDialogStore.getState()).toMatchObject({
      open: true,
      status: 'failed',
      error: 'disk full',
    });
    expect(editorStore.getState().notice).toBe(fr.maps.applyFailed);
  });
});

describe('applyMap, concurrency and cancel', () => {
  it('a double apply from a stale snapshot makes one map and one undo step', async () => {
    await openMapDialog();
    await pickSubject('TH');
    const snapshot = mapDialogStore.getState();
    await Promise.all([applyMap(snapshot), applyMap(snapshot)]);
    expect(maps(editorStore.getState().book!)).toHaveLength(1);
    expect(labels()).toEqual([fr.maps.undoCreate]);
    expect(saveGeometry).toHaveBeenCalledTimes(1);
  });

  it('closing the dialog during the apply adds no map', async () => {
    await openMapDialog();
    await pickSubject('TH');
    const done = applyMap(mapDialogStore.getState());
    closeMapDialog();
    await done;
    expect(maps(editorStore.getState().book!)).toHaveLength(0);
    expect(labels()).toEqual([]);
  });

  it('does not close a dialog opened while the apply ran', async () => {
    await openMapDialog();
    await pickSubject('TH');
    const done = applyMap(mapDialogStore.getState());
    closeMapDialog();
    await openMapDialog();
    await done;
    expect(mapDialogStore.getState().open).toBe(true);
    expect(maps(editorStore.getState().book!)).toHaveLength(0);
  });

  it('a failure after the dialog was closed touches nothing', async () => {
    saveGeometry.mockImplementationOnce(async () => {
      closeMapDialog();
      throw new Error('late');
    });
    await openMapDialog();
    await pickSubject('TH');
    await applyMap(mapDialogStore.getState());
    expect(mapDialogStore.getState()).toMatchObject({ open: false, status: 'idle', error: null });
    expect(editorStore.getState().notice).toBeNull();
  });

  it('puts the map on the spread in view when the apply started', async () => {
    await openMapDialog();
    await pickSubject('TH');
    const done = applyMap(mapDialogStore.getState());
    editorStore.getState().goToSpread(book.spreads[1]!.id);
    await done;
    expect(book.spreads[0]!.id).toBe(spreadId);
    expect(editorStore.getState().book!.spreads[0]!.elements.some((e) => e.type === 'map')).toBe(
      true,
    );
  });

  it('checks the page before baking: no page, no asset', async () => {
    await openMapDialog();
    await pickSubject('TH');
    editorStore.setState({ currentSpreadId: 'nope' });
    await applyMap(mapDialogStore.getState());
    expect(saveGeometry).not.toHaveBeenCalled();
    expect(mapDialogStore.getState().status).toBe('failed');
  });
});

describe('applyMap, reopened map', () => {
  async function reopen(over: Partial<MapElement> = {}) {
    const el: MapElement = {
      ...mapElement(),
      id: 'm1',
      x: 33,
      y: 44,
      w: 120,
      h: 90,
      rotation: 12,
      opacity: 0.7,
      groupId: 'g1',
      name: 'Ma carte',
      ...over,
    };
    const start = addElement(book, spreadId, el);
    await editorStore.getState().openWith(() => Promise.resolve({ book: start }));
    editorStore.getState().goToSpread(spreadId);
    await openMapDialog({ spreadId, elementId: 'm1' });
    return el;
  }

  it('replaces the spec in place, keeping box, rotation, opacity and group', async () => {
    const el = await reopen();
    updateSpec({ medallions: true, background: '#ffffff' });
    const count = editorStore.getState().book!.spreads[0]!.elements.length;
    await applyMap(mapDialogStore.getState());
    const after = editorStore.getState().book!;
    expect(after.spreads[0]!.elements).toHaveLength(count);
    const now = maps(after)[0]!;
    expect(now).toMatchObject({
      id: 'm1',
      x: 33,
      y: 44,
      w: 120,
      h: 90,
      rotation: 12,
      opacity: 0.7,
      groupId: 'g1',
      name: 'Ma carte',
      medallions: true,
      background: '#ffffff',
    });
    expect(now.geometryAssetId).not.toBe(el.geometryAssetId);
    expect(now.geometryAssetId).toBe(saved[0]!.id);
    expect(labels()).toEqual([fr.maps.undoUpdate]);
    expect(editorStore.getState().book!.assets[saved[0]!.id]).toBeDefined();
  });

  it('keeps a name typed in the dialog', async () => {
    await reopen();
    mapDialogStore.setState({ name: 'Autre nom' });
    await applyMap(mapDialogStore.getState());
    expect(maps(editorStore.getState().book!)[0]!.name).toBe('Autre nom');
  });

  it('is undone in one step', async () => {
    const el = await reopen();
    updateSpec({ medallions: true });
    await applyMap(mapDialogStore.getState());
    editorStore.getState().undo();
    expect(maps(editorStore.getState().book!)[0]).toEqual(el);
  });

  it('applies a map whose places and route were inconsistent without throwing', async () => {
    await reopen({
      route: {
        stops: ['p1', 'ghost'],
        legs: [],
        numbered: false,
      },
      places: [mapElement().places[0]!, mapElement().places[0]!],
    });
    await applyMap(mapDialogStore.getState());
    expect(mapDialogStore.getState().status).not.toBe('failed');
    expect(maps(editorStore.getState().book!)[0]!.route).toEqual({
      stops: ['p1'],
      legs: [],
      numbered: false,
    });
  });

  it('adds a new map when the reopened one was deleted meanwhile', async () => {
    await reopen();
    editorStore.getState().apply(
      (b) => ({
        ...b,
        spreads: b.spreads.map((s) => ({ ...s, elements: [] })),
      }),
      'x',
    );
    await applyMap(mapDialogStore.getState());
    expect(maps(editorStore.getState().book!)).toHaveLength(1);
  });
});
