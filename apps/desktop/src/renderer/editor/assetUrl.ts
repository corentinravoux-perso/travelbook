import type { AssetUrl } from '@travelbook/render';

/** Image files of the open project through `tb://asset`; `export` quality means the original. */
export const assetUrl: AssetUrl = (id, quality) =>
  `tb://asset/${id}?v=${quality === 'export' ? 'original' : quality}`;
