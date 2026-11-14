/**
 * IPC channel names, shared by the preload (which invokes them) and the main process (which
 * handles them), so that the two sides cannot drift apart.
 */
export const CHANNEL = {
  projectCreate: 'project:create',
  projectOpen: 'project:open',
  projectSave: 'project:save',
  projectRecent: 'project:recent',
  projectSnapshot: 'project:snapshot',
  projectListSnapshots: 'project:listSnapshots',
  projectReadSnapshot: 'project:readSnapshot',
  projectReveal: 'project:reveal',
  photosPick: 'photos:pick',
  photosImport: 'photos:import',
  assetsImportFiles: 'assets:importFiles',
  assetsFromLibrary: 'assets:fromLibrary',
  assetsPalette: 'assets:palette',
  appVersion: 'app:version',
  appOpenExternal: 'app:openExternal',
} as const;

/** Sent from main to the renderer that started an import: `(done, total)`. */
export const PROGRESS_CHANNEL = 'photos:progress';

export type InvokeChannel = (typeof CHANNEL)[keyof typeof CHANNEL];
