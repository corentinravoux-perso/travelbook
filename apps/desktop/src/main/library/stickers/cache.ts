import { createHash } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomic } from '../../project/atomic-write';

/** How long an answer is kept: 7 days. */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A small on-disk cache of answers from one online source: `<dir>/<sha256 of key>.json`, holding
 * the answer text and when it was stored. Entries older than the time to live are ignored (and
 * removed); a file that cannot be read back is a miss. The cache never decides what is worth
 * keeping: callers store an answer only after they have checked it.
 */
export class DiskCache {
  constructor(
    private readonly dir: string,
    private readonly options: { ttlMs?: number; now?: () => number } = {},
  ) {}

  private file(key: string): string {
    return join(this.dir, `${createHash('sha256').update(key).digest('hex')}.json`);
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  async get(key: string): Promise<string | undefined> {
    const file = this.file(key);
    try {
      const entry: unknown = JSON.parse(await readFile(file, 'utf8'));
      if (
        typeof entry === 'object' &&
        entry !== null &&
        'storedAt' in entry &&
        typeof entry.storedAt === 'number' &&
        'body' in entry &&
        typeof entry.body === 'string'
      ) {
        if (this.now() - entry.storedAt < (this.options.ttlMs ?? CACHE_TTL_MS)) return entry.body;
        await rm(file, { force: true });
      }
    } catch {
      // Missing or damaged: a miss.
    }
    return undefined;
  }

  async set(key: string, body: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFileAtomic(this.file(key), JSON.stringify({ storedAt: this.now(), body }));
  }
}
