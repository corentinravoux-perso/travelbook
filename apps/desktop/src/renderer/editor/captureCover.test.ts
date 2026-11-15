import { newBook } from '@travelbook/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_BUDGET_MS, captureCoverThumb, stage, useStage } from './coverThumb';

const book = newBook({ title: 'T' });
const rect = { x: 0, y: 0, width: 320, height: 220 };

/** Plays `CoverStage`: calls `shoot` for the request on the stage, like its effect does. */
const shootNow = async () => {
  const request = useStage.getState().request!;
  await request.shoot(rect);
  request.resolve();
  useStage.setState({ request: null });
};

describe('captureCoverThumb', () => {
  const captureCover = vi.fn<(r: typeof rect) => Promise<void>>(() => Promise.resolve());
  let visibility: 'visible' | 'hidden';

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    captureCover.mockClear();
    vi.stubGlobal('window', { tb: { project: { captureCover } } });
    vi.stubGlobal('document', {
      get visibilityState() {
        return visibility;
      },
    });
    stage.mounted = true;
    useStage.setState({ request: null });
  });
  afterEach(() => {
    stage.mounted = false;
    useStage.setState({ request: null });
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('puts the cover on the stage and settles when the stage has captured it', async () => {
    const done = vi.fn();
    void captureCoverThumb(book).then(done);
    expect(useStage.getState().request?.book).toBe(book);
    await shootNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(captureCover).toHaveBeenCalledExactlyOnceWith(rect);
    expect(done).toHaveBeenCalled();
    // No timer is left behind to clear a later request.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('draws nothing for a window that is not on screen, and when no editor is mounted', async () => {
    visibility = 'hidden';
    await captureCoverThumb(book);
    expect(useStage.getState().request).toBeNull();
    visibility = 'visible';
    stage.mounted = false;
    await captureCoverThumb(book);
    expect(useStage.getState().request).toBeNull();
    expect(captureCover).not.toHaveBeenCalled();
  });

  it('gives up after the budget: settles, and takes the cover off the screen', async () => {
    const done = vi.fn();
    void captureCoverThumb(book).then(done);
    await vi.advanceTimersByTimeAsync(CAPTURE_BUDGET_MS - 1);
    expect(done).not.toHaveBeenCalled();
    expect(useStage.getState().request).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
    expect(useStage.getState().request).toBeNull();
    expect(captureCover).not.toHaveBeenCalled();
  });

  it('keeps the cover on the screen while main is capturing it, though the caller is freed', async () => {
    let finish: () => void = () => undefined;
    captureCover.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const done = vi.fn();
    void captureCoverThumb(book).then(done);
    const request = useStage.getState().request!;
    const shot = request.shoot(rect);
    await vi.advanceTimersByTimeAsync(CAPTURE_BUDGET_MS);
    expect(done).toHaveBeenCalled();
    expect(useStage.getState().request).toBe(request);
    finish();
    await shot;
  });

  it('rejects when main refuses the capture', async () => {
    captureCover.mockRejectedValueOnce(new Error('no project'));
    const outcome = captureCoverThumb(book).then(
      () => 'ok',
      (e: Error) => e.message,
    );
    const request = useStage.getState().request!;
    await request.shoot(rect).catch((e: unknown) => request.reject(e));
    expect(await outcome).toBe('no project');
  });
});
