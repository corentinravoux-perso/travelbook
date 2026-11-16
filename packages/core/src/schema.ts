import { z } from 'zod';
import { MapElementSchema } from './map/schema';
import type { MapElement } from './map/types';
import { color, elementBase, id, mm, nonNegMm, unit } from './schemaPrimitives';

/** Millimetres. Text sizes are the only values in points (`fontSizePt`). */
export type Mm = number;

export interface Rect {
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
}

export interface Licence {
  source: string;
  author?: string;
  licence: string;
  url: string;
  requiresAttribution: boolean;
}

export interface AssetRef {
  id: string;
  kind: 'photo' | 'sticker' | 'background' | 'pattern' | 'font' | 'map';
  /** Path relative to the project folder. */
  file: string;
  originalName: string;
  sha256: string;
  /** Pixel size after EXIF orientation. */
  pixel?: { w: number; h: number };
  exif?: {
    takenAt?: string;
    orientation?: number;
    camera?: string;
    gps?: { lat: number; lon: number };
  };
  licence?: Licence;
}

export interface ElementBase {
  id: string;
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
  /** Degrees. */
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  name?: string;
  groupId?: string;
}

export interface Crop {
  /** >= 1. */
  scale: number;
  /** Crop centre, 0..1. */
  cx: number;
  cy: number;
}

export interface Shadow {
  dx: Mm;
  dy: Mm;
  blur: Mm;
  color: string;
}

export interface PhotoElement extends ElementBase {
  type: 'photo';
  assetId: string | null;
  crop: Crop;
  flipH: boolean;
  flipV: boolean;
  mask: { kind: 'rect' | 'rounded' | 'ellipse' | 'preset'; radius?: Mm; preset?: string };
  border: { width: Mm; color: string } | null;
  shadow: Shadow | null;
  /**
   * brightness, contrast, saturation: 1 is neutral. grayscale, sepia: 0..1. vignette: 0..1, how
   * dark the corners get (0 is none). A book written before the vignette existed has none.
   */
  adjust: {
    brightness: number;
    contrast: number;
    saturation: number;
    grayscale: number;
    sepia: number;
    vignette: number;
  };
  /** Soft edge: the outline fades out over `feather` mm. `null` keeps it sharp. Absent in older books. */
  edge: { feather: Mm } | null;
}

/** What a text frame is for. Templates have text slots of a role; a text element remembers its own. */
export type TextRole = 'title' | 'caption' | 'body';

export interface TextElement extends ElementBase {
  type: 'text';
  /** Role of the slot this text was created in, if any: applying a template moves it to a slot of the same role. */
  textRole?: TextRole;
  /** Tiptap JSON document. */
  doc: unknown;
  style: {
    fontFamily: string;
    fontSizePt: number;
    color: string;
    lineHeight: number;
    letterSpacing: number;
  };
  align: 'left' | 'center' | 'right' | 'justify';
  vAlign: 'top' | 'middle' | 'bottom';
  box: { fill: string | null; padding: Mm };
  outline: { width: Mm; color: string } | null;
  shadow: Shadow | null;
}

export interface StickerElement extends ElementBase {
  type: 'sticker';
  assetId: string;
  flipH: boolean;
  flipV: boolean;
  tint: string | null;
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  shape: 'rect' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'star';
  fill: string | null;
  stroke: { width: Mm; color: string } | null;
  radius: Mm;
  points: number;
}

export type Element = PhotoElement | TextElement | StickerElement | ShapeElement | MapElement;

export type Background =
  | { kind: 'color'; color: string }
  | {
      kind: 'gradient';
      type: 'linear' | 'radial';
      angle: number;
      stops: { offset: number; color: string }[];
    }
  | { kind: 'pattern'; assetId: string; fg: string; bg: string; scale: number }
  | {
      kind: 'image';
      assetId: string;
      fit: 'cover' | 'contain' | 'tile';
      opacity: number;
      blur: Mm;
      tint: string | null;
    };

export type Side = 'left' | 'right';

export interface Spread {
  id: string;
  kind: 'cover' | 'first' | 'inner' | 'last';
  background: { left?: Background; right?: Background; spread?: Background };
  /** Array order is stacking order (last is on top). */
  elements: Element[];
}

export interface Book {
  /** 2 when the album holds a map element, else 1: see `bookSchemaVersion`. */
  schemaVersion: 1 | 2;
  id: string;
  title: string;
  format: { width: Mm; height: Mm };
  bleed: Mm;
  coverBleed: Mm;
  safeMargin: Mm;
  spineWidth: Mm;
  pageRule: { min: number; multiple: 1 | 2 | 4 };
  settings: { frenchTypography: boolean; dpiGood: number; dpiLow: number };
  cover: Spread;
  /** spreads[0].kind === 'first', last spread kind === 'last'. */
  spreads: Spread[];
  assets: Record<string, AssetRef>;
}

// --- zod schemas ---------------------------------------------------------

export const LicenceSchema = z.object({
  source: z.string(),
  author: z.string().optional(),
  licence: z.string(),
  url: z.string(),
  requiresAttribution: z.boolean(),
});

