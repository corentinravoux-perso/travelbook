// @vitest-environment jsdom
import { mapElement } from '@travelbook/core/src/map/test-helpers';
import { addElement, newBook, type MapElement } from '@travelbook/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorStore } from '../store/editor';
import {
  canApply,
  closeMapDialog,
  defaultPlaces,
  mapDialogStore,
  newMapBox,
  openMapDialog,
  pickSubject,
  specOf,
  updateSpec,
} from './dialogModel';
import {
  getSubject,
  searchSubjects,
  setSubjectIndex,
  type BundledPlace,
  type SubjectIndex,
} from './subjects';

const RESOURCES = join(import.meta.dirname, '../../../resources/maps');
const read = (file: string) => readFileSync(join(RESOURCES, file), 'utf8');
const index = JSON.parse(read('index.json')) as SubjectIndex;

function stubResources() {
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
}

beforeEach(() => {
  setSubjectIndex(index);
  stubResources();
});
afterEach(() => {
  closeMapDialog();
  vi.unstubAllGlobals();
});

describe('searchSubjects', () => {
  it('finds Thailand by "thai" and "thaïlande", whatever the case and accents', () => {
    for (const q of ['thai', 'thaïlande', 'THAILANDE', 'Thailand']) {
      expect(searchSubjects(q).map((h) => h.subjectId)).toContain('TH');
    }
    expect(searchSubjects('thai')[0]).toMatchObject({ subjectId: 'TH', name: 'Thaïlande' });
  });

  it('finds the Sicily region of Italy by "sicile"', () => {
    const hit = searchSubjects('sicile').find((h) => h.regionId !== undefined);
    expect(hit).toMatchObject({ subjectId: 'IT', name: 'Sicile', parent: 'Italie' });
    expect(getSubject('IT')!.regions!.some((r) => r.id === hit!.regionId)).toBe(true);
  });

  it('puts subjects before regions, and is empty for an empty query', () => {
    expect(searchSubjects('')).toEqual([]);
    expect(searchSubjects('   ')).toEqual([]);
    const hits = searchSubjects('a');
    const firstRegion = hits.findIndex((h) => h.regionId !== undefined);
    expect(
      hits.slice(firstRegion === -1 ? hits.length : firstRegion).every((h) => h.regionId),
    ).toBe(true);
  });

  it('is empty before the index is loaded', () => {
    setSubjectIndex(null);
    expect(searchSubjects('thai')).toEqual([]);
  });
});

const place = (
  kind: BundledPlace['kind'],
  rank: number,
  name = `${kind}${rank}`,
): BundledPlace => ({ ref: `x:${name}`, kind, name, lon: rank, lat: rank, rank });
const many = (): BundledPlace[] => [
  place('capital', 0, 'Capitale'),
  ...Array.from({ length: 30 }, (_, i) => place('city', i + 1)),
  ...Array.from({ length: 12 }, (_, i) => place('sight', i)),
];

describe('defaultPlaces', () => {
  it('has the capital, then cities by rank, then 5 sights', () => {
    const places = defaultPlaces(many(), 190 * 277);
    expect(places[0]!.label).toBe('Capitale');
    const cities = places.filter((p) => p.source.kind === 'city');
    const sights = places.filter((p) => p.source.kind === 'sight');
    expect(cities.map((p) => p.label).slice(1, 4)).toEqual(['city1', 'city2', 'city3']);
    expect(sights.map((p) => p.label)).toEqual(['sight0', 'sight1', 'sight2', 'sight3', 'sight4']);
    expect(places.every((p) => p.shown && p.labelShown && p.marker === null)).toBe(true);
    expect(new Set(places.map((p) => p.id)).size).toBe(places.length);
  });

  it('scales the cities to the frame: 7 to 11 with the capital', () => {
    const count = (area: number) =>
      defaultPlaces(many(), area).filter((p) => p.source.kind === 'city').length;
    expect(count(100)).toBe(7);
    expect(count(190 * 277)).toBeGreaterThanOrEqual(9);
    expect(count(10_000_000)).toBe(11);
    expect(count(100)).toBeLessThan(count(190 * 277));
  });

  it('copes with no capital and few places', () => {
    expect(defaultPlaces([], 1000)).toEqual([]);
    const few = defaultPlaces([place('city', 0), place('sight', 0)], 1000);
    expect(few.map((p) => p.source.kind)).toEqual(['city', 'sight']);
  });

  it('records where a place comes from', () => {
    const [p] = defaultPlaces([place('capital', 0, 'Rome')], 1000);
    expect(p!.source).toEqual({ kind: 'city', ref: 'x:Rome' });
  });
});

describe('newMapBox', () => {
  it('is the page in view inset by the safe margin, and falls back to the other page', () => {
    const book = { ...newBook({ title: 'T', innerSpreads: 1 }), safeMargin: 10 };
    const spread = book.spreads[0]!;
    const w = book.format.width;
    const right = newMapBox(book, spread.id, 'right')!;
    expect(right).toEqual({ x: w + 10, y: 10, w: w - 20, h: book.format.height - 20 });
    const first = newMapBox(book, book.spreads.find((s) => s.kind === 'first')!.id, 'left');
    expect(first!.x).toBeGreaterThanOrEqual(w);
    expect(newMapBox(book, 'nope', 'left')).toBeNull();
  });
});

