import {
  MAX_TEMPLATE_PHOTOS,
  OpError,
  applyTemplate,
  captureTemplate,
  type Book,
  type Side,
  type Template,
  type Theme,
} from '@travelbook/core';
import { createStore, useStore, type StoreApi } from 'zustand';
import {
  NO_FILTERS,
  indexTemplates,
  photosOnTarget,
  pickRandom,
  randomCount,
  targetFor,
  viewKind,
  type CategoryFilter,
  type CountChip,
  type Filters,
  type TemplateIndex,
  type TemplateTab,
} from '../panels/templatesModel';
import { fr } from '../strings/fr';
import { editorStore, findSpread, type EditorStore } from './editor';

/** Gap between frames when nothing else was chosen, mm. The margin starts at the book's safe margin. */
export const DEFAULT_GAP = 4;

export interface TemplatesDeps {
  /** The editor the templates are applied in. */
  editor: EditorStore;
  loadBundled(): Promise<{ templates: Template[]; themes: Theme[] }>;
  user: {
    list(): Promise<Template[]>;
    save(template: Template): Promise<void>;
    delete(id: string): Promise<void>;
  };
  /** In `[0, 1)`. */
  rand(): number;
}

export interface TemplatesState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  bundled: Template[];
  themes: Theme[];
  user: Template[];
  /** Bundled and user templates, indexed once whenever either changes. */
  index: TemplateIndex;
  tab: TemplateTab;
  filters: Filters;
  /** `null` is the book's safe margin. */
  margin: number | null;
  gap: number;
  /** The template each page last took, by `spreadId:target`: what "Mise en page aléatoire" avoids. */
  last: Record<string, string>;
  /** Name of the model just saved, for a status line; `null` otherwise. */
  saved: string | null;

  /** Read the bundled and the user's templates once; calling again after a failure tries again. */
  load(): Promise<void>;
  setTab(tab: TemplateTab): void;
  setChip(chip: CountChip | null): void;
  setCategory(category: CategoryFilter): void;
  setWithPages(on: boolean): void;
  /** A slider: re-applies the last applied grid template while the page is as it left it. */
  setMargin(mm: number, gesture: string): void;
  setGap(mm: number, gesture: string): void;
  /** Lay `template` out on the page or spread in view (a spread template on the whole spread). */
  apply(template: Template): void;
  /** Lay out `target` again with another template that has as many photos; false when none exists. */
  randomLayout(spreadId: string, target: Side): boolean;
  /** Keep the page in view (`'spread'`: both pages) as a model of the user's, and show it. */
  saveAs(target: Side | 'spread'): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export type TemplatesStore = StoreApi<TemplatesState>;

const EMPTY_INDEX = indexTemplates([]);
const keyOf = (spreadId: string, target: Side | 'spread'): string => `${spreadId}:${target}`;

