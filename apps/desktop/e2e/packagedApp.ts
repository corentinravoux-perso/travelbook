/**
 * Starting the packaged app: the installed layout that `npm run dist:linux` (or `dist:win`) leaves
 * in `dist/linux-unpacked/` (`dist/win-unpacked/`), the same files the installer ships. Shared by
 * the specs that run on it (`packaged/` and `stress/`).
 *
 *   TB_PACKAGED_EXECUTABLE=/opt/travelbook/travelbook npm run e2e:packaged
 *                                                     check an installed copy
 */
import { _electron as electron, expect, type ElectronApplication } from '@playwright/test';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

export const PACKAGED_EXECUTABLE =
  process.env['TB_PACKAGED_EXECUTABLE'] ??
  join(
    import.meta.dirname,
    '../dist',
    process.platform === 'win32' ? 'win-unpacked/travelbook.exe' : 'linux-unpacked/travelbook',
  );

/** Fail with the command to run when there is no packaged app to start. */
export async function requirePackagedApp(): Promise<void> {
  await access(PACKAGED_EXECUTABLE).catch(() => {
    throw new Error(`No packaged app at ${PACKAGED_EXECUTABLE}: run "npm run dist:linux" first.`);
  });
}

/**
 * The packaged app, with its own user data folder and with what it writes to stderr kept. Its
 * window ignores the real pointer: Chromium has a single mouse, and one resting over the window
 * would move the one a test drives whenever the display sends it an event.
 */
export async function launchPackaged(
  userData: string,
): Promise<{ app: ElectronApplication; stderr: () => string }> {
  // Some hosts (e.g. VS Code terminals) export ELECTRON_RUN_AS_NODE, which turns Electron into plain Node.
  const env = { ...process.env } as Record<string, string>;
  delete env['ELECTRON_RUN_AS_NODE'];
  const app = await electron.launch({
    executablePath: PACKAGED_EXECUTABLE,
    args: [`--user-data-dir=${userData}`],
    env,
  });
  await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    const ignore = (win: Electron.BrowserWindow) => win.setIgnoreMouseEvents(true);
    BrowserWindow.getAllWindows().forEach(ignore);
    electronApp.on('browser-window-created', (_event, win) => ignore(win));
  });
  let text = '';
  app.process().stderr?.on('data', (chunk: Buffer) => (text += chunk.toString()));
  return { app, stderr: () => text };
}

/** Main logs a failed IPC handler on stderr; GLib-GObject lines are what sharp warns about. */
export function expectNoMainErrors(stderr: string): void {
  expect(
    stderr.split('\n').filter((l) => /Error occurred in handler|GLib-GObject/.test(l)),
  ).toEqual([]);
}

/** Close the window the way the user does (which saves first) and wait for the app to exit. */
export async function quitPackaged(app: ElectronApplication): Promise<void> {
  const exited = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await exited;
}
