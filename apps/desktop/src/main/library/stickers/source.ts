import type { Licence } from '@travelbook/core';

/** One sticker found by a search, offline or online. */
export interface StickerHit {
  /** Where it comes from: an offline set id (`noto`) or an online source id (`openverse`). */
  source: string;
  /** Unique inside `source`. */
  id: string;
  title: string;
  /** URL the renderer can show in an `<img>` (`tb://sticker/...` offline, a cached copy online). */
  thumbUrl: string;
  /** URL of the full file. */
  fileUrl: string;
  format: 'svg' | 'png' | 'webp';
  licence: Licence;
  /** A monochrome pictogram that draws in `currentColor` and can be recoloured. */
  mono: boolean;
}