export function createTemplatesStore(deps: TemplatesDeps): TemplatesStore {
  const { editor } = deps;
  let loading: Promise<void> | null = null;

  /**
   * The last template a page took, and the spread's elements as that application left them. While
   * they are still the spread's elements, nothing was edited since, and the sliders may lay the
   * template out again with new spacing without trampling the user's work.
   */
  let live: {
    spreadId: string;
    target: Side | 'spread';
    template: Template;
    elements: unknown;
  } | null = null;

  return createStore<TemplatesState>()((set, get) => {
    const params = (book: Book) => {
      const { margin, gap } = get();
      return { margin: margin ?? book.safeMargin, gap };
    };

    const rebuild = (bundled: Template[], user: Template[]) =>
      set({ bundled, user, index: indexTemplates([...bundled, ...user]) });

    const refreshUser = async () => rebuild(get().bundled, await deps.user.list());

    const notify = (message: string) => editor.getState().notify(message);

    /** Run `template` on `target` of `spreadId` as one undo step; false when the page refuses it. */
    function applyOn(
      spreadId: string,
      target: Side | 'spread',
      template: Template,
      label: string,
      mergeKey?: string,
    ): boolean {
      try {
        editor
          .getState()
          .apply((b) => applyTemplate(b, spreadId, target, template, params(b)), label, mergeKey);
      } catch (error) {
        if (!(error instanceof OpError)) throw error;
        notify(fr.templates.applyFailed);
        return false;
      }
      const spread = findSpread(editor.getState().book, spreadId);
      live = { spreadId, target, template, elements: spread?.elements };
      set({ last: { ...get().last, [keyOf(spreadId, target)]: template.id } });
      return true;
    }

    /** The sliders: the same template, new spacing, one undo step for the whole gesture. */
    function relayout(gesture: string): void {
      if (live === null || live.template.grid === undefined) return;
      // Only while the page that took the template is the one in view: another spread is not the
      // slider's to change.
      if (editor.getState().currentSpreadId !== live.spreadId) return;
      const spread = findSpread(editor.getState().book, live.spreadId);
      if (spread === undefined || spread.elements !== live.elements) return;
      applyOn(
        live.spreadId,
        live.target,
        live.template,
        fr.templates.undoSpacing,
        `templates:${gesture}`,
      );
    }

    return {
      status: 'idle',
      bundled: [],
      themes: [],
      user: [],
      index: EMPTY_INDEX,
      tab: 'classic',
      filters: NO_FILTERS,
      margin: null,
      gap: DEFAULT_GAP,
      last: {},
      saved: null,

      load() {
        if (get().status === 'ready') return Promise.resolve();
        if (loading !== null) return loading;
        set({ status: 'loading' });
        loading = Promise.all([deps.loadBundled(), deps.user.list()])
          .then(([bundled, user]) => {
            set({ status: 'ready', themes: bundled.themes });
            rebuild(bundled.templates, user);
          })
          .catch(() => {
            set({ status: 'error' });
          })
          .finally(() => {
            loading = null;
          });
        return loading;
      },
      setTab(tab) {
        set({ tab, saved: null });
      },
      setChip(chip) {
        set({ filters: { ...get().filters, chip } });
      },
      setCategory(category) {
        set({ filters: { ...get().filters, category } });
      },
      setWithPages(on) {
        set({ filters: { ...get().filters, withPages: on } });
      },
      setMargin(mm, gesture) {
        if (get().margin === mm) return;
        set({ margin: mm });
        relayout(gesture);
      },
      setGap(mm, gesture) {
        if (get().gap === mm) return;
        set({ gap: mm });
        relayout(gesture);
      },

      apply(template) {
        const { book, currentSpreadId, activePage } = editor.getState();
        const spread = findSpread(book, currentSpreadId);
        if (!book || !spread) return;
        applyOn(
          spread.id,
          targetFor(spread, activePage, template),
          template,
          fr.templates.undoApply,
        );
        set({ saved: null });
      },

      randomLayout(spreadId, target) {
        const { book } = editor.getState();
        const spread = findSpread(book, spreadId);
        if (!book || !spread) return false;
        const count = randomCount(photosOnTarget(book, spread, target));
        if (count === 0) return false;
        const { index, last } = get();
        const picked = pickRandom(index, {
          photoCount: count,
          last: index.byId.get(last[keyOf(spreadId, target)] ?? ''),
          view: viewKind(spread),
          target,
          rand: deps.rand,
        });
        if (picked === null) {
          notify(fr.templates.randomNone);
          return false;
        }
        return applyOn(spreadId, target, picked, fr.templates.undoRandom);
      },

      async saveAs(target) {
        const { book, currentSpreadId } = editor.getState();
        const spread = findSpread(book, currentSpreadId);
        if (!book || !spread) return;
        const taken = new Set(get().user.map((t) => t.name));
        let n = get().user.length + 1;
        while (taken.has(fr.templates.defaultName(n))) n++;
        const name = fr.templates.defaultName(n);
        const captured = captureTemplate(book, spread.id, target, name);
        if (captured.photoCount > MAX_TEMPLATE_PHOTOS) {
          notify(fr.templates.tooManyPhotos);
          return;
        }
        // The panel's categories: a cover model is a cover, a spread model a spread.
        const template: Template = {
          ...captured,
          category:
            spread.kind === 'cover'
              ? 'couverture'
              : target === 'spread'
                ? 'double'
                : captured.category,
        };
        try {
          await deps.user.save(template);
          await refreshUser();
        } catch {
          notify(fr.templates.saveFailed);
          return;
        }
        set({ tab: 'mine', saved: name });
      },

      async rename(id, name) {
        const template = get().user.find((t) => t.id === id);
        const trimmed = name.trim();
        if (!template || trimmed === '' || trimmed === template.name) return;
        try {
          await deps.user.save({ ...template, name: trimmed });
          await refreshUser();
        } catch {
          notify(fr.templates.userFailed);
        }
      },

      async remove(id) {
        try {
          await deps.user.delete(id);
          await refreshUser();
        } catch {
          notify(fr.templates.userFailed);
        }
      },
    };
  });
}

/** The panel's store: the app's editor, the main process's templates, `Math.random`. */
export const templatesStore = createTemplatesStore({
  editor: editorStore,
  loadBundled: () => window.tb.library.bundledTemplates(),
  user: {
    list: () => window.tb.library.userTemplates.list(),
    save: (template) => window.tb.library.userTemplates.save(template),
    delete: (id) => window.tb.library.userTemplates.delete(id),
  },
  rand: Math.random,
});

export function useTemplates<T>(selector: (state: TemplatesState) => T): T {
  return useStore(templatesStore, selector);
}
