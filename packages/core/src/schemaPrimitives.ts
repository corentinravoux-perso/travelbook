import { z } from 'zod';

/**
 * The zod building blocks shared by the element schemas. They live apart from `schema.ts` so a
 * schema file of its own (the map's) can use them without importing `schema.ts` back.
 */
export const mm = z.number().finite();
export const nonNegMm = mm.min(0);
export const unit = z.number().min(0).max(1);
export const color = z.string();
export const id = z.string().min(1);

/** The fields every element has. */
export const elementBase = {
  id,
  x: mm,
  y: mm,
  w: nonNegMm,
  h: nonNegMm,
  rotation: z.number().finite(),
  opacity: unit,
  locked: z.boolean(),
  hidden: z.boolean(),
  name: z.string().optional(),
  groupId: z.string().optional(),
};
