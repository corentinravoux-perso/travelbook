import { createStore, useStore, type StoreApi } from 'zustand';
import type { SortKey, UsageFilter } from '../panels/trayModel';

/** A file the last import could not take. `name` is `null` when the whole import failed. */
export interface ImportFailure {
  name: string | null;
  /** Why, in French. */
  reason: string;
}

export interface TrayState {
  sort: SortKey;
  filter: UsageFilter;
  /** Asset ids ticked in the tray (a day's checkbox ticks all of its photos). */
  selected: string[];
  /** Day keys (see `trayGroups`) whose photos are folded away under their header. */
  folded: string[];
  /** While an import runs: files done out of the total (`total` is 0 until the first report). */
  progress: { done: number; total: number } | null;
  /** What the last import left behind; empty when it went through. */
  failures: ImportFailure[];
  /** Names of the files whose original the last import put back in the album. */
  restored: string[];

  setSort(sort: SortKey): void;
  setFilter(filter: UsageFilter): void;
  /** Click on a photo: it alone is selected (a second click clears). `additive` toggles it instead. */
  pick(id: string, additive: boolean): void;
  /** The checkbox of a day: tick or untick all of `ids`. */
  setMany(ids: readonly string[], on: boolean): void;
  clearSelection(): void;
  /** The chevron of a day: fold its photos away, or show them again. */
  toggleFolded(key: string): void;
  setProgress(progress: TrayState['progress']): void;
  setFailures(failures: ImportFailure[]): void;
  setRestored(names: string[]): void;
}

export type TrayStore = StoreApi<TrayState>;

export function createTrayStore(): TrayStore {
  return createStore<TrayState>()((set, get) => ({
    sort: 'date',
    filter: 'all',
    selected: [],
    folded: [],
    progress: null,
    failures: [],
    restored: [],

    setSort(sort) {
      set({ sort });
    },
    setFilter(filter) {
      set({ filter });
    },
    pick(id, additive) {
      const { selected } = get();
      const has = selected.includes(id);
      if (additive) set({ selected: has ? selected.filter((s) => s !== id) : [...selected, id] });
      else set({ selected: has && selected.length === 1 ? [] : [id] });
    },
    setMany(ids, on) {
      const { selected } = get();
      set({
        selected: on
          ? [...selected, ...ids.filter((id) => !selected.includes(id))]
          : selected.filter((id) => !ids.includes(id)),
      });
    },
    clearSelection() {
      if (get().selected.length > 0) set({ selected: [] });
    },
    toggleFolded(key) {
      const { folded } = get();
      set({ folded: folded.includes(key) ? folded.filter((k) => k !== key) : [...folded, key] });
    },
    setProgress(progress) {
      set({ progress });
    },
    setFailures(failures) {
      set({ failures });
    },
    setRestored(restored) {
      set({ restored });
    },
  }));
}

/** The app's tray state: how the photo panel sorts, filters and what it has ticked. */
export const trayStore = createTrayStore();

export function useTray<T>(selector: (state: TrayState) => T): T {
  return useStore(trayStore, selector);
}
