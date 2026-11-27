import { z } from 'zod';
import { isAllowedLicence, requiresAttribution } from './licences';
import {
  SourceError,
  checkDownload,
  type SourceHttp,
  type StickerHit,
  type StickerSource,
} from './source';

const API = 'https://api.iconify.design';
/** One page is 48 icons. */
export const ICONIFY_PAGE_SIZE = 48;
/** Iconify's search finds at most this many icons (its `limit` goes from 32 to 999). */
export const ICONIFY_MAX_LIMIT = 999;

const AnswerSchema = z.object({
  icons: z.array(z.string()),
  limit: z.number(),
  /** How many icons the search found, at most `limit`. */
  total: z.number().optional(),
  collections: z
    .record(
      z.string(),
      z.object({
        name: z.string(),
        author: z.object({ name: z.string(), url: z.string().optional() }),
        license: z.object({
          title: z.string(),
          spdx: z.string().optional(),
          url: z.string().optional(),
        }),
        palette: z.boolean().optional(),
      }),
    )
    .default({}),
});

const ICON_ID = /^([a-z0-9][a-z0-9-]*):([a-z0-9][a-z0-9-]*)$/;
const humanise = (name: string): string => {
  const text = name.replace(/-+/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Iconify: `GET /search?query=&limit=&start=` answers `icons` as `prefix:name` and, for the sets it
 * found, a `collections` block with each set's author and licence, so no second request is
 * needed. The SVG of an icon is `/<prefix>/<name>.svg`. No key, no documented rate limit (the
 * docs ask clients to avoid needless searches: we cache every answer for 7 days). Icons of a set
 * whose licence is not MIT, Apache-2.0, CC0, CC-BY or CC-BY-SA are left out.
 */
export function createIconifySource(http: SourceHttp): StickerSource {
  return {
    id: 'iconify',
    label: 'Iconify',
    needsKey: false,
    async search(q, page) {
      // `limit` is how many icons the whole search finds, and `start` where the answer begins
      // among them: page n asks for the first 48 n icons, from the 48 (n − 1)th. A `start` that
      // is not below `limit` is refused (400).
      const start = Math.max(0, page - 1) * ICONIFY_PAGE_SIZE;
      if (start >= ICONIFY_MAX_LIMIT) return { items: [], hasMore: false };
      const limit = Math.min(start + ICONIFY_PAGE_SIZE, ICONIFY_MAX_LIMIT);
      const url = `${API}/search?query=${encodeURIComponent(q)}&limit=${limit}&start=${start}`;
      const answer = await http.json(url, AnswerSchema);
      const items: StickerHit[] = [];
      for (const icon of answer.icons) {
        const match = ICON_ID.exec(icon);
        const set = match === null ? undefined : answer.collections[match[1] as string];
        if (match === null || set === undefined || !isAllowedLicence(set.license.spdx)) continue;
        const [, prefix, name] = match as unknown as [string, string, string];
        const spdx = set.license.spdx as string;
        const file = `${API}/${prefix}/${name}.svg`;
        items.push({
          source: 'iconify',
          id: icon,
          title: humanise(name),
          thumbUrl: file,
          fileUrl: file,
          format: 'svg',
          licence: {
            source: `Iconify: ${set.name}`,
            author: set.author.name,
            licence: spdx,
            url: set.author.url ?? set.license.url ?? 'https://iconify.design',
            requiresAttribution: requiresAttribution(spdx),
          },
          mono: set.palette === false,
        });
      }
      // The search stopped at its limit (which Iconify may round): there may be more. It reports
      // a smaller total when it found everything.
      const found = answer.total ?? start + answer.icons.length;
      return {
        items,
        hasMore:
          answer.icons.length > 0 && found >= answer.limit && answer.limit < ICONIFY_MAX_LIMIT,
      };
    },
    async fetch(hit) {
      const match = ICON_ID.exec(hit.id);
      if (match === null) throw new SourceError('badAnswer', 'Not an Iconify icon');
      // Rebuilt from the id: the URL in a hit is not trusted.
      const bytes = await http.bytes(`${API}/${match[1]}/${match[2]}.svg`);
      return checkDownload(bytes, 'svg');
    },
  };
}
