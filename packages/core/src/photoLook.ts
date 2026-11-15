import { produce } from 'immer';
import { OpError } from './ops/errors';
import { photoOf, spreadOf } from './ops/util';
import type { Book, PhotoElement } from './schema';

/** A one-click look for a photo: a set of adjustments, not a document field of its own. */
export interface LookPreset {
  id: string;
  /** French display name. */
  name: string;
  adjust: PhotoElement['adjust'];
}

const NEUTRAL: PhotoElement['adjust'] = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  grayscale: 0,
  sepia: 0,
  vignette: 0,
};

const look = (id: string, name: string, adjust: Partial<PhotoElement['adjust']>): LookPreset => ({
  id,
  name,
  adjust: { ...NEUTRAL, ...adjust },
});

/** Our own looks, tuned by eye on holiday photos. The first one is the neutral "Original". */
export const LOOK_PRESETS: LookPreset[] = [
  look('original', 'Original', {}),
  look('vivid', 'Éclatant', { brightness: 1.03, contrast: 1.12, saturation: 1.4 }),
  look('warm', 'Chaleureux', { brightness: 1.04, contrast: 1.05, saturation: 1.15, sepia: 0.2 }),
  look('soft', 'Doux', { brightness: 1.08, contrast: 0.88, saturation: 1.05 }),
  look('faded', 'Délavé', { brightness: 1.1, contrast: 0.82, saturation: 0.7 }),
  look('mono', 'Monochrome', { contrast: 1.15, grayscale: 1 }),
  look('retro', 'Rétro', {
    brightness: 1.02,
    contrast: 1.1,
    saturation: 0.85,
    sepia: 0.4,
    vignette: 0.35,
  }),
  look('dramatic', 'Dramatique', {
    brightness: 0.92,
    contrast: 1.3,
    saturation: 0.85,
    vignette: 0.5,
  }),
  look('vignette', 'Vignette', { vignette: 0.5 }),
];

const same = (a: PhotoElement['adjust'], b: PhotoElement['adjust']): boolean =>
  (Object.keys(a) as (keyof PhotoElement['adjust'])[]).every((k) => a[k] === b[k]);

/**
 * Give each listed photo the adjustments of a preset, replacing its own (the vignette too). Every
 * other field stays. One call is one change of the book, so a selection is one undo step.
 */
export function applyLook(book: Book, spreadId: string, ids: string[], presetId: string): Book {
  const preset = LOOK_PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new OpError(`Unknown look "${presetId}".`);
  return produce(book, (draft) => {
    const spread = spreadOf(draft, spreadId);
    for (const id of new Set(ids)) {
      const el = photoOf(spread, id);
      // Untouched photos keep their object, so a look that changes nothing is no change at all.
      if (!same(el.adjust, preset.adjust)) el.adjust = { ...preset.adjust };
    }
  });
}
