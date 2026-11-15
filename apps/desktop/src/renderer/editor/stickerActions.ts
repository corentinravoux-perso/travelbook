import {
  addElement,
  newElement,
  pageBox,
  spreadSize,
  type AssetRef,
  type Book,
  type Rect,
  type Spread,
  type StickerElement,
} from '@travelbook/core';
import { sourceErrorKind } from '../../shared/api';
import { STICKER_WIDTH_MM, svgRatio, type StickerRef } from '../panels/stickers/model';
import { editorStore, findSpread } from '../store/editor';
import { fr } from '../strings/fr';
import { withAssets } from './photoImport';
import { round3, type Pt } from './transform';

/** The page a sticker clicked in the panel is put on: the right one, else the left, else the spread. */
function targetPage(book: Book, spread: Spread): Rect {
  return (
    pageBox(book, spread, 'right') ??
    pageBox(book, spread, 'left') ?? { x: 0, y: 0, ...spreadSize(book, spread) }
  );
}

/**
 * Where a new sticker goes: `STICKER_WIDTH_MM` wide at its natural ratio (smaller if it would
 * not fit the page), centred on `at` or on the target page, and kept inside the spread.
 */
export function stickerRect(book: Book, spread: Spread, ratio: number, at?: Pt): Rect {
  const page = targetPage(book, spread);
  const size = spreadSize(book, spread);
  let w = STICKER_WIDTH_MM;
  let h = w / ratio;
  const maxH = page.h * 0.9;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  w = Math.min(w, size.w);
  h = Math.min(h, size.h);
  const centre = at ?? { x: page.x + page.w / 2, y: page.y + page.h / 2 };
  return {
    x: round3(Math.min(Math.max(centre.x - w / 2, 0), size.w - w)),
    y: round3(Math.min(Math.max(centre.y - h / 2, 0), size.h - h)),
    w: round3(w),
    h: round3(h),
  };
}

/** The sticker element for `asset` in `rect`. */
export function stickerElement(asset: AssetRef, rect: Rect): StickerElement {
  return { ...newElement('sticker', rect), assetId: asset.id };
}

/** Width over height of an asset: its pixel size, else what an SVG states, else square. */
export async function naturalRatio(
  asset: AssetRef,
  readText: (url: string) => Promise<string> = async (url) => (await fetch(url)).text(),
): Promise<number> {
  if (asset.pixel) return asset.pixel.w / asset.pixel.h;
  if (/\.svg$/i.test(asset.file)) {
    try {
      return svgRatio(await readText(`tb://asset/${asset.id}?v=original`)) ?? 1;
    } catch {
      return 1;
    }
  }
  return 1;
}

/**
 * Put a sticker on the current spread. A found sticker is first kept in the user library, then
 * copied into the album; the asset record and the element are added in ONE `store.apply`, so one
 * undo removes both. Resolves to the new element's id, or `undefined` when nothing was placed
 * (the failure is shown over the canvas).
 */
export async function placeSticker(ref: StickerRef, at?: Pt): Promise<string | undefined> {
  const store = editorStore.getState();
  const spreadId = store.currentSpreadId;
  if (store.book === null || spreadId === null) return undefined;
  try {
    const itemId =
      ref.kind === 'item'
        ? ref.itemId
        : (await window.tb.library.stickers.add({ source: ref.source, id: ref.id })).id;
    const asset = await window.tb.assets.fromLibrary(itemId);
    const ratio = await naturalRatio(asset);
    const now = editorStore.getState();
    // The user may have moved to another spread while the sticker was being fetched.
    const where = findSpread(now.book, spreadId);
    if (now.book === null || where === undefined) return undefined;
    const el = stickerElement(asset, stickerRect(now.book, where, ratio, at));
    now.apply((b) => addElement(withAssets(b, [asset]), spreadId, el), fr.stickers.undoPlace);
    if (editorStore.getState().currentSpreadId === spreadId) editorStore.getState().select([el.id]);
    return el.id;
  } catch (error) {
    console.error('Placing a sticker failed', error);
    // A failed online source says why (no connection, too many searches...).
    const kind = sourceErrorKind(error);
    editorStore
      .getState()
      .notify(kind === null ? fr.stickers.placeFailed : fr.stickers.error[kind]);
    return undefined;
  }
}
