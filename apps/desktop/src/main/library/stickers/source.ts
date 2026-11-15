import sharp from 'sharp';
import type { z } from 'zod';
import type { SourceErrorKind, StickerHit } from '../../../shared/api';
import { DiskCache } from './cache';
import { sanitizeSvg } from './sanitizeSvg';

export type { StickerHit };

export interface StickerSource {
  id: 'iconify' | 'openverse' | 'commons' | string;
  /** Name shown to the user. */
  label: string;
  /** Whether the source needs an account or key. None of ours does. */
  needsKey: boolean;
  /** `backgrounds`: offered by the backgrounds panel, with kept files stored as backgrounds; absent: stickers. */
  scope?: 'backgrounds';
  search(q: string, page: number): Promise<{ items: StickerHit[]; hasMore: boolean }>;
  /** The file of a hit: an SVG already sanitised, or a raster already checked. */
  fetch(hit: StickerHit): Promise<{ bytes: Buffer; ext: 'svg' | 'png' | 'webp' | 'jpg' }>;
}

/**
 * Why a call to an online source failed. `offline`: no answer (network error, timeout);
 * `rateLimited`: HTTP 429; `badAnswer`: an answer that is not what the source documents (HTML
 * instead of JSON, JSON of another shape, a file that is not the image it should be, another
 * HTTP error); `tooLarge`: a download over the 20 MB cap; `notFound`: HTTP 404 on a download.
 * The renderer maps the code to a French message.
 */
export type { SourceErrorKind };

export class SourceError extends Error {
  constructor(
    readonly kind: SourceErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SourceError';
  }
}

export const REQUEST_TIMEOUT_MS = 10_000;
/**
 * A 429 whose Retry-After is at most this many seconds is waited out and asked again, up to
 * `MAX_RETRIES` times: Wikimedia's front caches throttle a burst of thumbnails with
 * "Retry-After: 1". A longer one (Openverse's daily quota) fails at once.
 */
export const MAX_RETRY_AFTER_S = 5;
const MAX_RETRIES = 3;

/** The seconds of a Retry-After given in seconds; undefined when absent or given as a date. */
function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  return value !== null && /^\d+$/.test(value.trim()) ? Number(value) : undefined;
}

export const MAX_IN_FLIGHT = 2;
/** Largest download kept, in bytes. */
export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

/** `travelbook/<version> (personal desktop app)`: never an email address or a name. */
export const userAgent = (version: string): string =>
  `travelbook/${version} (personal desktop app)`;

export interface HttpOptions {
  /** Where the source's answers are cached; none means no cache. */
  cache?: DiskCache;
  userAgent: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxInFlight?: number;
}

/**
 * The HTTP side of one source: at most `maxInFlight` (2) requests at a time, a timeout on each,
 * a typed `SourceError` for every failure, the app's User-Agent, and answers cached on disk. The
 * renderer never calls the network; every request of the app goes through one of these.
 */
export class SourceHttp {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async slot<T>(task: () => Promise<T>): Promise<T> {
    const limit = this.options.maxInFlight ?? MAX_IN_FLIGHT;
    if (this.active >= limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }

