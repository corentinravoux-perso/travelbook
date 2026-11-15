import { BrowserWindow } from 'electron';
import type { ExportPageJob } from '../../shared/exportPage';
import { pixelSize, type ExportRenderer, type PageTarget } from './images';
import { MM_TO_PX } from '@travelbook/core';

/** How long one page may take to be drawn (fonts and images decoded) before the export gives up. */
const SHOW_TIMEOUT_MS = 120_000;
/** How long one capture may take; a 600 dpi A4 page takes about 7 s. */
const CAPTURE_TIMEOUT_MS = 180_000;
/** How long one page may take to print. */
const PRINT_TIMEOUT_MS = 180_000;

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

/** One hidden window showing the page `#export`, told what to draw by `show`. */
interface Slot {
  win: BrowserWindow;
  show(job: ExportPageJob): Promise<void>;
}

/**
 * Open a window on the app's page at `#export` through `loadPage`: no preload, no access to the
 * app's API, and nothing but that page ever loaded. `offscreen` is for captures (a hidden window
 * that is not offscreen never paints, so `captureScreenshot` would hang there); `printToPDF` is
 * the other way round and hangs offscreen, so the PDF needs a plain hidden window.
 */
async function openSlot(
  loadPage: (win: BrowserWindow) => Promise<void>,
  offscreen: boolean,
): Promise<Slot> {
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: {
      offscreen,
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
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
    win,
    show: (job) =>
      withTimeout(
        win.webContents.executeJavaScript(`window.__tbExport.show(${JSON.stringify(job)})`),
        SHOW_TIMEOUT_MS,
        'Dessin de la page',
      ).then(() => undefined),
  };
}

/** The page `slot` shows, as a one-page PDF of the size of `@page` (the export box). */
async function printSlot(slot: Slot): Promise<Buffer> {
  return withTimeout(
    slot.win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    }),
    PRINT_TIMEOUT_MS,
    'Impression de la page',
  );
}

/**
 * The windows of an export, opened when first used: an offscreen one for `show` and `capture`,
 * a plain hidden one for `print`.
 */
export function createExportWindow(
  loadPage: (win: BrowserWindow) => Promise<void>,
): Promise<ExportRenderer> {
  let capture: Promise<Slot> | null = null;
  let print: Promise<Slot> | null = null;
  const closed: Slot[] = [];
  const slot = (offscreen: boolean): Promise<Slot> => {
    const opened = openSlot(loadPage, offscreen);
    opened.then(
      (s) => closed.push(s),
      () => undefined,
    );
    return opened;
  };
  const offscreenSlot = (): Promise<Slot> => (capture ??= slot(true));
  const plainSlot = (): Promise<Slot> => (print ??= slot(false));
  return Promise.resolve({
    show: async (job) => (await offscreenSlot()).show(job),
    capture: async (target, dpi) => capturePage((await offscreenSlot()).win, target, dpi),
    print: async (job) => {
      const s = await plainSlot();
      await s.show(job);
      return printSlot(s);
    },
    close: () => {
      for (const s of closed) if (!s.win.isDestroyed()) s.win.destroy();
    },
  });
}
