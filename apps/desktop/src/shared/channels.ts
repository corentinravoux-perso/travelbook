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
  projectPickFolder: 'project:pickFolder',
  photosPick: 'photos:pick',
  photosImport: 'photos:import',
  assetsImportFiles: 'assets:importFiles',
  assetsFromLibrary: 'assets:fromLibrary',
  assetsPalette: 'assets:palette',
  libraryList: 'library:list',
  libraryAdd: 'library:add',
  librarySetFavourite: 'library:setFavourite',
  libraryRemove: 'library:remove',
  libraryTemplateSave: 'library:saveTemplate',
  libraryTemplateList: 'library:listTemplates',
  libraryTemplateDelete: 'library:deleteTemplate',
  clipboardWrite: 'clipboard:write',
  clipboardRead: 'clipboard:read',
  appVersion: 'app:version',
  appOpenExternal: 'app:openExternal',
} as const;

/** Sent from main to the renderer that started an import: `(done, total)`. */
export const PROGRESS_CHANNEL = 'photos:progress';

/** Main asks the window to save before it closes: `(requestId)`. */
export const CLOSE_REQUEST_CHANNEL = 'app:closeRequest';
/** The renderer's answer to a close request: `(requestId, ok)`. */
export const CLOSE_REPLY_CHANNEL = 'app:closeReply';

export type InvokeChannel = (typeof CHANNEL)[keyof typeof CHANNEL];
