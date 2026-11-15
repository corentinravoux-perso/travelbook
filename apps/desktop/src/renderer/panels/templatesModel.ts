import {
  pageBox,
  type Book,
  type Side,
  type Spread,
  type Template,
  type Theme,
} from '@travelbook/core';

// The rules of the Modèles panel, without React or the store: what a spread's templates are, how
// the list is narrowed, and which template "Mise en page aléatoire" picks.

export type TemplateTab = 'themed' | 'classic' | 'mine';
export type CategoryFilter = 'all' | 'photos' | 'texte' | 'ouverture' | 'double';

/** The photo-count chips: 1 to 6, and 7 for "7 and more". */
export const COUNT_CHIPS = [1, 2, 3, 4, 5, 6, 7] as const;
export type CountChip = (typeof COUNT_CHIPS)[number];

export interface Filters {
  /** Photo-count chip; `null` shows every count. */
  chip: CountChip | null;
  category: CategoryFilter;
  /** On the cover: also list the page templates, which then apply to the front cover. */
  withPages: boolean;
}

export const NO_FILTERS: Filters = { chip: null, category: 'all', withPages: false };

/** What is in view decides what the list offers: the cover, one page, or a spread of two pages. */
export type ViewKind = 'cover' | 'page' | 'pages';

export function viewKind(spread: Spread): ViewKind {
  if (spread.kind === 'cover') return 'cover';
  return spread.kind === 'inner' ? 'pages' : 'page';
}

/**
 * The page a page template lands on: the front of the cover (the right of the cover spread), the
 * only page of the first and last spreads, and on an inner spread the page the user last pointed at.
 */
export function pageTarget(spread: Spread, active: Side): Side {
  if (spread.kind === 'cover' || spread.kind === 'first') return 'right';
  return spread.kind === 'last' ? 'left' : active;
}

/** Where `template` goes: the whole spread for a spread template, else the page in view. */
export function targetFor(spread: Spread, active: Side, template: Template): Side | 'spread' {
  return template.scope === 'spread' ? 'spread' : pageTarget(spread, active);
}

// ---------------------------------------------------------------- the index

export interface TemplateIndex {
  all: readonly Template[];
  byId: ReadonlyMap<string, Template>;
  /** Templates by `photoCount`, in the order of `all`: built once, so a random pick does not scan. */
  byCount: ReadonlyMap<number, readonly Template[]>;
}

export function indexTemplates(templates: readonly Template[]): TemplateIndex {
  const byId = new Map<string, Template>();
  const byCount = new Map<number, Template[]>();
  for (const t of templates) {
    // A bundled id wins over a user's, whatever the order they arrive in.
    const known = byId.get(t.id);
    if (known !== undefined && known.origin === 'bundled') continue;
    byId.set(t.id, t);
  }
  const all = [...byId.values()];
  for (const t of all) {
    const list = byCount.get(t.photoCount);
    if (list) list.push(t);
    else byCount.set(t.photoCount, [t]);
  }
  return { all, byId, byCount };
}

// ---------------------------------------------------------------- narrowing the list

const isPageTemplate = (t: Template): boolean => t.scope === 'page' && t.category !== 'couverture';

/** Can `t` be applied to what is in view? */
export function fitsView(t: Template, view: ViewKind, withPages: boolean): boolean {
  switch (view) {
    case 'cover':
      return t.category === 'couverture' || (withPages && isPageTemplate(t));
    case 'page':
      return isPageTemplate(t);
    case 'pages':
      return t.category !== 'couverture';
  }
}

export const matchesChip = (t: Template, chip: CountChip | null): boolean =>
  chip === null || (chip === 7 ? t.photoCount >= 7 : t.photoCount === chip);

/** The category filter is for pages; the cover lists covers (and, if asked, pages) as they are. */
const matchesCategory = (t: Template, category: CategoryFilter, view: ViewKind): boolean =>
  view === 'cover' || category === 'all' || t.category === category;

export interface Section {
  key: string;
  /** Shown above the tiles; `undefined` when the list has one section and needs no heading. */
  title?: string;
  templates: Template[];
}

/** Fewest photos first, templates without a photo (text pages) last; the incoming order breaks ties. */
const byPhotoCount = (list: Template[]): Template[] => {
  const rank = (t: Template): number => (t.photoCount === 0 ? Infinity : t.photoCount);
  return list
    .map((t, position) => ({ t, position }))
    .sort((a, b) => {
      const [ra, rb] = [rank(a.t), rank(b.t)];
      return ra === rb ? a.position - b.position : ra < rb ? -1 : 1;
    })
    .map(({ t }) => t);
};

export interface SectionTitles {
  covers: string;
  pages: string;
  spreads: string;
}

