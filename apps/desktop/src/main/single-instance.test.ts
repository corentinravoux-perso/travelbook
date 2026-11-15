import type { App, BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { enforceSingleInstance } from './single-instance';

type SecondInstance = () => void;

function fakeApp(lock: boolean) {
  let onSecond: SecondInstance | undefined;
  const app = {
    requestSingleInstanceLock: vi.fn(() => lock),
    quit: vi.fn(),
    on: vi.fn((_event: string, listener: SecondInstance) => {
      onSecond = listener;
    }),
  };
  return {
    app: app as unknown as Pick<App, 'requestSingleInstanceLock' | 'quit' | 'on'>,
    raw: app,
    secondInstance: () => onSecond?.(),
  };
}

function fakeWindow(opts: { minimized?: boolean; destroyed?: boolean } = {}) {
  const win = {
    isDestroyed: vi.fn(() => opts.destroyed ?? false),
    isMinimized: vi.fn(() => opts.minimized ?? false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  };
  return { win: win as unknown as BrowserWindow, raw: win };
}

describe('enforceSingleInstance', () => {
  it('quits the second launch and tells the caller not to start', () => {
    const { app, raw } = fakeApp(false);
    const started = enforceSingleInstance(app, () => null, vi.fn());
    expect(started).toBe(false);
    expect(raw.quit).toHaveBeenCalledTimes(1);
    expect(raw.on).not.toHaveBeenCalled();
  });

  it('lets the first launch start, without quitting', () => {
    const { app, raw } = fakeApp(true);
    expect(enforceSingleInstance(app, () => null, vi.fn())).toBe(true);
    expect(raw.quit).not.toHaveBeenCalled();
    expect(raw.on).toHaveBeenCalledWith('second-instance', expect.any(Function));
  });

  it('a second launch brings the existing window to the front', () => {
    const { app, secondInstance } = fakeApp(true);
    const { win, raw } = fakeWindow();
    enforceSingleInstance(app, () => win, vi.fn());
    secondInstance();
    expect(raw.restore).not.toHaveBeenCalled();
    expect(raw.show).toHaveBeenCalled();
    expect(raw.focus).toHaveBeenCalled();
  });

  it('restores a minimized window before focusing it', () => {
    const { app, secondInstance } = fakeApp(true);
    const { win, raw } = fakeWindow({ minimized: true });
    enforceSingleInstance(app, () => win, vi.fn());
    secondInstance();
    expect(raw.restore).toHaveBeenCalled();
    expect(raw.focus).toHaveBeenCalled();
  });

  it('opens a window when none is left (the window was closed, the app is still running)', () => {
    const { app, secondInstance } = fakeApp(true);
    const create = vi.fn();
    enforceSingleInstance(app, () => null, create);
    secondInstance();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not touch a destroyed window', () => {
    const { app, secondInstance } = fakeApp(true);
    const { win, raw } = fakeWindow({ destroyed: true });
    const create = vi.fn();
    enforceSingleInstance(app, () => win, create);
    secondInstance();
    expect(raw.focus).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
