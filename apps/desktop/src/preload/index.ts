import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import type { TbApi } from '../shared/api';
import {
  CHANNEL,
  CLOSE_REPLY_CHANNEL,
  CLOSE_REQUEST_CHANNEL,
  PROGRESS_CHANNEL,
} from '../shared/channels';

// The only door between the renderer and the main process: each method invokes one channel and
// returns its answer. Main validates every argument; nothing here exposes `ipcRenderer` itself.
/**
 * The close handshake lives here, not in the page: a request is answered even before the page has
 * registered a handler (nothing to save yet), so main never waits on a page that cannot answer.
 */
let closeHandler: (() => Promise<void>) | null = null;
ipcRenderer.on(CLOSE_REQUEST_CHANNEL, (_event: IpcRendererEvent, id: number) => {
  const handler = closeHandler;
  void (handler ? handler() : Promise.resolve()).then(
    () => ipcRenderer.send(CLOSE_REPLY_CHANNEL, id, true),
    () => ipcRenderer.send(CLOSE_REPLY_CHANNEL, id, false),
  );
});

const tb: TbApi = {
  project: {
    create: (options) => ipcRenderer.invoke(CHANNEL.projectCreate, options),
    open: (dir) => ipcRenderer.invoke(CHANNEL.projectOpen, dir),
    save: (book) => ipcRenderer.invoke(CHANNEL.projectSave, book),
    recent: () => ipcRenderer.invoke(CHANNEL.projectRecent),
    snapshot: (label) => ipcRenderer.invoke(CHANNEL.projectSnapshot, label),
    listSnapshots: () => ipcRenderer.invoke(CHANNEL.projectListSnapshots),
    readSnapshot: (id) => ipcRenderer.invoke(CHANNEL.projectReadSnapshot, id),
    reveal: () => ipcRenderer.invoke(CHANNEL.projectReveal),
    pickFolder: () => ipcRenderer.invoke(CHANNEL.projectPickFolder),
    captureCover: (rect) => ipcRenderer.invoke(CHANNEL.projectCaptureCover, rect),
    hasCoverThumb: () => ipcRenderer.invoke(CHANNEL.projectHasCoverThumb),
  },
  photos: {
    pick: () => ipcRenderer.invoke(CHANNEL.photosPick),
    import: (paths) => ipcRenderer.invoke(CHANNEL.photosImport, paths),
    onProgress: (cb) => {
      // The event (and its sender) stays here: the renderer only sees the numbers.
      const listener = (_event: IpcRendererEvent, done: number, total: number): void =>
        cb(done, total);
      ipcRenderer.on(PROGRESS_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(PROGRESS_CHANNEL, listener);
      };
    },
    // A path is all that leaves the preload; the `File` stays on this side of the bridge.
    pathForFile: (file) => webUtils.getPathForFile(file),
  },
  assets: {
    importFiles: (kind, paths) => ipcRenderer.invoke(CHANNEL.assetsImportFiles, kind, paths),
    fromLibrary: (itemId) => ipcRenderer.invoke(CHANNEL.assetsFromLibrary, itemId),
    palette: (assetIds) => ipcRenderer.invoke(CHANNEL.assetsPalette, assetIds),
  },
  library: {
    list: (kind, query) => ipcRenderer.invoke(CHANNEL.libraryList, kind, query),
    add: (kind, paths) => ipcRenderer.invoke(CHANNEL.libraryAdd, kind, paths),
    setFavourite: (itemId, on) => ipcRenderer.invoke(CHANNEL.librarySetFavourite, itemId, on),
    remove: (itemId) => ipcRenderer.invoke(CHANNEL.libraryRemove, itemId),
    userTemplates: {
      save: (template) => ipcRenderer.invoke(CHANNEL.libraryTemplateSave, template),
      list: () => ipcRenderer.invoke(CHANNEL.libraryTemplateList),
      delete: (templateId) => ipcRenderer.invoke(CHANNEL.libraryTemplateDelete, templateId),
    },
  },
  clipboard: {
    writeElements: (payload) => ipcRenderer.invoke(CHANNEL.clipboardWrite, payload),
    readElements: () => ipcRenderer.invoke(CHANNEL.clipboardRead),
  },
  exporter: {},
  app: {
    version: () => ipcRenderer.invoke(CHANNEL.appVersion),
    openExternal: (url) => ipcRenderer.invoke(CHANNEL.appOpenExternal, url),
    onCloseRequest: (handler) => {
      closeHandler = handler;
      return () => {
        if (closeHandler === handler) closeHandler = null;
      };
    },
  },
};

contextBridge.exposeInMainWorld('tb', tb);
