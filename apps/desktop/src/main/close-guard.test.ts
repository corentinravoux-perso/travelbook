import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFlushBroker,
  runCloseHandshake,
  type CloseChoice,
  type FlushOutcome,
} from './close-guard';

describe('flush broker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('settles a request with the renderer answer', async () => {
    const sent: number[] = [];
    const broker = createFlushBroker({ send: (id) => sent.push(id), timeoutMs: 5000 });
    const ok = broker.request();
    const failed = broker.request();
    expect(sent).toHaveLength(2);
    broker.reply(sent[1]!, false);
    broker.reply(sent[0]!, true);
    expect(await ok).toEqual({ ok: true });
    expect(await failed).toEqual({ ok: false, reason: 'failed' });
  });

  it('times out when the renderer never answers, and ignores a late answer', async () => {
    const sent: number[] = [];
    const broker = createFlushBroker({ send: (id) => sent.push(id), timeoutMs: 5000 });
    const result = broker.request();
    await vi.advanceTimersByTimeAsync(4999);
    let settled = false;
    void result.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ ok: false, reason: 'timeout' });
    broker.reply(sent[0]!, true); // late: no effect, no throw
    broker.reply(999, true); // unknown id
  });
});

describe('close handshake', () => {
  const run = (outcomes: FlushOutcome[], choices: CloseChoice[]) => {
    const requestFlush = vi.fn(() => Promise.resolve(outcomes.shift()!));
    const askUser = vi.fn(() => Promise.resolve(choices.shift()!));
    return { requestFlush, askUser, result: runCloseHandshake({ requestFlush, askUser }) };
  };

  it('lets the window close once the renderer has saved, without asking', async () => {
    const { result, askUser } = run([{ ok: true }], []);
    expect(await result).toBe(true);
    expect(askUser).not.toHaveBeenCalled();
  });

  it('retries on request, then closes when the save works', async () => {
    const { result, requestFlush, askUser } = run(
      [{ ok: false, reason: 'failed' }, { ok: false, reason: 'timeout' }, { ok: true }],
      ['retry', 'retry'],
    );
    expect(await result).toBe(true);
    expect(requestFlush).toHaveBeenCalledTimes(3);
    expect(askUser.mock.calls).toEqual([['failed'], ['timeout']]);
  });

  it('closes without saving when the user quits', async () => {
    const { result } = run([{ ok: false, reason: 'failed' }], ['quit']);
    expect(await result).toBe(true);
  });

  it('keeps the window open when the user cancels', async () => {
    const { result, requestFlush } = run([{ ok: false, reason: 'failed' }], ['cancel']);
    expect(await result).toBe(false);
    expect(requestFlush).toHaveBeenCalledTimes(1);
  });
});
