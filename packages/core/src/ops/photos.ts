import { produce } from 'immer';
import { defaultCrop } from '../factory';
import type { Background, Book, Crop, Element } from '../schema';
import { OpError } from './errors';
import { photoOf, spreadOf } from './util';

/** Put a photo in a frame (replacing any other); the crop goes back to the default. */
export function fillSlot(book: Book, spreadId: string, elementId: string, assetId: string): Book {
  return produce(book, (draft) => {
    const el = photoOf(spreadOf(draft, spreadId), elementId);
    el.assetId = assetId;
    el.crop = defaultCrop();
  });
}

export interface PhotoRef {
  spreadId: string;
  elementId: string;
}

/** Exchange the assets of two photo frames, in one spread or two; both crops are reset. */
export function swapPhotos(book: Book, a: PhotoRef, b: PhotoRef): Book {
  return produce(book, (draft) => {
    const first = photoOf(spreadOf(draft, a.spreadId), a.elementId);
    const second = photoOf(spreadOf(draft, b.spreadId), b.elementId);
    const firstAsset = first.assetId;
    first.assetId = second.assetId;
    second.assetId = firstAsset;
    first.crop = defaultCrop();
    second.crop = defaultCrop();
  });
}

/** Pan and zoom a photo inside its frame. `scale` >= 1, `cx` and `cy` in 0..1. */
export function setCrop(book: Book, spreadId: string, elementId: string, crop: Crop): Book {
  const { scale, cx, cy } = crop;
  const ok =
    Number.isFinite(scale) &&
    scale >= 1 &&
    Number.isFinite(cx) &&
    cx >= 0 &&
    cx <= 1 &&
    Number.isFinite(cy) &&
    cy >= 0 &&
    cy <= 1;
  if (!ok) throw new OpError('A crop needs scale >= 1 and cx, cy within 0..1.');
  return produce(book, (draft) => {
    photoOf(spreadOf(draft, spreadId), elementId).crop = { scale, cx, cy };
  });
}

function backgroundAssets(bg: Background | undefined): string[] {
  return bg && (bg.kind === 'image' || bg.kind === 'pattern') ? [bg.assetId] : [];
}

function elementAsset(el: Element): string | null {
  return el.type === 'photo' || el.type === 'sticker' ? el.assetId : null;
}

/**
 * Placements per asset id: photo and sticker elements, and image and pattern backgrounds, on
 * the cover and on every spread. An asset with no placement is absent from the record.
 */
export function assetUsage(book: Book): Record<string, number> {
  const usage: Record<string, number> = {};
  const count = (assetId: string | null): void => {
    if (assetId) usage[assetId] = (usage[assetId] ?? 0) + 1;
  };
  for (const spread of [book.cover, ...book.spreads]) {
    for (const el of spread.elements) count(elementAsset(el));
    const { left, right, spread: across } = spread.background;
    for (const bg of [left, right, across]) backgroundAssets(bg).forEach(count);
  }
  return usage;
}

/** Ids of the book's assets that are not placed anywhere. Fonts are never placed, so never listed. */
export function unusedAssets(book: Book): string[] {
  const usage = assetUsage(book);
  return Object.values(book.assets)
    .filter((a) => a.kind !== 'font' && !usage[a.id])
    .map((a) => a.id);
}

/**
 * Take photos out of the album: their assets leave `book.assets`, and every frame that showed
 * one of them, on the cover or on a spread, becomes an empty frame (its crop back to the
 * default; its mask, border and look kept). Only photo assets are removed; other ids, and
 * unknown ones, are ignored. The files stay in the album folder, so an undo shows them again.
 */
export function removePhotos(book: Book, assetIds: readonly string[]): Book {
  const gone = new Set(assetIds.filter((id) => book.assets[id]?.kind === 'photo'));
  if (gone.size === 0) return book;
  return produce(book, (draft) => {
    for (const id of gone) delete draft.assets[id];
    for (const spread of [draft.cover, ...draft.spreads]) {
      for (const el of spread.elements) {
        if (el.type === 'photo' && el.assetId !== null && gone.has(el.assetId)) {
          el.assetId = null;
          el.crop = defaultCrop();
        }
      }
    }
  });
}
