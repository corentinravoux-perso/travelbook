import {
  contrastRatio,
  shadeOf,
  type PosterFont,
  type PosterIllustration,
  type PosterLayout,
  type PosterSpec,
} from '@travelbook/core';
import { POSTER_PRESETS } from './presets';

/** What the "Créer une affiche" dialog holds. */
export interface PosterDialogState {
  spec: PosterSpec;
  /** The preset the form started from, if any (kept while the user edits). */
  presetId: string | null;
  /** Gallery filter: a destination id, or 'all'. */
  destination: string;
  /** "Même couleur que le titre": the illustration's main colour follows the title. */
  tieIllustrationToTitle: boolean;
}

export type ColorRole =
  'background' | 'title' | 'accent' | 'decor' | 'illustrationMain' | 'illustrationShade';

export type PosterAction =
  | { type: 'pickPreset'; id: string }
  | { type: 'setField'; field: 'title' | 'subtitle' | 'year'; value: string }
  | { type: 'setLayout'; layout: PosterLayout }
  | { type: 'setFont'; font: PosterFont }
  | { type: 'setColor'; role: ColorRole; color: string }
  | { type: 'setTie'; on: boolean }
  | {
      type: 'setIllustration';
      illustration: PosterIllustration;
      colors?: { main: string; shade: string };
    }
  | { type: 'setSpine'; on: boolean }
  | { type: 'filter'; destination: string };

/** Below this ratio the title is said to vanish into its background (white on a pastel passes). */
export const CONTRAST_WARNING = 1.3;

/** A neutral start: the book's title, the house face, the first preset's illustration. */
export function initialPosterState(bookTitle: string): PosterDialogState {
  const first = POSTER_PRESETS[0]!.spec;
  const title = bookTitle.trim().toLocaleUpperCase('fr') || 'MON VOYAGE';
  return {
    spec: {
      layout: 'classique',
      title,
      subtitle: '',
      year: '',
      font: 'Lilita One',
      colors: {
        background: '#f1ece4',
        title: '#2b3a4a',
        accent: '#b5452f',
        decor: '#ffffff',
        illustration: { ...first.colors.illustration },
      },
      illustration: { ...first.illustration },
      spine: true,
    },
    presetId: null,
    destination: 'all',
    tieIllustrationToTitle: false,
  };
}

const tied = (color: string) => ({ main: color, shade: shadeOf(color) });

export function posterReducer(state: PosterDialogState, action: PosterAction): PosterDialogState {
  const spec = state.spec;
  const colors = spec.colors;
  switch (action.type) {
    case 'pickPreset': {
      const preset = POSTER_PRESETS.find((p) => p.id === action.id);
      if (!preset) return state;
      // A year or subtitle the user typed survives: presets leave them empty.
      const next: PosterSpec = structuredClone(preset.spec);
      if (next.year === '') next.year = spec.year;
      if (next.subtitle === '') next.subtitle = spec.subtitle;
      if (state.tieIllustrationToTitle) next.colors.illustration = tied(next.colors.title);
      return { ...state, spec: next, presetId: preset.id };
    }
    case 'setField':
      return { ...state, spec: { ...spec, [action.field]: action.value } };
    case 'setLayout':
      return { ...state, spec: { ...spec, layout: action.layout } };
    case 'setFont':
      return { ...state, spec: { ...spec, font: action.font } };
    case 'setColor': {
      const c = action.color;
      const next = { ...colors, illustration: { ...colors.illustration } };
      if (action.role === 'illustrationMain') next.illustration.main = c;
      else if (action.role === 'illustrationShade') next.illustration.shade = c;
      else next[action.role] = c;
      if (action.role === 'title' && state.tieIllustrationToTitle) next.illustration = tied(c);
      return { ...state, spec: { ...spec, colors: next } };
    }
    case 'setTie':
      return {
        ...state,
        tieIllustrationToTitle: action.on,
        spec: action.on
          ? { ...spec, colors: { ...colors, illustration: tied(colors.title) } }
          : spec,
      };
    case 'setIllustration':
      return {
        ...state,
        spec: {
          ...spec,
          illustration: action.illustration,
          colors:
            action.colors && !state.tieIllustrationToTitle
              ? { ...colors, illustration: { ...action.colors } }
              : colors,
        },
      };
    case 'setSpine':
      return { ...state, spec: { ...spec, spine: action.on } };
    case 'filter':
      return { ...state, destination: action.destination };
  }
}

/** The poster can be applied once it has a title. */
export const canApply = (state: PosterDialogState): boolean => state.spec.title.trim() !== '';

/** The title almost vanishes into its background. */
export const contrastWarning = (state: PosterDialogState): boolean =>
  contrastRatio(state.spec.colors.title, state.spec.colors.background) < CONTRAST_WARNING;