export const AssetRefSchema = z.object({
  id,
  kind: z.enum(['photo', 'sticker', 'background', 'pattern', 'font', 'map']),
  file: z.string().min(1),
  originalName: z.string(),
  sha256: z.string(),
  pixel: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
  exif: z
    .object({
      takenAt: z.string().optional(),
      orientation: z.number().optional(),
      camera: z.string().optional(),
      gps: z.object({ lat: z.number(), lon: z.number() }).optional(),
    })
    .optional(),
  licence: LicenceSchema.optional(),
});

const ShadowSchema = z.object({ dx: mm, dy: mm, blur: nonNegMm, color });
const StrokeSchema = z.object({ width: nonNegMm, color });

const PhotoSchema = z.object({
  ...elementBase,
  type: z.literal('photo'),
  assetId: z.string().nullable(),
  crop: z.object({ scale: z.number().min(1), cx: unit, cy: unit }),
  flipH: z.boolean(),
  flipV: z.boolean(),
  mask: z.object({
    kind: z.enum(['rect', 'rounded', 'ellipse', 'preset']),
    radius: nonNegMm.optional(),
    preset: z.string().optional(),
  }),
  border: StrokeSchema.nullable(),
  shadow: ShadowSchema.nullable(),
  adjust: z.object({
    brightness: z.number().min(0),
    contrast: z.number().min(0),
    saturation: z.number().min(0),
    grayscale: unit,
    sepia: unit,
    // Optional on disk: a book from before the vignette is read as having none.
    vignette: unit.default(0),
  }),
  edge: z.object({ feather: nonNegMm }).nullable().default(null),
});

export const TextRoleSchema = z.enum(['title', 'caption', 'body']);

const TextSchema = z.object({
  ...elementBase,
  type: z.literal('text'),
  textRole: TextRoleSchema.optional(),
  doc: z.custom<unknown>(
    (v) => typeof v === 'object' && v !== null && (v as { type?: unknown }).type === 'doc',
    { message: 'doc must be a Tiptap document ({ type: "doc", ... })' },
  ),
  style: z.object({
    fontFamily: z.string(),
    fontSizePt: z.number().positive(),
    color,
    lineHeight: z.number().positive(),
    letterSpacing: z.number().finite(),
  }),
  align: z.enum(['left', 'center', 'right', 'justify']),
  vAlign: z.enum(['top', 'middle', 'bottom']),
  box: z.object({ fill: color.nullable(), padding: nonNegMm }),
  outline: StrokeSchema.nullable(),
  shadow: ShadowSchema.nullable(),
});

const StickerSchema = z.object({
  ...elementBase,
  type: z.literal('sticker'),
  assetId: z.string(),
  flipH: z.boolean(),
  flipV: z.boolean(),
  tint: color.nullable(),
});

const ShapeSchema = z.object({
  ...elementBase,
  type: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse', 'line', 'arrow', 'polygon', 'star']),
  fill: color.nullable(),
  stroke: StrokeSchema.nullable(),
  radius: nonNegMm,
  points: z.number().int().min(3),
});

export const ElementSchema = z.discriminatedUnion('type', [
  PhotoSchema,
  TextSchema,
  StickerSchema,
  ShapeSchema,
  MapElementSchema,
]);

export const BackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('color'), color }),
  z.object({
    kind: z.literal('gradient'),
    type: z.enum(['linear', 'radial']),
    angle: z.number().finite(),
    stops: z.array(z.object({ offset: unit, color })).min(2),
  }),
  z.object({
    kind: z.literal('pattern'),
    assetId: z.string(),
    fg: color,
    bg: color,
    scale: z.number().positive(),
  }),
  z.object({
    kind: z.literal('image'),
    assetId: z.string(),
    fit: z.enum(['cover', 'contain', 'tile']),
    opacity: unit,
    blur: nonNegMm,
    tint: color.nullable(),
  }),
]);

export const SpreadSchema = z.object({
  id,
  kind: z.enum(['cover', 'first', 'inner', 'last']),
  background: z.object({
    left: BackgroundSchema.optional(),
    right: BackgroundSchema.optional(),
    spread: BackgroundSchema.optional(),
  }),
  elements: z.array(ElementSchema),
});

export const BookSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    id,
    title: z.string(),
    format: z.object({ width: mm.positive(), height: mm.positive() }),
    bleed: nonNegMm,
    coverBleed: nonNegMm,
    safeMargin: nonNegMm,
    spineWidth: nonNegMm,
    pageRule: z.object({
      min: z.number().int().min(0),
      multiple: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    }),
    settings: z.object({
      frenchTypography: z.boolean(),
      dpiGood: z.number().positive(),
      dpiLow: z.number().positive(),
    }),
    cover: SpreadSchema,
    spreads: z.array(SpreadSchema).min(2),
    assets: z.record(z.string(), AssetRefSchema),
  })
  .superRefine((book, ctx) => {
    if (book.cover.kind !== 'cover') {
      ctx.addIssue({
        code: 'custom',
        path: ['cover', 'kind'],
        message: 'cover.kind must be "cover"',
      });
    }
    book.spreads.forEach((s, i) => {
      const last = book.spreads.length - 1;
      const expected = i === 0 ? 'first' : i === last ? 'last' : 'inner';
      if (s.kind !== expected) {
        ctx.addIssue({
          code: 'custom',
          path: ['spreads', i, 'kind'],
          message: `spreads[${i}].kind must be "${expected}"`,
        });
      }
    });
  });
