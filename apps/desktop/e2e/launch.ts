import { _electron as electron, type ElectronApplication } from '@playwright/test';
import { join } from 'node:path';

/**
 * Start the built app (`out/`). Pass `userDataDir` to keep the recent-projects list and the
 * browser profile of the run out of the real user's settings.
 */
export function launchApp(userDataDir?: string): Promise<ElectronApplication> {
  // Some hosts (e.g. VS Code terminals) export ELECTRON_RUN_AS_NODE, which turns Electron into plain Node.
  const env = { ...process.env } as Record<string, string>;
  delete env['ELECTRON_RUN_AS_NODE'];
  return electron.launch({
    args: [
      join(import.meta.dirname, '..'),
      ...(userDataDir ? [`--user-data-dir=${userDataDir}`] : []),
    ],
    env,
  });
}
