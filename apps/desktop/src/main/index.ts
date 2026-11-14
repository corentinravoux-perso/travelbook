import { app, BrowserWindow, ipcMain, net, protocol, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElectronHost } from './host';
import { isTrustedPage, registerIpc, type AppPage } from './ipc';
import { ensureProxies } from './photos/proxies';
import { installTbProtocol, TB_PRIVILEGES, TB_SCHEME } from './protocol';
import { currentSession, tbRoots } from './session';

// Must run before the app is ready.
protocol.registerSchemesAsPrivileged([{ scheme: TB_SCHEME, privileges: { ...TB_PRIVILEGES } }]);

const rendererFile = join(import.meta.dirname, '../renderer/index.html');
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
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(rendererFile);
  }
  mainWindow = win;
  return win;
}

/** Only the app's own top-level page may call the main process. */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame;
  return frame !== null && frame === event.sender.mainFrame && isTrustedPage(frame.url, appPage);
}

void app.whenReady().then(() => {
  // The folder holding the bundled resources; Task 8.1 ships them next to the app when packaged.
  const resourcesDir = app.isPackaged
    ? join(process.resourcesPath, 'resources')
    : join(app.getAppPath(), 'resources');
  const libraryDir = join(app.getPath('userData'), 'library');

  installTbProtocol(protocol, {
    roots: () => tbRoots(currentSession(), { libraryDir, resourcesDir }),
    ensureProxy: async (id) => {
      const session = currentSession();
      const asset = session?.assets.get(id);
      if (!session || !asset) throw new Error(`Unknown asset: ${id}`);
      await ensureProxies(session.dir, asset);
    },
    fetchFile: (path) => net.fetch(pathToFileURL(path).toString()),
  });
  registerIpc(
    ipcMain,
    createElectronHost(() => mainWindow),
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
