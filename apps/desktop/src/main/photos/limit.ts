export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * A FIFO queue that runs at most `max` tasks at a time. A task that rejects (or throws) only
 * rejects the promise of its own caller; the queue keeps going.
 */
export function createLimiter(max: number): Limiter {
  if (!Number.isInteger(max) || max < 1) {
    throw new RangeError(`Concurrency limit must be a positive integer, got ${max}`);
  }
  let running = 0;
  const waiting: (() => void)[] = [];

  /** Hand the slot to the next waiting task, or free it. */
  const release = (): void => {
    const next = waiting.shift();
    if (next) next();
    else running--;
  };

  return async (task) => {
    if (running >= max) {
      // `release` hands the slot over without freeing it, so `running` already counts this task.
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else {
      running++;
    }
    try {
      return await task();
    } finally {
      release();
    }
  };
}
