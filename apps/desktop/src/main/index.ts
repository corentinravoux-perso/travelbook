import { app, BrowserWindow, ipcMain, net, protocol, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { guardWindowClose } from './close-guard';
import { askCloseChoice, createElectronHost } from './host';
import { isTrustedPage, registerIpc, type AppPage } from './ipc';
import { setBundledResourcesDir } from './library/templates';
import { setFontsResourcesDir } from './library/fonts';
import { setBackgroundsResourcesDir } from './library/backgrounds';
import { setStickersResourcesDir, stickerSvg } from './library/stickers/offline';
import { getStickerService } from './library/stickers/service';
import { LIBRARY_FOLDER, libraryFile, primeLibraryLookup } from './library/userLibrary';
import { exportJobLookup } from './export/images';
import { ensureProxies } from './photos/proxies';
import { installTbProtocol, TB_PRIVILEGES, TB_SCHEME } from './protocol';
import { currentSession, setLibraryFileLookup, tbRoots } from './session';
import { restrictToAppPage } from './window-guard';

// Must run before the app is ready.
protocol.registerSchemesAsPrivileged([{ scheme: TB_SCHEME, privileges: { ...TB_PRIVILEGES } }]);

const rendererFile = join(import.meta.dirname, '../renderer/index.html');
/** Test-only page of the render visual spec: never in a packaged app. */
const renderFixture = !app.isPackaged && process.env['TB_RENDER_FIXTURE'] === '1';
const devUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];
/** The one page allowed to talk to the main process. */
const appPage: AppPage = devUrl ? { origin: new URL(devUrl).origin } : { file: rendererFile };

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'travelbook',
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  restrictToAppPage(win.webContents, appPage);
  guardWindowClose(win, { ipcMain, isTrusted: isTrustedSender, askUser: askCloseChoice });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(rendererFile, renderFixture ? { hash: 'render-fixture' } : undefined);
  }
  mainWindow = win;
  return win;
}

/** Only the app's own top-level page may call the main process. */
function isTrustedSender(event: Pick<IpcMainInvokeEvent, 'senderFrame' | 'sender'>): boolean {
  const frame = event.senderFrame;
  return frame !== null && frame === event.sender.mainFrame && isTrustedPage(frame.url, appPage);
}

void app.whenReady().then(async () => {
  // The folder holding the bundled resources; Task 8.1 ships them next to the app when packaged.
  const resourcesDir = app.isPackaged
    ? join(process.resourcesPath, 'resources')
    : join(app.getAppPath(), 'resources');
  const libraryDir = join(app.getPath('userData'), LIBRARY_FOLDER);
  setBundledResourcesDir(resourcesDir);
  setBackgroundsResourcesDir(resourcesDir);
  setStickersResourcesDir(resourcesDir);
  setFontsResourcesDir(resourcesDir);

  // tb://library/<id> is answered from the library index, which is read once before any window.
  setLibraryFileLookup(libraryFile);
  await primeLibraryLookup().catch((error: unknown) => {
    console.warn('Could not read the user library:', error);
  });

  installTbProtocol(protocol, {
    roots: () =>
      tbRoots(currentSession(), { libraryDir, resourcesDir, exportJob: exportJobLookup }),
    ensureProxy: async (id) => {
      const session = currentSession();
      const asset = session?.assets.get(id);
      if (!session || !asset) throw new Error(`Unknown asset: ${id}`);
      await ensureProxies(session.dir, asset);
    },
    fetchFile: (path) => net.fetch(pathToFileURL(path).toString()),
    stickerSvg: (set, id) => stickerSvg(set, id),
    remoteThumb: async (key) => (await getStickerService(() => app.getVersion())).thumb(key),
  });
  registerIpc(
    ipcMain,
    createElectronHost(
      () => mainWindow,
      (win) =>
        devUrl ? win.loadURL(`${devUrl}#export`) : win.loadFile(rendererFile, { hash: 'export' }),
    ),
    isTrustedSender,
  );

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
