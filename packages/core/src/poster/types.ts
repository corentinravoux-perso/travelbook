import { z } from 'zod';

/**
 * Every layout has the same header (title on top, the year under it on the right); the layout is
 * the composition around the illustration.
 */
export type PosterLayout = 'classique' | 'empile' | 'encadre' | 'arche' | 'soleil' | 'horizon';
export type PosterFont = 'Anton' | 'Bebas Neue' | 'Oswald';

/** A sticker of a bundled set, or an item of the user's sticker library. */
export type PosterIllustration = { set: string; id: string } | { itemId: string };

export interface PosterColors {
  background: string;
  title: string;
  /** Subtitle, year and the encadre frame. */
  accent: string;
  /** The large shapes of a composition: the arch, the disc, the band. */
  decor: string;
  illustration: { main: string; shade: string };
}

/** Every choice of the "Créer une affiche" dialog. Colours are `#rrggbb`. */
export interface PosterSpec {
  layout: PosterLayout;
  /** Printed in capitals whatever the case typed. */
  title: string;
  subtitle: string;
  year: string;
  font: PosterFont;
  colors: PosterColors;
  illustration: PosterIllustration;
  /** Title (and year) along the spine, when the spine is wide enough. */
  spine: boolean;
}

/** A saved setting of the dialog, for one destination. */
export interface PosterPreset {
  id: string;
  destination: string;
  name: string;
  spec: PosterSpec;
}

export const POSTER_LAYOUTS = [
  'classique',
  'empile',
  'encadre',
  'arche',
  'soleil',
  'horizon',
] as const;
export const POSTER_FONTS = ['Anton', 'Bebas Neue', 'Oswald'] as const;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'colour must be #rrggbb');

export const PosterIllustrationSchema = z.union([
  z.object({ set: z.string().min(1), id: z.string().min(1) }).strict(),
  z.object({ itemId: z.string().min(1) }).strict(),
]);

export const PosterSpecSchema = z
  .object({
    layout: z.enum(POSTER_LAYOUTS),
    title: z.string(),
    subtitle: z.string(),
    year: z.string(),
    font: z.enum(POSTER_FONTS),
    colors: z
      .object({
        background: hex,
        title: hex,
        accent: hex,
        decor: hex,
        illustration: z.object({ main: hex, shade: hex }).strict(),
      })
      .strict(),
    illustration: PosterIllustrationSchema,
    spine: z.boolean(),
  })
  .strict();

export const PosterPresetSchema = z
  .object({
    id: z.string().min(1),
    destination: z.string().min(1),
    name: z.string().min(1),
    spec: PosterSpecSchema,
  })
  .strict();

// Keep the hand-written types and the schemas in step.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const specInSync: Same<z.infer<typeof PosterSpecSchema>, PosterSpec> = true;
const presetInSync: Same<z.infer<typeof PosterPresetSchema>, PosterPreset> = true;
void specInSync;
void presetInSync;
