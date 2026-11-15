import { z } from 'zod';
import { requiresAttribution } from './licences';
import {
  SourceError,
  assertPublicHttps,
  checkDownload,
  type SourceHttp,
  type StickerHit,
  type StickerSource,
} from './source';

const API = 'https://api.openverse.org/v1/images/';
/** Openverse's anonymous maximum. */
export const OPENVERSE_PAGE_SIZE = 20;

const AnswerSchema = z.object({
  page_count: z.number(),
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullish(),
      url: z.string(),
      thumbnail: z.string().nullish(),
      creator: z.string().nullish(),
      license: z.string(),
      license_version: z.string().nullish(),
      foreign_landing_url: z.string().nullish(),
      provider: z.string().nullish(),
      filetype: z.string().nullish(),
    }),
  ),
});

/** Openverse's `by`, `by-sa`, `cc0`, `pdm` as an SPDX-style id; undefined for anything else. */
function licenceId(license: string, version: string | null | undefined): string | undefined {
  const l = license.toLowerCase();
  if (l === 'cc0') return 'CC0-1.0';
  if (l === 'pdm') return 'PDM-1.0';
  if ((l === 'by' || l === 'by-sa') && version) return `CC-${l.toUpperCase()}-${version}`;
  return undefined;
}

/**
 * Openverse: `GET /v1/images/?q=&extension=png&license=cc0,pdm,by,by-sa&page=&page_size=` answers
 * `results` (with `url`, `thumbnail`, `creator`, `license`, `license_version`,
 * `foreign_landing_url`) and `page_count`. No key. Anonymous clients are limited to 20 requests
 * a minute and 200 a day (response headers `x-ratelimit-*`; HTTP 429 beyond that), which is why
 * every answer is cached for 7 days and a 429 is reported as `rateLimited`. Only PNG files are
 * asked for: they carry the transparency a sticker needs.
 */
export function createOpenverseSource(http: SourceHttp): StickerSource {
  return createOpenverse(http, 'stickers');
}

/**
 * The same Openverse as a source of background images, without the PNG filter: photographs
 * (JPEG, PNG, WebP) are what a page background usually is. Its id is `openverse-photos`.
 */
export function createOpenversePhotosSource(http: SourceHttp): StickerSource {
  return createOpenverse(http, 'backgrounds');
}

const PHOTO_TYPES = new Set(['jpg', 'jpeg', 'png', 'webp']);

function createOpenverse(http: SourceHttp, mode: 'stickers' | 'backgrounds'): StickerSource {
  const stickers = mode === 'stickers';
  return {
    id: stickers ? 'openverse' : 'openverse-photos',
    label: 'Openverse',
    needsKey: false,
    ...(stickers ? {} : { scope: 'backgrounds' as const }),
    async search(q, page) {
      const url =
        `${API}?q=${encodeURIComponent(q)}${stickers ? '&extension=png' : ''}&license=cc0,pdm,by,by-sa` +
        `&page=${Math.max(1, page)}&page_size=${OPENVERSE_PAGE_SIZE}`;
      const answer = await http.json(url, AnswerSchema);
      const items: StickerHit[] = [];
      for (const r of answer.results) {
        const spdx = licenceId(r.license, r.license_version);
        if (spdx === undefined || !/^https:\/\//.test(r.url)) continue;
        const type = (r.filetype ?? '').toLowerCase();
        if (!stickers && !PHOTO_TYPES.has(type)) continue;
        items.push({
          source: stickers ? 'openverse' : 'openverse-photos',
          id: r.id,
          title: r.title?.trim() || 'Sans titre',
          thumbUrl: r.thumbnail ?? r.url,
          fileUrl: r.url,
          format: stickers ? 'png' : type === 'png' ? 'png' : type === 'webp' ? 'webp' : 'jpg',
          licence: {
            source: r.provider ? `Openverse (${r.provider})` : 'Openverse',
            author: r.creator?.trim() || 'Unknown',
            licence: spdx,
            url: r.foreign_landing_url ?? r.url,
            requiresAttribution: requiresAttribution(spdx),
          },
          mono: false,
        });
      }
      return { items, hasMore: page < answer.page_count };
    },
    async fetch(hit) {
      if (stickers ? hit.format !== 'png' : hit.format === 'svg') {
        throw new SourceError('badAnswer', 'Not an Openverse image');
      }
      const bytes = await http.bytes(assertPublicHttps(hit.fileUrl).href);
      return checkDownload(bytes, hit.format);
    },
  };
}
