import type { MapPreset, MapStyle } from '@travelbook/core';
import { createStore, useStore } from 'zustand';

interface StyleTemplatesState {
  /** The user's own styles, in the order `maps.listStyles` gives them. */
  mine: MapPreset[];
  /** The last save, rename or delete failed. */
  error: boolean;
  load(): Promise<void>;
  save(name: string, style: MapStyle): Promise<boolean>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
}

/**
 * The user's style templates, kept in main (`maps.*Style`). A template is a model: a map gets a
 * COPY of its style (the chip), so nothing here ever changes a map.
 */
export const styleTemplatesStore = createStore<StyleTemplatesState>((set, get) => ({
  mine: [],
  error: false,
  load: async () => {
    try {
      set({ mine: await window.tb.maps.listStyles() });
    } catch {
      set({ mine: [] });
    }
  },
  save: async (name, style) => {
    try {
      // a copy: the map keeps being edited after the save
      const saved = await window.tb.maps.saveStyle(name, structuredClone(style));
      set({ mine: [...get().mine, saved], error: false });
      return true;
    } catch (error) {
      console.error('Saving a map style failed', error);
      set({ error: true });
      return false;
    }
  },
  rename: async (id, name) => {
    try {
      await window.tb.maps.renameStyle(id, name);
      set({ mine: get().mine.map((p) => (p.id === id ? { ...p, name } : p)), error: false });
    } catch (error) {
      console.error('Renaming a map style failed', error);
      set({ error: true });
    }
  },
  remove: async (id) => {
    try {
      await window.tb.maps.deleteStyle(id);
      set({ mine: get().mine.filter((p) => p.id !== id), error: false });
    } catch (error) {
      console.error('Deleting a map style failed', error);
      set({ error: true });
    }
  },
}));

export const useStyleTemplates = <T>(select: (state: StyleTemplatesState) => T): T =>
  useStore(styleTemplatesStore, select);
