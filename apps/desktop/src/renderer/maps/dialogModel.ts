import {
  DEFAULT_MAP_STYLE,
  newId,
  normalizeStyle,
  pageBox,
  type Book,
  type MapElement,
  type MapLeg,
  type MapPlace,
  type Mm,
  type Rect,
  type MapTopology,
  type Side,
} from '@travelbook/core';
import { createStore, useStore } from 'zustand';
import { editorStore } from '../store/editor';
import {
  getSubject,
  loadPlaces,
  loadFinePack,
  loadSubjectBase,
  loadSubjectIndex,
  type BundledPlace,
  type IndexSubject,
  type PackFallback,
  type FinePack,
} from './subjects';
import { stopBakeWorker } from './bakeClient';
import { forgetBake } from './previewBake';

/** What the dialog edits: the map element without its box, its name and its baked geometry. */
export type MapSpec = Pick<
  MapElement,
  'subject' | 'frame' | 'projection' | 'style' | 'places' | 'route' | 'medallions' | 'background'
>;

export type { PackFallback };

export interface MapTarget {
  spreadId: string;
  elementId: string;
}

export interface MapDialogState {
  open: boolean;
  /** The map being reopened; `null`: a new map. */
  target: MapTarget | null;
  /** The element's name; a new map is named after its subject. */
  name: string;
  /** `null` until a subject is chosen. */
  spec: MapSpec | null;
  /** The subject's bundled cities and sights, for the place lists. */
  bundled: BundledPlace[];
  /**
   * Set from the pick (or the reopening) of a subject whose fine pack could not be had: the base
   * file is used instead and the dialog says so; `null` otherwise.
   */
  packFallback: PackFallback | null;
  status: 'idle' | 'applying' | 'failed';
  error: string | null;
}

const idle = (): MapDialogState => ({
  open: false,
  target: null,
  name: '',
  spec: null,
  bundled: [],
  packFallback: null,
  status: 'idle',
  error: null,
});

export const mapDialogStore = createStore<MapDialogState>(idle);
export const useMapDialog = <T>(select: (state: MapDialogState) => T): T =>
  useStore(mapDialogStore, select);

/** Mm² of a page the size of an A4 page inset by 10 mm: what the place counts are scaled on. */
const REFERENCE_AREA_MM2 = 190 * 277;
const MIN_CITIES = 6;
const MAX_CITIES = 10;
const DEFAULT_SIGHTS = 5;

/** A bundled place as a map place: shown and labelled, with the marker of the style. */
export function placeFromBundled(p: BundledPlace): MapPlace {
  return {
    id: newId(),
    source: { kind: p.kind === 'sight' ? 'sight' : 'city', ref: p.ref },
    lon: p.lon,
    lat: p.lat,
    label: p.name,
    shown: true,
    labelShown: true,
    marker: null,
    markerSize: null,
    labelOffset: null,
    photo: null,
  };
}

/**
 * The places a new map starts with: the capital, 6 to 10 more cities by rank (more as the frame
 * grows: a full page gets 9, a small box 6) and the 5 best sights.
 */
export function defaultPlaces(places: BundledPlace[], frameAreaMm2: number): MapPlace[] {
  const byRank = (a: BundledPlace, b: BundledPlace) => a.rank - b.rank;
  const capital = places.filter((p) => p.kind === 'capital').sort(byRank)[0];
  const cities = places.filter((p) => p.kind === 'city').sort(byRank);
  const sights = places.filter((p) => p.kind === 'sight').sort(byRank);
  const wanted = Math.min(
    MAX_CITIES,
    Math.max(MIN_CITIES, Math.round(MIN_CITIES + (4 * frameAreaMm2) / REFERENCE_AREA_MM2 - 1)),
  );
  return [
    ...(capital ? [capital] : []),
    ...cities.slice(0, wanted),
    ...sights.slice(0, DEFAULT_SIGHTS),
  ].map(placeFromBundled);
}

/**
 * Where a new map goes: the page in view (the other one when it has none) inset by the album's
 * safe margin. `null` when the spread does not exist.
 */
