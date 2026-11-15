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

const API = 'https://commons.wikimedia.org/w/api.php';
export const COMMONS_PAGE_SIZE = 20;
const FILE_HOST = 'upload.wikimedia.org';

const Meta = z.object({ value: z.union([z.string(), z.number()]).optional() });
const AnswerSchema = z
  .object({
    batchcomplete: z.boolean().optional(),
    query: z
      .object({
        pages: z.array(
          z.object({
            title: z.string(),
            index: z.number().optional(),
            imageinfo: z
              .array(
                z.object({
                  url: z.string(),
                  thumburl: z.string().optional(),
                  descriptionurl: z.string().optional(),
                  mime: z.string(),
                  extmetadata: z.record(z.string(), Meta).optional(),
                }),
              )
              .optional(),
          }),
        ),
      })
      .optional(),
    continue: z.record(z.string(), z.unknown()).optional(),
  })
  // An answer with neither pages nor `batchcomplete` is not a search answer (an error object).
  .refine((a) => a.query !== undefined || a.batchcomplete === true);

const FORMATS: Record<string, StickerHit['format']> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** `LicenseShortName` of Commons as an SPDX-style id; undefined for a licence we do not take. */
function licenceId(short: string): string | undefined {
  const text = short.trim();
  if (/^CC0/i.test(text)) return 'CC0-1.0';
  if (/^(public domain|pd\b)/i.test(text)) return 'PD';
  const sa = /^CC[ -]BY[ -]SA[ -](\d\.\d)/i.exec(text);
  if (sa) return `CC-BY-SA-${sa[1]}`;
  const by = /^CC[ -]BY[ -](\d\.\d)/i.exec(text);
  return by ? `CC-BY-${by[1]}` : undefined;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
/** The text of a Commons metadata value, which is a snippet of HTML (`<a href=...>Name</a>`). */
const plainText = (html: string): string =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (_m, e: string) => ENTITIES[e] as string)
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Wikimedia Commons: the MediaWiki API with `generator=search`, `gsrnamespace=6` (files),
 * `gsrsearch=filetype:drawing <q>` and `prop=imageinfo` (`iiprop=url|extmetadata|mime|size`).
 * No key. The API etiquette asks for a descriptive User-Agent (ours), serial requests (ours are
 * capped at 2 in flight) and caching (7 days); an HTTP 429 is `rateLimited`. Paging is by
 * `gsroffset`; the answer has a `continue` block while there are more results. Files under a
 * licence other than CC0, public domain, CC-BY or CC-BY-SA are left out.
 */
export function createCommonsSource(http: SourceHttp): StickerSource {
  return {
    id: 'commons',
    label: 'Wikimedia Commons',
    needsKey: false,
    async search(q, page) {
      const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        formatversion: '2',
        generator: 'search',
        gsrnamespace: '6',
        gsrsearch: `filetype:drawing ${q}`,
        gsrlimit: String(COMMONS_PAGE_SIZE),
        gsroffset: String(Math.max(0, page - 1) * COMMONS_PAGE_SIZE),
        prop: 'imageinfo',
        iiprop: 'url|extmetadata|mime|size',
        iiurlwidth: '256',
      });
      const answer = await http.json(`${API}?${params.toString()}`, AnswerSchema);
      const pages = [...(answer.query?.pages ?? [])].sort(
        (a, b) => (a.index ?? 0) - (b.index ?? 0),
      );
      const items: StickerHit[] = [];
      for (const p of pages) {
        const info = p.imageinfo?.[0];
        const format = info === undefined ? undefined : FORMATS[info.mime];
        const meta = info?.extmetadata ?? {};
        const spdx = licenceId(String(meta['LicenseShortName']?.value ?? ''));
        if (info === undefined || format === undefined || spdx === undefined) continue;
        if (!/^https:\/\//.test(info.url)) continue;
        items.push({
          source: 'commons',
          id: p.title,
          title: plainText(String(meta['ObjectName']?.value ?? p.title.replace(/^File:/, ''))),
          thumbUrl: info.thumburl ?? info.url,
          fileUrl: info.url,
          format,
          licence: {
            source: 'Wikimedia Commons',
            author: plainText(String(meta['Artist']?.value ?? '')) || 'Unknown',
            licence: spdx,
            url:
              info.descriptionurl ??
              `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
            requiresAttribution: requiresAttribution(spdx),
          },
          mono: false,
        });
      }
      return { items, hasMore: answer.continue !== undefined };
    },
    async fetch(hit) {
      const url = assertPublicHttps(hit.fileUrl);
      if (url.hostname !== FILE_HOST) {
        throw new SourceError('badAnswer', 'Not a Wikimedia Commons file');
      }
      return checkDownload(await http.bytes(url.href), hit.format);
    },
  };
}
