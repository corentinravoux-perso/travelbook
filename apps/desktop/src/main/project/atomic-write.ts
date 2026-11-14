import { open, rename, rm } from 'node:fs/promises';

const queues = new Map<string, Promise<void>>();

/** Run `task` after every task already queued under `key` has settled. */
export function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.then(task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return run;
}

/**
 * Replace `path` with `data` so that a crash or a failure at any point leaves either the old
 * content or the new one, never a mix: write `<path>.tmp`, fsync it, close it, rename it over
 * `path`. Writes to the same path are serialised so they cannot share the temporary file.
 */
export function writeFileAtomic(path: string, data: string): Promise<void> {
  return serialize(`write:${path}`, async () => {
    const tmp = `${path}.tmp`;
    try {
      const handle = await open(tmp, 'w');
      try {
        await handle.writeFile(data, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(tmp, path);
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => undefined);
      throw error;
    }
  });
}
