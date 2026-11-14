import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { restrictToAppPage } from './window-guard';

type Listener = (details: { url: string; preventDefault(): void }) => void;

/** A stand-in for `webContents` that records what the guard registers. */
function fakeContents() {
  const listeners = new Map<string, Listener>();
  let openHandler: ((details: { url: string }) => { action: string }) | undefined;
  const contents = {
    on: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, listener);
    }),
    setWindowOpenHandler: vi.fn((handler: typeof openHandler) => {
      openHandler = handler;
    }),
  };
  return {
    contents: contents as unknown as Pick<WebContents, 'on' | 'setWindowOpenHandler'>,
    listeners,
    open: (url: string) => openHandler?.({ url }),
    /** Fire a navigation event the way Electron does; true when the guard let it through. */
    navigate: (event: string, url: string): boolean => {
      const preventDefault = vi.fn();
      listeners.get(event)?.({ url, preventDefault });
      return preventDefault.mock.calls.length === 0;
    },
  };
}

const file = join(tmpdir(), 'Été 2026', 'app', 'out', 'renderer', 'index.html');
const appUrl = pathToFileURL(file).href;

describe('restrictToAppPage', () => {
  it('denies every window the page tries to open', () => {
    const fake = fakeContents();
    restrictToAppPage(fake.contents, { file });
    for (const url of [
      'https://example.com/',
      'http://example.com/',
      appUrl,
      'tb://asset/abc?v=original',
      'file:///etc/passwd',
      'about:blank',
      '',
    ]) {
      expect(fake.open(url), url).toEqual({ action: 'deny' });
    }
  });

  it.each(['will-navigate', 'will-frame-navigate', 'will-redirect'])(
    'on %s, blocks anything but the app page',
    (event) => {
      const fake = fakeContents();
      restrictToAppPage(fake.contents, { file });
      expect(fake.listeners.has(event)).toBe(true);
      for (const url of [
        'https://example.com/',
        'http://localhost:5173/',
        'file:///etc/passwd',
        pathToFileURL(join(tmpdir(), 'other.html')).href,
        'tb://asset/abc?v=original',
        'tb://resource/x.svg',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'about:blank',
        'not a url',
        '',
      ]) {
        expect(fake.navigate(event, url), url).toBe(false);
      }
    },
  );

  it.each(['will-navigate', 'will-frame-navigate', 'will-redirect'])(
    'on %s, lets the app page reload',
    (event) => {
      const fake = fakeContents();
      restrictToAppPage(fake.contents, { file });
      expect(fake.navigate(event, appUrl)).toBe(true);
      expect(fake.navigate(event, `${appUrl}#/x`)).toBe(true);
    },
  );

  it('follows the dev server origin in development', () => {
    const fake = fakeContents();
    restrictToAppPage(fake.contents, { origin: 'http://localhost:5173' });
    expect(fake.navigate('will-navigate', 'http://localhost:5173/')).toBe(true);
    expect(fake.navigate('will-navigate', 'http://localhost:9999/')).toBe(false);
    expect(fake.navigate('will-navigate', 'https://example.com/')).toBe(false);
    expect(fake.open('http://localhost:5173/')).toEqual({ action: 'deny' });
  });
});
