import { BrowserWindow } from 'electron';
import type { ExportPageJob } from '../../shared/exportPage';
import { pixelSize, type ExportRenderer, type PageTarget } from './images';
import { MM_TO_PX } from '@travelbook/core';

/** How long one page may take to be drawn (fonts and images decoded) before the export gives up. */
const SHOW_TIMEOUT_MS = 120_000;
/** How long one capture may take; a 600 dpi A4 page takes about 7 s. */
const CAPTURE_TIMEOUT_MS = 180_000;

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what}: pas de réponse en ${ms / 1000} s`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/**
 * PNG bytes of the page the window shows, at `dpi` (device scale factor `dpi / 96`). The page is
 * `target.clip` mm wide and high; the window is told its size through DevTools instead of being
 * resized, so no real screen is involved.
 */
export async function capturePage(
  win: BrowserWindow,
  target: PageTarget,
  dpi: number,
): Promise<Buffer> {
  const cssW = target.clip.w * MM_TO_PX;
  const cssH = target.clip.h * MM_TO_PX;
  const { w, h } = pixelSize(target.clip, dpi);
  const debug = win.webContents.debugger;
  const attached = !debug.isAttached();
  if (attached) debug.attach('1.3');
  try {
    await debug.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: Math.ceil(cssW),
      height: Math.ceil(cssH),
      deviceScaleFactor: dpi / 96,
      mobile: false,
    });
    const shot = (await withTimeout(
      debug.sendCommand('Page.captureScreenshot', {
        format: 'png',
        // One CSS px of clip is `dpi / 96` device px: the capture is `w` x `h` px, give or take one.
        clip: { x: 0, y: 0, width: w / (dpi / 96), height: h / (dpi / 96), scale: 1 },
      }),
      CAPTURE_TIMEOUT_MS,
      'Capture de la page',
    )) as { data: string };
    return Buffer.from(shot.data, 'base64');
  } finally {
    await debug.sendCommand('Emulation.clearDeviceMetricsOverride').catch(() => undefined);
    if (attached) debug.detach();
  }
}

/**
 * A window for the export: offscreen (a hidden window that is not offscreen never paints, so
 * `captureScreenshot` would hang), with no preload and no access to the app's API. It loads the
 * app's page at `#export` through `loadPage` and is told what to draw with `show`.
 */
export async function createExportWindow(
  loadPage: (win: BrowserWindow) => Promise<void>,
): Promise<ExportRenderer> {
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // The page is only ever the one loaded below.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  try {
    await loadPage(win);
    // The page installs its handle once its code has loaded.
    await withTimeout(
      win.webContents.executeJavaScript(
        'new Promise((resolve) => { const t = setInterval(() => { if (window.__tbExport) { clearInterval(t); resolve(true); } }, 20); })',
      ),
      SHOW_TIMEOUT_MS,
      'Fenêtre d’export',
    );
  } catch (error) {
    win.destroy();
    throw error;
  }
  return {
    show: (job: ExportPageJob) =>
      withTimeout(
        win.webContents.executeJavaScript(`window.__tbExport.show(${JSON.stringify(job)})`),
        SHOW_TIMEOUT_MS,
        'Dessin de la page',
      ).then(() => undefined),
    capture: (target, dpi) => capturePage(win, target, dpi),
    close: () => {
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
