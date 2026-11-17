import {
  app,
  clipboard,
  ClipboardItem,
  dialog,
  Menu,
  shell,
  type BrowserWindow,
  type OpenDialogOptions,
} from 'electron';
import type { CloseChoice } from './close-guard';
import { fr } from '../renderer/strings/fr';
import { createExportWindow } from './export/exportWindow';
import { menuTemplate } from './app-menu';
import type { Host } from './ipc';
import type { MenuLanguage } from '../shared/api';

/** Build the application menu bar in `language` and install it. */
export function applyAppMenu(language: MenuLanguage): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(menuTemplate(language, process.platform, app.name)),
  );
}

/** Extensions the photo import takes (see `PHOTO_EXTENSIONS` in `photos/import.ts`). */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
/** Font files the font import takes. */
const FONT_EXTENSIONS = ['ttf', 'otf', 'woff2'];

/** The real desktop: native dialogs over `window`, the system shell and the app. */
export function createElectronHost(
  window: () => BrowserWindow | null,
  /** Load the app's page at `#export` in a window (see `export/exportWindow.ts`). */
  loadExportPage: (win: BrowserWindow) => Promise<void>,
): Host {
  async function pick(options: OpenDialogOptions): Promise<string[]> {
    const parent = window();
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  }
  return {
    pickFolder: async (purpose) => {
      const [folder] = await pick({
        title: purpose === 'create' ? fr.dialogs.chooseAlbumFolder : fr.dialogs.chooseAlbumToOpen,
        properties: purpose === 'create' ? ['openDirectory', 'createDirectory'] : ['openDirectory'],
      });
      return folder ?? null;
    },
    pickPhotos: () =>
      pick({
        title: fr.dialogs.choosePhotos,
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: fr.dialogs.imageFilter, extensions: IMAGE_EXTENSIONS }],
      }),
    pickFont: async () => {
      const [file] = await pick({
        title: fr.dialogs.chooseFont,
        properties: ['openFile'],
        filters: [{ name: fr.dialogs.fontFilter, extensions: FONT_EXTENSIONS }],
      });
      return file ?? null;
    },
    openExternal: (url) => shell.openExternal(url),
    showInFolder: (path) => shell.showItemInFolder(path),
    trashItem: (path) => shell.trashItem(path),
    version: () => app.getVersion(),
    applyMenu: applyAppMenu,
    captureJpeg: async (rect, longEdge) => {
      const win = window();
      if (!win) throw new Error('No window to capture');
      const image = await win.webContents.capturePage(rect);
      const { width, height } = image.getSize();
      if (width === 0 || height === 0) throw new Error('The captured region is empty');
      const ratio = Math.min(1, longEdge / Math.max(width, height));
      const scaled =
        ratio < 1
          ? image.resize({
              width: Math.max(1, Math.round(width * ratio)),
              height: Math.max(1, Math.round(height * ratio)),
              quality: 'best',
            })
          : image;
      return scaled.toJPEG(88);
    },
    openExportRenderer: () => createExportWindow(loadExportPage),
    clipboard: {
      write: (type, data) =>
        clipboard.write([new ClipboardItem({ [type]: new Blob([data], { type }) })]),
      read: async (type) => {
        const item = (await clipboard.read()).find((i) => i.types.includes(type));
        if (!item) return null;
        const data = await item.getType(type);
        return data instanceof Blob ? data.text() : null;
      },
    },
  };
}

/** Saving before close failed: ask the user what to do. Closing the dialog counts as cancel. */
export async function askCloseChoice(
  win: BrowserWindow,
  reason: 'failed' | 'timeout',
): Promise<CloseChoice> {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: fr.closeDialog.title,
    message: fr.closeDialog.message,
    detail: reason === 'timeout' ? fr.closeDialog.timeout : fr.closeDialog.failed,
    buttons: [fr.closeDialog.retry, fr.closeDialog.quit, fr.closeDialog.cancel],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  return (['retry', 'quit', 'cancel'] as const)[response] ?? 'cancel';
}
