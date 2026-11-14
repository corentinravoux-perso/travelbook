import { describe, expect, it } from 'vitest';
import { createLimiter } from './limit';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe('createLimiter', () => {
  it('never runs more than `max` tasks at once and runs every task', async () => {
    const limit = createLimiter(3);
    let running = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        limit(async () => {
          running++;
          peak = Math.max(peak, running);
          await tick();
          running--;
          return i;
        }),
      ),
    );
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(peak).toBe(3);
  });

  it('starts queued tasks in submission order', async () => {
    const limit = createLimiter(1);
    const started: number[] = [];
    await Promise.all(
      [0, 1, 2, 3].map((i) =>
        limit(async () => {
          started.push(i);
          await tick();
        }),
      ),
    );
    expect(started).toEqual([0, 1, 2, 3]);
  });

  it('passes a rejection to its caller and keeps serving the queue', async () => {
    const limit = createLimiter(1);
    const failing = limit(async () => {
      throw new Error('boom');
    });
    const next = limit(async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });

  it('handles a task that throws synchronously', async () => {
    const limit = createLimiter(2);
    await expect(
      limit(() => {
        throw new Error('sync');
      }),
    ).rejects.toThrow('sync');
    await expect(limit(async () => 1)).resolves.toBe(1);
  });

  it('rejects a limit below one', () => {
    expect(() => createLimiter(0)).toThrow(RangeError);
    expect(() => createLimiter(1.5)).toThrow(RangeError);
  });
});
