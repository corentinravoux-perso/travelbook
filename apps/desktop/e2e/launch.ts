import { _electron as electron, type ElectronApplication } from '@playwright/test';
import { join } from 'node:path';

/**
 * Start the built app (`out/`). Pass `userDataDir` to keep the recent-projects list and the
 * browser profile of the run out of the real user's settings.
 */
export async function launchApp(userDataDir?: string): Promise<ElectronApplication> {
  // Some hosts (e.g. VS Code terminals) export ELECTRON_RUN_AS_NODE, which turns Electron into plain Node.
  const env = { ...process.env } as Record<string, string>;
  delete env['ELECTRON_RUN_AS_NODE'];
  const app = await electron.launch({
    args: [
      join(import.meta.dirname, '..'),
      ...(userDataDir ? [`--user-data-dir=${userDataDir}`] : []),
    ],
    env,
  });
  // The pointer the tests drive is the one of DevTools, but Chromium has a single mouse: a real
  // pointer resting over a test window moves it whenever another worker opens or closes a window
  // (the display sends enter and motion events), which drops the capture of a drag in progress.
  // A window that ignores the real pointer never gets those events; DevTools input is unaffected.
  await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    const ignore = (win: Electron.BrowserWindow) => win.setIgnoreMouseEvents(true);
    BrowserWindow.getAllWindows().forEach(ignore);
    electronApp.on('browser-window-created', (_event, win) => ignore(win));
  });
  return app;
}
