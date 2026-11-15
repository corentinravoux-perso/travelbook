import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { DEFAULT_JPEG_QUALITY } from './images';

/** Source paths of photos and files named by the renderer: absolute, and a sane number of them. */
export const absolutePath = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => !path.includes('\0') && isAbsolute(path), 'must be an absolute path');

/** The options of an export, as the renderer sends them and as presets store them. */
export const exportOptions = z.strictObject({
  route: z.enum(['pdf', 'images']),
  pages: z.union([
    z.literal('all'),
    z
      .strictObject({
        from: z.number().int().min(1).max(10_000),
        to: z.number().int().min(1).max(10_000),
      })
      .refine((range) => range.from <= range.to, 'from must not exceed to'),
  ]),
  includeCover: z.boolean(),
  dpi: z.number().int().min(72).max(1200),
  nativeResolution: z.boolean(),
  bleed: z.boolean(),
  cropMarks: z.boolean(),
  imageFormat: z.enum(['jpeg', 'png']),
  jpegQuality: z.number().int().min(1).max(100).default(DEFAULT_JPEG_QUALITY),
  perSpread: z.boolean(),
  coverMode: z.enum(['flat', 'panels']),
  outDir: absolutePath,
});
