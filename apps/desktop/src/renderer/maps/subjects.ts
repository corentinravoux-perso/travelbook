import type { MapTopology } from '@travelbook/core';

/** Where the bundled geodata is served from (`resources/maps/`). */
export const MAPS_BASE = 'tb://resource/maps/';

export interface IndexRegion {
  id: string;
  /** French. */
  name: string;
  bbox: [number, number, number, number];
}

/** One subject of `resources/maps/index.json` (the fields the dialog reads). */
export interface IndexSubject {
  /** `TH`, `FR-MET`, `US-AK`. */
  id: string;
  /** Names the places file: `places/<iso>.json`. */
  iso: string;
  /** French. */
  name: string;
  kind: 'country' | 'dependency' | 'overseas';
  bbox: [number, number, number, number];
  keywords: string[];
  /** The base file, relative to `MAPS_BASE`. */
  file: string;
  regions?: IndexRegion[];
  pack?: { file: string; bundled: boolean };
}

export interface SubjectIndex {
  subjects: IndexSubject[];
}

/** A bundled city or sight (`resources/maps/places/<iso>.json`). */
export interface BundledPlace {
  /** `ne:<id>`, `gn:<id>` or `wd:Q…`. */
  ref: string;
  kind: 'capital' | 'city' | 'sight';
  category?: string;
  /** French. */
  name: string;
  lon: number;
  lat: number;
  /** 0 = most important, counted separately for the cities (capital included) and the sights. */
  rank: number;
}

/** A search result: a subject, or one of its regions (`regionId` set). */
export interface SearchHit {
  subjectId: string;
  /** What the hit is called: the subject's name, or the region's. */
  name: string;
  /** The subject's name, for a region hit. */
  parent?: string;
  regionId?: string;
}

type Fetch = (url: string) => Promise<Response>;

let loaded: SubjectIndex | null = null;
let loading: Promise<SubjectIndex> | null = null;

/** Replace the loaded index (tests; `null` forgets it). */
export function setSubjectIndex(index: SubjectIndex | null): void {
  loaded = index;
  loading = null;
}

/** The index, read once from the bundled resources. A failed read is not kept: the next call retries. */
export function loadSubjectIndex(fetchFn: Fetch = fetch): Promise<SubjectIndex> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= (async () => {
    try {
      const response = await fetchFn(`${MAPS_BASE}index.json`);
      if (!response.ok) throw new Error(`Map index unavailable (${response.status})`);
      const index = (await response.json()) as SubjectIndex;
      if (!Array.isArray(index.subjects)) throw new Error('The map index has no subjects');
      loaded = index;
      return index;
    } catch (error) {
      loading = null;
      throw error;
    }
  })();
  return loading;
}

export function getSubject(id: string, index: SubjectIndex | null = loaded): IndexSubject | null {
  return index?.subjects.find((s) => s.id === id) ?? null;
}

/** Lower case, no accents: "Thaïlande" and "thai" meet. */
export const fold = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const MAX_HITS = 20;

/**
 * Subjects, then regions, whose name, keywords or id contain every word of `q` (case and accents
 * do not matter). Names that start with the query come first. Empty until the index is loaded.
 */
export function searchSubjects(q: string, index: SubjectIndex | null = loaded): SearchHit[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!index || words.length === 0) return [];
  const rank = (haystacks: string[], name: string): number | null => {
    const all = haystacks.map(fold);
    if (!words.every((w) => all.some((h) => h.includes(w)))) return null;
    return fold(name).startsWith(words[0]!) ? 0 : 1;
  };
  const scored: { hit: SearchHit; rank: number }[] = [];
  for (const s of index.subjects) {
    const r = rank([s.name, s.id, s.iso, ...s.keywords], s.name);
    if (r !== null) scored.push({ hit: { subjectId: s.id, name: s.name }, rank: r });
  }
  for (const s of index.subjects) {
    for (const region of s.regions ?? []) {
      const r = rank([region.name], region.name);
      if (r !== null) {
        scored.push({
          hit: { subjectId: s.id, name: region.name, parent: s.name, regionId: region.id },
          rank: 2 + r,
        });
      }
    }
  }
  return scored
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_HITS)
    .map((s) => s.hit);
}

const inBox = (p: { lon: number; lat: number }, [w, s, e, n]: IndexSubject['bbox']): boolean =>
  p.lat >= s && p.lat <= n && (w <= e ? p.lon >= w && p.lon <= e : p.lon >= w || p.lon <= e);

/**
 * The bundled places of a subject: its country's file, kept to the subject's bbox (France's file
 * holds the overseas places, which are subjects of their own). No file: no places.
 */
export async function loadPlaces(
  subject: IndexSubject,
  fetchFn: Fetch = fetch,
): Promise<BundledPlace[]> {
  try {
    const response = await fetchFn(`${MAPS_BASE}places/${subject.iso}.json`);
    if (!response.ok) return [];
    const file = (await response.json()) as { places?: BundledPlace[] };
    return (file.places ?? []).filter((p) => inBox(p, subject.bbox));
  } catch {
    return [];
  }
}

/** A bundled TopoJSON file of the maps resources (`subjects/TH.topo.json`, `world.topo.json`). */
export async function loadTopology(file: string, fetchFn: Fetch = fetch): Promise<MapTopology> {
  const response = await fetchFn(`${MAPS_BASE}${file}`);
  if (!response.ok) throw new Error(`Map file ${file} unavailable (${response.status})`);
  return (await response.json()) as MapTopology;
}

/** Why the fine outline of a subject was not used: see `PackResult`. */
export type PackFallback = 'offline' | 'checksum' | 'unknown';

/** What a subject is baked from. */
export interface SubjectData {
  base: MapTopology;
  /** The fine pack; `null` when the subject has none or it could not be had. */
  pack: MapTopology | null;
  /** Why `pack` is null although the index lists one; `null` otherwise. */
  packFallback: PackFallback | null;
}

/**
 * The base file of a subject and, when the index lists a fine pack for it, the pack through
 * `maps.loadPack`. A pack that cannot be had never fails the load: the base file stands in and
 * `packFallback` says why. Rejects when the subject is unknown or its base file cannot be read.
 */
export async function loadSubjectData(
  subjectId: string,
  fetchFn: Fetch = fetch,
): Promise<SubjectData> {
  const subject = getSubject(subjectId, await loadSubjectIndex(fetchFn));
  if (!subject) throw new Error(`Unknown map subject "${subjectId}"`);
  const [base, fine] = await Promise.all([
    loadTopology(subject.file, fetchFn),
    subject.pack ? finePack(subject.id) : Promise.resolve({ pack: null, packFallback: null }),
  ]);
  return { base, ...fine };
}

async function finePack(
  subjectId: string,
): Promise<{ pack: MapTopology | null; packFallback: PackFallback | null }> {
  try {
    const result = await window.tb.maps.loadPack(subjectId);
    if (!result.ok) return { pack: null, packFallback: result.reason };
    return { pack: JSON.parse(result.json) as MapTopology, packFallback: null };
  } catch {
    return { pack: null, packFallback: 'offline' };
  }
}