  /** GET `url` and read the body with `read` before the timeout; every failure is a SourceError. */
  private request<T>(
    url: string,
    accept: string,
    read: (response: Response) => Promise<T>,
  ): Promise<T> {
    return this.slot(async () => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        this.options.timeoutMs ?? REQUEST_TIMEOUT_MS,
      );
      try {
        let response: Response;
        for (let attempt = 0; ; attempt++) {
          try {
            response = await this.fetchImpl(url, {
              signal: controller.signal,
              redirect: 'follow',
              headers: { 'User-Agent': this.options.userAgent, Accept: accept },
            });
          } catch (error) {
            throw new SourceError('offline', `No answer from ${new URL(url).host}`, {
              cause: error,
            });
          }
          const wait = response.status === 429 ? retryAfterSeconds(response) : undefined;
          if (wait === undefined || wait > MAX_RETRY_AFTER_S || attempt >= MAX_RETRIES) break;
          await response.body?.cancel();
          await new Promise((resolve) => setTimeout(resolve, wait * 1000));
        }
        if (response.status === 429) {
          throw new SourceError('rateLimited', `${new URL(url).host} is rate limiting us`);
        }
        if (response.status === 404) {
          throw new SourceError('notFound', `${new URL(url).host} has no such file`);
        }
        if (!response.ok) {
          throw new SourceError('badAnswer', `${new URL(url).host} answered ${response.status}`);
        }
        try {
          return await read(response);
        } catch (error) {
          if (error instanceof SourceError) throw error;
          // The connection dropped or timed out while the body was read.
          throw new SourceError('offline', `The answer of ${new URL(url).host} was cut`, {
            cause: error,
          });
        }
      } finally {
        clearTimeout(timer);
      }
    });
  }

  /**
   * GET a JSON answer and check it against `schema`. A cached answer that is still valid is used
   * without any request. A new answer is cached only once it parsed and passed the schema: an
   * error, an HTML page or a JSON of the wrong shape is never stored.
   */
  async json<S extends z.ZodType>(url: string, schema: S): Promise<z.infer<S>> {
    const cached = await this.options.cache?.get(url);
    if (cached !== undefined) {
      const parsed = parseWith(schema, cached);
      if (parsed.success) return parsed.data;
    }
    const text = await this.request(url, 'application/json', (response) => response.text());
    const parsed = parseWith(schema, text);
    if (!parsed.success) {
      throw new SourceError('badAnswer', `Unexpected answer from ${new URL(url).host}`);
    }
    await this.options.cache?.set(url, text).catch(() => undefined);
    return parsed.data;
  }

  /** GET a file, at most `maxBytes` of it. */
  bytes(url: string, maxBytes = MAX_DOWNLOAD_BYTES): Promise<Buffer> {
    return this.request(url, '*/*', async (response) => {
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) {
        void response.body?.cancel();
        throw new SourceError('tooLarge', 'The file is over the size limit');
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = response.body?.getReader();
      if (reader === undefined) return Buffer.alloc(0);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new SourceError('tooLarge', 'The file is over the size limit');
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    });
  }
}

function parseWith<S extends z.ZodType>(
  schema: S,
  text: string,
): { success: true; data: z.infer<S> } | { success: false } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { success: false };
  }
  const result = schema.safeParse(json);
  return result.success ? { success: true, data: result.data } : { success: false };
}

/** An https URL to a public host: no other scheme, no `localhost`, no IP address. */
export function assertPublicHttps(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SourceError('badAnswer', 'Not a URL');
  }
  const host = parsed.hostname;
  if (
    parsed.protocol !== 'https:' ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.includes(':') ||
    /^\d+(\.\d+){3}$/.test(host) ||
    !host.includes('.')
  ) {
    throw new SourceError('badAnswer', `Refusing to download from ${parsed.protocol}//${host}`);
  }
  return parsed;
}

/** Whether a raster has any pixel that is not fully opaque (alpha below 255). */
export async function hasTransparency(bytes: Buffer): Promise<boolean> {
  const meta = await sharp(bytes).metadata();
  if (!meta.hasAlpha) return false;
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = info.channels - 1; i < data.length; i += info.channels) {
    if ((data[i] as number) < 255) return true;
  }
  return false;
}

/**
 * Check a downloaded file before it is stored: an SVG is sanitised (and must be an SVG), a
 * raster must decode completely and be a PNG or WebP. The extension comes from what the file
 * really is, not from what the source claimed.
 */
export async function checkDownload(
  bytes: Buffer,
  format: StickerHit['format'],
): Promise<{ bytes: Buffer; ext: 'svg' | 'png' | 'webp' | 'jpg' }> {
  if (format === 'svg') {
    try {
      return { bytes: Buffer.from(sanitizeSvg(bytes.toString('utf8')), 'utf8'), ext: 'svg' };
    } catch (error) {
      throw new SourceError('badAnswer', 'The file is not a usable SVG', { cause: error });
    }
  }
  try {
    const meta = await sharp(bytes).metadata();
    const jpeg = format === 'jpg' && meta.format === 'jpeg';
    if (meta.format !== 'png' && meta.format !== 'webp' && !jpeg) {
      throw new Error(`Unexpected image format: ${meta.format ?? 'unknown'}`);
    }
    await sharp(bytes).resize({ width: 64, height: 64, fit: 'inside' }).toBuffer();
    return { bytes, ext: jpeg ? 'jpg' : (meta.format as 'png' | 'webp') };
  } catch (error) {
    throw new SourceError('badAnswer', 'The file is not a usable image', { cause: error });
  }
}