/**
 * What the list shows. "Thématique" lists the themes, each with its cover and then its pages;
 * "Classique" the plain bundled templates; "Mes modèles" the user's. All three follow the view
 * (cover, page, spread) and both filters; sections that end up empty are left out.
 */
export function listTemplates(
  index: TemplateIndex,
  themes: readonly Theme[],
  tab: TemplateTab,
  view: ViewKind,
  filters: Filters,
  titles: SectionTitles,
): Section[] {
  const shown = index.all.filter(
    (t) =>
      fitsView(t, view, filters.withPages) &&
      matchesChip(t, filters.chip) &&
      matchesCategory(t, filters.category, view),
  );

  if (tab === 'themed') {
    return themes
      .map((theme): Section => {
        const own = shown.filter((t) => t.themeId === theme.id);
        const cover = own.filter((t) => t.category === 'couverture');
        const rest = byPhotoCount(own.filter((t) => t.category !== 'couverture'));
        return { key: theme.id, title: theme.name, templates: [...cover, ...rest] };
      })
      .filter((s) => s.templates.length > 0);
  }

  const mine = tab === 'mine';
  const pool = shown.filter((t) =>
    mine ? t.origin === 'user' : t.origin === 'bundled' && t.themeId === undefined,
  );
  const sections: Section[] = [
    {
      key: 'covers',
      title: titles.covers,
      templates: pool.filter((t) => t.category === 'couverture'),
    },
    { key: 'pages', title: titles.pages, templates: pool.filter(isPageTemplate) },
    { key: 'spreads', title: titles.spreads, templates: pool.filter((t) => t.scope === 'spread') },
  ]
    .map((s) => ({ ...s, templates: mine ? s.templates : byPhotoCount(s.templates) }))
    .filter((s) => s.templates.length > 0);
  // A single section needs no heading.
  const [only] = sections;
  return sections.length === 1 && only ? [{ key: only.key, templates: only.templates }] : sections;
}

// ---------------------------------------------------------------- the photos on a target

/** The photos on the page or spread a template would go on. */
export interface TargetPhotos {
  /** Frames that hold a photo. */
  filled: number;
  /** Frames, empty ones included. */
  frames: number;
}

export function photosOnTarget(book: Book, spread: Spread, target: Side | 'spread'): TargetPhotos {
  const box = target === 'spread' ? null : pageBox(book, spread, target);
  let filled = 0;
  let frames = 0;
  for (const el of spread.elements) {
    if (el.type !== 'photo') continue;
    if (box !== null) {
      const cx = el.x + el.w / 2;
      const cy = el.y + el.h / 2;
      if (cx < box.x || cx >= box.x + box.w || cy < box.y || cy > box.y + box.h) continue;
    }
    frames++;
    if (el.assetId !== null) filled++;
  }
  return { filled, frames };
}

/**
 * The count "Mise en page aléatoire" keeps: the photos that are placed, or, on a page that only has
 * empty frames, those frames. 0 when there is nothing to lay out again.
 */
export const randomCount = (p: TargetPhotos): number => (p.filled > 0 ? p.filled : p.frames);

// ---------------------------------------------------------------- the random layout

export interface RandomRequest {
  /** Photos to lay out; the template needs exactly this many frames. */
  photoCount: number;
  /** The template the target last took, which is not picked again. */
  last: Template | undefined;
  view: ViewKind;
  /** Where it goes: the same scope as the page in view. */
  target: Side | 'spread';
  /** In `[0, 1)`; `Math.random` in the app. */
  rand(): number;
}

/**
 * A template with the same photo count and the same scope as the target, other than the one last
 * applied; `null` when there is none. Covers pick covers, pages pick photo pages, spreads pick spread
 * templates. A themed page stays in its theme (when the theme has another one with that many
 * photos) and a plain one stays out of the themes, so a shuffle does not bring a background in.
 */
export function pickRandom(index: TemplateIndex, req: RandomRequest): Template | null {
  const wanted = (t: Template): boolean => {
    if (req.view === 'cover') return t.category === 'couverture';
    if (req.target === 'spread') return t.scope === 'spread';
    return isPageTemplate(t) && t.category === 'photos';
  };
  const candidates = (index.byCount.get(req.photoCount) ?? []).filter(
    (t) => wanted(t) && t.id !== req.last?.id,
  );
  const theme = req.last?.themeId;
  const sameLook = candidates.filter((t) => t.themeId === theme);
  const plain = candidates.filter((t) => t.themeId === undefined);
  const pool = sameLook.length > 0 ? sameLook : plain.length > 0 ? plain : candidates;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(req.rand() * pool.length))] as Template;
}