export function newMapBox(book: Book, spreadId: string, side: Side): Rect | null {
  const spread =
    book.cover.id === spreadId ? book.cover : book.spreads.find((s) => s.id === spreadId);
  if (!spread) return null;
  const page =
    pageBox(book, spread, side) ?? pageBox(book, spread, side === 'left' ? 'right' : 'left');
  if (!page) return null;
  const m: Mm = Math.min(book.safeMargin, page.w / 4, page.h / 4);
  return { x: page.x + m, y: page.y + m, w: page.w - 2 * m, h: page.h - 2 * m };
}

const frameArea = (): number => {
  const { book, currentSpreadId, activePage } = editorStore.getState();
  const box = book && currentSpreadId ? newMapBox(book, currentSpreadId, activePage) : null;
  return box ? box.w * box.h : REFERENCE_AREA_MM2;
};

const reopenedArea = (): number | null => {
  const { target } = mapDialogStore.getState();
  const book = editorStore.getState().book;
  if (!book || !target) return null;
  const el = [book.cover, ...book.spreads]
    .find((s) => s.id === target.spreadId)
    ?.elements.find((e) => e.id === target.elementId);
  return el ? el.w * el.h : null;
};

const newSpec = (subject: IndexSubject): MapSpec => ({
  subject: {
    id: subject.id,
    regions: [],
    showRegions: true,
    showNeighbours: true,
    showLakes: true,
    includeRemote: false,
  },
  frame: null,
  projection: 'auto',
  style: structuredClone(DEFAULT_MAP_STYLE),
  places: [],
  route: null,
  medallions: false,
  background: null,
});

const DEFAULT_LEG: MapLeg = { mode: 'voiture', curve: 'droit', bend: 0, icon: false };

/**
 * The spec of a stored map, made safe to edit: the schema has no cross-field checks, so places
 * with the same id, regions the subject does not have, stops that name no place and a leg list
 * of the wrong length are repaired here instead of throwing later.
 */
export function specOf(el: MapElement, subject: IndexSubject | null): MapSpec {
  const seen = new Set<string>();
  const places = (Array.isArray(el.places) ? el.places : []).filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  const known = subject?.regions ? new Set(subject.regions.map((r) => r.id)) : null;
  const regions = (el.subject?.regions ?? []).filter((r) => known === null || known.has(r));
  let route: MapElement['route'] = null;
  if (el.route) {
    const stops = (el.route.stops ?? []).filter((id) => seen.has(id));
    if (stops.length > 0) {
      const legs = Array.from(
        { length: stops.length - 1 },
        (_, i) => el.route!.legs?.[i] ?? DEFAULT_LEG,
      );
      route = { stops, legs: structuredClone(legs), numbered: el.route.numbered };
    }
  }
  return structuredClone({
    subject: { ...el.subject, regions },
    frame: el.frame,
    projection: el.projection,
    style: normalizeStyle(el.style),
    places,
    route,
    medallions: el.medallions,
    background: el.background,
  });
}

/** Ignore the answer of a subject loaded before a newer choice. Bumped by open, pick and close. */
let choice = 0;

/** Tells whether the dialog is still the one an async job started in (open, not replaced). */
export const dialogToken = (): number => choice;

let loadedBase: { id: string; promise: Promise<MapTopology> } | null = null;
let loadedPack: { id: string; promise: Promise<FinePack> } | null = null;

/** The base file of a subject, loaded once per dialog session. A failed load is not kept. */
export function subjectBase(subjectId: string): Promise<MapTopology> {
  if (loadedBase?.id === subjectId) return loadedBase.promise;
  const entry = {
    id: subjectId,
    promise: loadSubjectBase(subjectId).catch((error: unknown) => {
      if (loadedBase === entry) loadedBase = null;
      throw error;
    }),
  };
  loadedBase = entry;
  return entry.promise;
}

/**
 * The fine pack of a subject, loaded the first time it is asked for in a dialog session (a
 * region is chosen) and kept. Never rejects.
 */