describe('dialog store', () => {
  it('opens empty, then fills in a subject with its default places', async () => {
    await openMapDialog();
    expect(mapDialogStore.getState()).toMatchObject({ open: true, target: null, spec: null });
    expect(canApply(mapDialogStore.getState())).toBe(false);
    await pickSubject('TH');
    const s = mapDialogStore.getState();
    expect(s.name).toBe('Thaïlande');
    expect(s.spec!.subject).toMatchObject({ id: 'TH', regions: [], showLakes: true });
    expect(s.spec!.places[0]!.label).toBe('Bangkok');
    expect(s.spec!.places.some((p) => p.source.kind === 'sight')).toBe(true);
    expect(s.bundled.length).toBeGreaterThan(20);
    expect(canApply(s)).toBe(true);
  });

  it('keeps the look when the subject changes, and ignores a stale pick', async () => {
    await openMapDialog();
    await pickSubject('TH');
    const style = {
      ...mapDialogStore.getState().spec!.style,
      sizes: { marker: 7, badge: 5, vehicle: 6 },
    };
    updateSpec({ style, medallions: true });
    await Promise.all([pickSubject('IT'), pickSubject('PE')]);
    const s = mapDialogStore.getState();
    expect(s.spec!.subject.id).toBe('PE');
    expect(s.spec!.style.sizes.marker).toBe(7);
    expect(s.spec!.medallions).toBe(true);
  });

  it('a subject without a places file has no places, not an error', async () => {
    await openMapDialog();
    await pickSubject('FR-GF');
    expect(mapDialogStore.getState().spec!.places).toEqual([]);
  });

  it('closing forgets everything', async () => {
    await openMapDialog();
    await pickSubject('TH');
    closeMapDialog();
    expect(mapDialogStore.getState()).toMatchObject({ open: false, spec: null, bundled: [] });
  });
});

describe('reopening a map', () => {
  async function bookWith(el: MapElement) {
    let book = newBook({ title: 'T', innerSpreads: 1 });
    const spreadId = book.spreads[0]!.id;
    book = addElement(book, spreadId, el);
    await editorStore.getState().openWith(() => Promise.resolve({ book }));
    return { spreadId, elementId: el.id };
  }

  it('loads the map spec and name', async () => {
    const el = { ...mapElement(), name: 'Ma carte' };
    const target = await bookWith(el);
    await openMapDialog(target);
    const s = mapDialogStore.getState();
    expect(s.target).toEqual(target);
    expect(s.name).toBe('Ma carte');
    expect(s.spec!.places).toHaveLength(el.places.length);
    expect(s.spec!.route).toEqual(el.route);
  });

  it('opens a new map when the target is not a map of the album', async () => {
    await bookWith(mapElement());
    await openMapDialog({ spreadId: 'nope', elementId: 'nope' });
    expect(mapDialogStore.getState()).toMatchObject({ open: true, target: null, spec: null });
  });

  it('repairs an inconsistent spec instead of throwing', () => {
    const el = mapElement();
    const bad: MapElement = {
      ...el,
      subject: { ...el.subject, regions: ['no-such-region'] },
      places: [...el.places, { ...el.places[0]! }],
      route: {
        stops: ['p1', 'ghost', 'p2', 'p1'],
        legs: [{ mode: 'train', curve: 'courbe', bend: 0.5, icon: true }],
        numbered: true,
      },
    };
    const spec = specOf(bad, getSubject('TH'));
    expect(spec.subject.regions).toEqual([]);
    expect(spec.places.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(spec.route!.stops).toEqual(['p1', 'p2', 'p1']);
    expect(spec.route!.legs).toHaveLength(2);
    expect(spec.route!.legs[0]!.mode).toBe('train');
    expect(
      specOf({ ...bad, route: { stops: ['ghost'], legs: [], numbered: false } }, null).route,
    ).toBeNull();
    expect(() => specOf({ ...bad, subject: { ...bad.subject, id: 'XX' } }, null)).not.toThrow();
  });
});

describe('default places of a region subject', () => {
  const labels = () => mapDialogStore.getState().spec!.places.map((p) => p.label);

  it('keeps the places inside the chosen regions: Sicily has Palerme and Catane, not Rome', async () => {
    await openMapDialog();
    await pickSubject('IT', 'IT-82');
    expect(labels()).toEqual(expect.arrayContaining(['Palerme', 'Catane']));
    expect(labels()).not.toContain('Rome');
    expect(labels()).not.toContain('Naples');
  });

  it('a whole-country pick is unchanged: Rome is in', async () => {
    await openMapDialog();
    await pickSubject('IT');
    expect(labels()).toContain('Rome');
  });

  it('choosing a region re-derives the defaults while the places were not edited', async () => {
    await openMapDialog();
    await pickSubject('IT');
    const spec = mapDialogStore.getState().spec!;
    await updateSpec({ subject: { ...spec.subject, regions: ['IT-82'] } });
    expect(labels()).toContain('Palerme');
    expect(labels()).not.toContain('Rome');
    // and back to the whole country
    await updateSpec({
      subject: { ...mapDialogStore.getState().spec!.subject, regions: [] },
    });
    expect(labels()).toContain('Rome');
  });

  it('leaves the places alone once the user changed them', async () => {
    await openMapDialog();
    await pickSubject('IT');
    const spec = mapDialogStore.getState().spec!;
    const edited = spec.places.map((p, i) => (i === 1 ? { ...p, label: 'Mon lieu' } : p));
    await updateSpec({ places: edited });
    await updateSpec({ subject: { ...spec.subject, regions: ['IT-82'] } });
    expect(labels()).toContain('Mon lieu');
    expect(labels()).toContain('Rome');
  });
});
