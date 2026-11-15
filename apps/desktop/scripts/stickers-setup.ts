/**
 * Vitest global setup: build the offline sticker packs once, before any test worker starts.
 * Several test files read the built packs and call `buildStickerPacks()` themselves; when the
 * inputs have changed (a new poster illustration, say), parallel workers would each rebuild and
 * delete one another's files. Built here first, their own calls find the packs up to date.
 */
import { buildStickerPacks } from './build-sticker-packs.ts';

export async function setup(): Promise<void> {
  await buildStickerPacks({ log: () => undefined });
}