export function subjectPack(subjectId: string): Promise<FinePack> {
  if (loadedPack?.id === subjectId) return loadedPack.promise;
  const entry = { id: subjectId, promise: loadFinePack(subjectId) };
  loadedPack = entry;
  return entry.promise;
}

/**
 * Bring `packFallback` in line with the regions chosen: a whole-country map uses no pack and has
 * no reason; with a region chosen the pack is loaded (once) and its reason shown.
 */
async function syncPackFallback(): Promise<void> {
  const mine = choice;
  const { spec } = mapDialogStore.getState();
  if (!spec || spec.subject.regions.length === 0) {
    if (mapDialogStore.getState().packFallback !== null)
      mapDialogStore.setState({ packFallback: null });
    return;
  }
  const { packFallback } = await subjectPack(spec.subject.id);
  const now = mapDialogStore.getState().spec;
  if (
    mine === choice &&
    now &&
    now.subject.id === spec.subject.id &&
    now.subject.regions.length > 0
  ) {
    mapDialogStore.setState({ packFallback });
  }
}

/** Close the dialog and forget its state. */
export function closeMapDialog(): void {
  choice += 1;
  loadedBase = null;
  loadedPack = null;
  stopBakeWorker();
  forgetBake();
  mapDialogStore.setState(idle(), true);
}

/**
 * Open the dialog: for a new map (empty, until a subject is picked), or on the map of `target`.
 * A target that is not a map of the open album opens a new map.
 */
export async function openMapDialog(target?: MapTarget): Promise<void> {
  const mine = ++choice;
  const index = await loadSubjectIndex();
  if (mine !== choice) return;
  const book = editorStore.getState().book;
  const spread =
    book && target
      ? [book.cover, ...book.spreads].find((s) => s.id === target.spreadId)
      : undefined;
  const el = spread?.elements.find((e) => e.id === target?.elementId);
  if (!target || !el || el.type !== 'map') {
    mapDialogStore.setState({ ...idle(), open: true });
    return;
  }
  const subject = getSubject(el.subject?.id, index);
  mapDialogStore.setState({
    ...idle(),
    open: true,
    target,
    name: el.name ?? subject?.name ?? '',
    spec: specOf(el, subject),
  });
  if (subject) {
    const bundled = await loadPlaces(subject);
    if (mine === choice) mapDialogStore.setState({ bundled });
    void syncPackFallback();
  }
}

/** Start a new map of a subject (or change the subject of the one being edited): default places. */
export async function pickSubject(subjectId: string, regionId?: string): Promise<void> {
  const mine = ++choice;
  const index = await loadSubjectIndex();
  const subject = getSubject(subjectId, index);
  if (!subject || mine !== choice) return;
  const bundled = await loadPlaces(subject);
  if (mine !== choice) return;
  const area = reopenedArea() ?? frameArea();
  const base = newSpec(subject);
  if (regionId !== undefined) base.subject.regions = [regionId];
  const previous = mapDialogStore.getState().spec;
  mapDialogStore.setState({
    name: subject.name,
    bundled,
    // the look and the options the user set survive a change of subject
    spec: {
      ...base,
      ...(previous
        ? {
            style: previous.style,
            projection: previous.projection,
            medallions: previous.medallions,
            background: previous.background,
          }
        : {}),
      places: defaultPlaces(bundled, area),
    },
    packFallback: null,
    status: 'idle',
    error: null,
  });
  await syncPackFallback();
}

/** Change fields of the spec. No effect before a subject is picked. */
export async function updateSpec(patch: Partial<MapSpec>): Promise<void> {
  const { spec } = mapDialogStore.getState();
  if (!spec) return;
  mapDialogStore.setState({ spec: { ...spec, ...patch } });
  // settles once the fine pack of the chosen regions is in (when the regions changed)
  if (patch.subject) await syncPackFallback();
}

export const setMapName = (name: string): void => mapDialogStore.setState({ name });

/** The map can be applied once it has a subject. */
export const canApply = (state: MapDialogState): boolean =>
  state.spec !== null && state.status !== 'applying';
