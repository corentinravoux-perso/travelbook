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
  projectDuplicate: 'project:duplicate',
  projectReveal: 'project:reveal',
  projectPickFolder: 'project:pickFolder',
  projectCaptureCover: 'project:captureCover',
  projectHasCoverThumb: 'project:hasCoverThumb',
  photosPick: 'photos:pick',
  photosImport: 'photos:import',
  assetsImportFiles: 'assets:importFiles',
  assetsFromLibrary: 'assets:fromLibrary',
  assetsFromBundled: 'assets:fromBundled',
  assetsFromSvg: 'assets:fromSvg',
  assetsPalette: 'assets:palette',
  libraryList: 'library:list',
  libraryAdd: 'library:add',
  librarySetFavourite: 'library:setFavourite',
  libraryRemove: 'library:remove',
  libraryTemplateSave: 'library:saveTemplate',
  libraryTemplateList: 'library:listTemplates',
  libraryTemplateDelete: 'library:deleteTemplate',
  libraryBundledBackgrounds: 'library:bundledBackgrounds',
  libraryBundledTemplates: 'library:bundledTemplates',
  fontsList: 'fonts:list',
  fontsSearch: 'fonts:search',
  fontsAdd: 'fonts:add',
  fontsPick: 'fonts:pick',
  fontsImport: 'fonts:import',
  fontsAssetsFor: 'fonts:assetsFor',
  stickersSets: 'stickers:sets',
  stickersCategories: 'stickers:categories',
  stickersSources: 'stickers:sources',
  stickersSearch: 'stickers:search',
  stickersAdd: 'stickers:add',
  stickersAddBytes: 'stickers:addBytes',
  stickersIsOpaque: 'stickers:isOpaque',
  stickersSetKey: 'stickers:setKey',
  mapsSaveGeometry: 'maps:saveGeometry',
  mapsLoadPack: 'maps:loadPack',
  mapsListStyles: 'maps:listStyles',
  mapsSaveStyle: 'maps:saveStyle',
  mapsRenameStyle: 'maps:renameStyle',
  mapsDeleteStyle: 'maps:deleteStyle',
  clipboardWrite: 'clipboard:write',
  clipboardRead: 'clipboard:read',
  exportRun: 'export:run',
  exportCancel: 'export:cancel',
  exportPreflight: 'export:preflight',
  exportReveal: 'export:reveal',
  exportPresetsList: 'export:presetsList',
  exportPresetsSave: 'export:presetsSave',
  exportPresetsDelete: 'export:presetsDelete',
  appVersion: 'app:version',
  appOpenExternal: 'app:openExternal',
} as const;

/** Sent from main to the renderer that started an import: `(done, total)`. */
export const PROGRESS_CHANNEL = 'photos:progress';

/** Sent from main to the renderer that started an export: `(page, total, step)`. */
export const EXPORT_PROGRESS_CHANNEL = 'export:progress';

/** Main asks the window to save before it closes: `(requestId)`. */
export const CLOSE_REQUEST_CHANNEL = 'app:closeRequest';
/** The renderer's answer to a close request: `(requestId, ok)`. */
export const CLOSE_REPLY_CHANNEL = 'app:closeReply';

export type InvokeChannel = (typeof CHANNEL)[keyof typeof CHANNEL];
