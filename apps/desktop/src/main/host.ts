import {
  app,
  clipboard,
  ClipboardItem,
  dialog,
  shell,
  type BrowserWindow,
  type OpenDialogOptions,
} from 'electron';
import type { CloseChoice } from './close-guard';
import { fr } from '../renderer/strings/fr';
import type { Host } from './ipc';

/** Extensions the photo import takes (see `PHOTO_EXTENSIONS` in `photos/import.ts`). */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

/** The real desktop: native dialogs over `window`, the system shell and the app. */
export function createElectronHost(window: () => BrowserWindow | null): Host {
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
    openExternal: (url) => shell.openExternal(url),
    showInFolder: (path) => shell.showItemInFolder(path),
    version: () => app.getVersion(),
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
