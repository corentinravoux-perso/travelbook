import type { App, BrowserWindow } from 'electron';

/**
 * Let one instance of the app run per user. Two instances would each keep their own save queues,
 * so both could open the same album and the last save would silently replace the other's edits
 * (the library index, the recent list and the export presets race the same way).
 *
 * Returns false for a second launch, which has asked the app to quit: the caller must not start
 * anything. In the first instance, a later launch focuses its window (or opens one if every window
 * was closed and the app stayed up, as on macOS).
 */
export function enforceSingleInstance(
  app: Pick<App, 'requestSingleInstanceLock' | 'quit' | 'on'>,
  getWindow: () => BrowserWindow | null,
  createWindow: () => void,
): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on('second-instance', () => {
    const win = getWindow();
    if (win === null || win.isDestroyed()) {
      createWindow();
      return;
    }
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  return true;
}
