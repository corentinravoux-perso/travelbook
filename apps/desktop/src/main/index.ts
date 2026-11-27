import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  session,
  type IpcMainInvokeEvent,
} from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { guardWindowClose } from './close-guard';
import { menuLanguage } from './app-settings';
import { applyAppMenu, askCloseChoice, createElectronHost } from './host';
import { isTrustedPage, registerIpc, type AppPage } from './ipc';
import { setBundledResourcesDir } from './library/templates';
import { setFontsResourcesDir } from './library/fonts';
import { setBackgroundsResourcesDir } from './library/backgrounds';
import { setStickersResourcesDir, stickerSvg } from './library/stickers/offline';
import { setMapsResourcesDir } from './maps/packs';
import { getStickerService } from './library/stickers/service';
import { LIBRARY_FOLDER, libraryFile, primeLibraryLookup } from './library/userLibrary';
import { exportJobLookup } from './export/images';
import { ensureProxies } from './photos/proxies';
import { denyAllPermissions } from './permissions';
import { installTbProtocol, TB_PRIVILEGES, TB_SCHEME } from './protocol';
import { closeProject } from './project/close';
import { currentSession, setLibraryFileLookup, tbRoots } from './session';
import { enforceSingleInstance } from './single-instance';
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
    // The editor's top bar needs about 1040 px; narrower, its buttons would be cut off.
    minWidth: 1040,
    minHeight: 600,
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
  // A page that (re)loads starts on the home screen, with no album open: main closes its own.
  win.webContents.on('did-start-loading', () => {
    void closeProject().catch((error: unknown) =>
      console.warn('Could not close the album:', error),
    );
  });
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

// One instance per user: two of them would overwrite each other's saves (see `single-instance.ts`).
const isFirstInstance = enforceSingleInstance(app, () => mainWindow, createWindow);

// No page may ask for a permission, in any session (the main window and the export windows).
app.on('session-created', denyAllPermissions);

void app.whenReady().then(async () => {
  if (!isFirstInstance) return;
  denyAllPermissions(session.defaultSession);
  // The folder holding the bundled resources: `resources/` of the sources in dev, and in a
  // packaged app `<resourcesPath>/resources/`, where `extraResources` of electron-builder.yml puts it.
  const resourcesDir = app.isPackaged
    ? join(process.resourcesPath, 'resources')
    : join(app.getAppPath(), 'resources');
  const libraryDir = join(app.getPath('userData'), LIBRARY_FOLDER);
  setBundledResourcesDir(resourcesDir);
  setBackgroundsResourcesDir(resourcesDir);
  setStickersResourcesDir(resourcesDir);
  setFontsResourcesDir(resourcesDir);
  setMapsResourcesDir(resourcesDir);

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

  applyAppMenu(await menuLanguage().catch(() => 'fr' as const));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// The album still open when the app quits is closed, so that its folder takes its title. A
// folder that something still writes into keeps its name: the next close of the album renames it.
let closedOnQuit = false;
app.on('will-quit', (event) => {
  if (closedOnQuit || currentSession() === null) return;
  closedOnQuit = true;
  event.preventDefault();
  void closeProject({ onlyIfIdle: true })
    .catch((error: unknown) => console.warn('Could not close the album:', error))
    .finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
