import type { WebContents } from 'electron';
import { isTrustedPage, type AppPage } from './ipc';

/**
 * Keep a window on the app's own page. The CSP does not stop top-level navigation, and the
 * preload (so `window.tb`) is injected into whatever page a window ends up showing, so the
 * renderer's lack of network access holds only if the window can never leave the app page:
 *
 * - `window.open`, `target="_blank"` links and the like create no window;
 * - navigation of any frame (`will-navigate`, `will-frame-navigate`) and server redirects
 *   (`will-redirect`) are cancelled unless they lead to the app page itself (a reload).
 *
 * `webContents.loadURL`/`loadFile` calls made by main are not events and are not affected.
 */
export function restrictToAppPage(
  contents: Pick<WebContents, 'on' | 'setWindowOpenHandler'>,
  page: AppPage,
): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const guard = (details: { url: string; preventDefault(): void }): void => {
    if (!isTrustedPage(details.url, page)) details.preventDefault();
  };
  contents.on('will-navigate', guard);
  contents.on('will-frame-navigate', guard);
  contents.on('will-redirect', guard);
}
