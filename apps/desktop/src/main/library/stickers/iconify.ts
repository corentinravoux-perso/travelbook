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
/** Iconify's search takes a limit of 32 to 999; one page is 48 icons. */
export const ICONIFY_PAGE_SIZE = 48;

const AnswerSchema = z.object({
  icons: z.array(z.string()),
  limit: z.number(),
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
      const start = Math.max(0, page - 1) * ICONIFY_PAGE_SIZE;
      const url = `${API}/search?query=${encodeURIComponent(q)}&limit=${ICONIFY_PAGE_SIZE}&start=${start}`;
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
      return { items, hasMore: answer.icons.length >= answer.limit };
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
