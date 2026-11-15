import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { BookSchema, TemplateSchema } from '@travelbook/core';
import { z } from 'zod';
import type { CaptureRect, ExportOptions, ExportProgress, LibraryItem } from '../shared/api';
import {
  CHANNEL,
  EXPORT_PROGRESS_CHANNEL,
  PROGRESS_CHANNEL,
  type InvokeChannel,
} from '../shared/channels';
import { clipboardPayload, readElements, writeElements, type ClipboardHost } from './clipboard';
import { importAssetFiles } from './assets/import-files';
import { dominantColours } from './assets/palette';
import { bundledBackgrounds, importBundledBackground } from './library/backgrounds';
import {
  bundledTemplates,
  deleteUserTemplate,
  listUserTemplates,
  saveUserTemplate,
} from './library/templates';
import {
  addToLibrary,
  copyIntoProject,
  listLibrary,
  removeFromLibrary,
  setFavourite,
  touchUsed,
} from './library/userLibrary';
import {
  cancelExport,
  exportPreflight,
  runImageExport,
  type ExportRenderer,
} from './export/images';
import { absolutePath, exportOptions } from './export/options';
import { runPdfExport } from './export/pdf';
import { deletePreset, listPresets, savePreset } from './export/presets';
import { projectFilePath } from './protocol';
import { serialize } from './project/atomic-write';
import { describeError, importPhotos } from './photos/import';
import { ensureProxies } from './photos/proxies';
import { COVER_THUMB_EDGE, coverThumbUrl, writeCoverThumb } from './project/cover-thumb';
import { recentProjects } from './project/recent';
import {
  SNAPSHOT_ID_PATTERN,
  listSnapshots,
  pruneSnapshots,
  readSnapshot,
  writeSnapshot,
} from './project/snapshots';
import { createProject, openProject, saveBook } from './project/store';
import {
  knownAssets,
  openSession,
  recordAssets,
  recordBook,
  requireSession,
  type Session,
} from './session';

/** What the handlers need from the desktop: dialogs, the shell and the app itself. */
export interface Host {
  /** A folder picker; `null` when the user cancels. `create` picks where a new album goes. */
  pickFolder(purpose: 'create' | 'open'): Promise<string | null>;
  /** An image file picker (several files); empty when the user cancels. */
  pickPhotos(): Promise<string[]>;
  openExternal(url: string): Promise<void>;
  showInFolder(path: string): void;
  version(): string;
  /** The system clipboard. */
  clipboard: ClipboardHost;
  /**
   * A JPEG of what the window shows in `rect` (CSS px), scaled down so that its long edge is
   * `longEdge` px at most.
   */
  captureJpeg(rect: CaptureRect, longEdge: number): Promise<Uint8Array>;
  /** A hidden window that draws the pages of an export (see `export/exportWindow.ts`). */
  openExportRenderer(): Promise<ExportRenderer>;
}

export interface HandlerContext {
  /** Tell the window that asked how far an import has got. */
  progress(done: number, total: number): void;
  /** Tell the window that asked how far an export has got. */
  exportProgress(progress: ExportProgress): void;
}

export type IpcHandlers = Record<
  InvokeChannel,
  (ctx: HandlerContext, ...args: unknown[]) => Promise<unknown>
>;

const MAX_PATHS = 10_000;
const pathList = z.array(absolutePath).max(MAX_PATHS);

/** Same alphabet as asset ids and library item ids (see `protocol.ts`). */
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, 'must be a plain identifier');

/** A region of the window: whole px, inside any real screen, at least a few px wide. */
const captureRect = z.strictObject({
  x: z.number().int().min(0).max(20_000),
  y: z.number().int().min(0).max(20_000),
  width: z.number().int().min(8).max(4000),
  height: z.number().int().min(8).max(4000),
});

const pageSize = z.number().finite().positive().max(5000);

const libraryKind = z.enum(['sticker', 'background', 'font', 'template']);
const libraryFileKind = z.enum(['sticker', 'background', 'font']);
const libraryQuery = z.strictObject({
  text: z.string().max(200).optional(),
  favourite: z.boolean().optional(),
  recent: z.number().int().min(0).max(1000).optional(),
});

const isHttps = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const schemas = {
  none: z.tuple([]),
  create: z.tuple([
    z.strictObject({
      name: z.string().trim().min(1).max(200),
      parentDir: absolutePath.optional(),
      format: z.strictObject({ width: pageSize, height: pageSize }).optional(),
    }),
  ]),
  open: z.tuple([absolutePath.optional()]),
  save: z.tuple([BookSchema]),
  captureRect: z.tuple([captureRect]),
  snapshotLabel: z.tuple([z.enum(['auto', 'manual'])]),
  snapshotId: z.tuple([z.string().regex(SNAPSHOT_ID_PATTERN, 'not a snapshot id')]),
  paths: z.tuple([pathList]),
  importFiles: z.tuple([z.enum(['sticker', 'background', 'pattern', 'font']), pathList]),
  libraryItem: z.tuple([identifier]),
  libraryList: z.tuple([libraryKind, libraryQuery.optional()]),
  libraryAdd: z.tuple([libraryFileKind, pathList]),
  libraryFavourite: z.tuple([identifier, z.boolean()]),
  exportRun: z.tuple([exportOptions]),
  exportPresetSave: z.tuple([z.string().trim().min(1).max(200), exportOptions]),
  exportPresetName: z.tuple([z.string().trim().min(1).max(200)]),
  template: z.tuple([TemplateSchema]),
  templateId: z.tuple([identifier]),
  bundledFile: z.tuple([
    z
      .string()
      .regex(/^(patterns|textures)\/[A-Za-z0-9_-]+\.[a-z]{3,4}$/, 'must be a bundled background'),
  ]),
  palette: z.tuple([z.array(identifier).max(500)]),
  clipboardWrite: z.tuple([clipboardPayload]),
  externalUrl: z.tuple([z.string().max(2048).refine(isHttps, 'only https: URLs are opened')]),
};

/** Check what a renderer sent. The message names the channel and the first thing that is wrong. */
function parseArgs<S extends z.ZodType>(channel: InvokeChannel, schema: S, args: unknown[]) {
  const result = schema.safeParse(args);
  if (result.success) return result.data as z.output<S>;
  const issue = result.error.issues[0];
  const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  throw new Error(`Invalid arguments for ${channel}: ${where}${issue?.message ?? 'invalid'}`);
}

/** Imports into a project run one at a time: two of them could remove each other's files. */
const importQueue = (session: Session): string => `import:${resolve(session.dir)}`;

/** The files the palette is counted on: thumbnails of photos, the files of the other assets. */
async function paletteFiles(session: Session, ids: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  for (const id of new Set(ids)) {
    const asset = session.assets.get(id);
    if (asset === undefined) throw new Error(`Unknown asset: ${id}`);
    if (asset.kind === 'font') continue;
    if (asset.kind === 'photo') {
      files.push((await ensureProxies(session.dir, asset)).thumb);
      continue;
    }
    const file = projectFilePath(session.dir, asset.file);
    if (file === null) throw new Error(`Asset ${id} has no usable file`);
    files.push(file);
  }
  return files;
}

/**
 * The handler of every channel, as plain functions of `(context, ...arguments)`. Each one checks
 * its arguments before it does anything, and works on the project main has open, never on a
 * folder named by the renderer after that.
 */
export function createHandlers(host: Host): IpcHandlers {
  /** The files of the last export that finished: what `exportReveal` shows. */
  let lastExportFiles: string[] = [];
  return {
    [CHANNEL.projectCreate]: async (_ctx, ...args) => {
      const [options] = parseArgs(CHANNEL.projectCreate, schemas.create, args);
      const parentDir = options.parentDir ?? (await host.pickFolder('create'));
      if (parentDir === null) return null;
      const { dir, book } = await createProject({
        name: options.name,
        parentDir,
        ...(options.format ? { format: options.format } : {}),
      });
      openSession(dir, book);
      return { dir, book };
    },

    [CHANNEL.projectOpen]: async (_ctx, ...args) => {
      const [given] = parseArgs(CHANNEL.projectOpen, schemas.open, args);
      const dir = given ?? (await host.pickFolder('open'));
      if (dir === null) return null;
      const opened = await openProject(dir);
      openSession(opened.dir, opened.book);
      return opened;
    },

    [CHANNEL.projectPickFolder]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.projectPickFolder, schemas.none, args);
      return host.pickFolder('create');
    },

    [CHANNEL.projectSave]: async (_ctx, ...args) => {
      const [book] = parseArgs(CHANNEL.projectSave, schemas.save, args);
      const session = requireSession();
      await saveBook(session.dir, book);
      recordBook(session, book);
    },

    [CHANNEL.projectCaptureCover]: async (_ctx, ...args) => {
      const [rect] = parseArgs(CHANNEL.projectCaptureCover, schemas.captureRect, args);
      const session = requireSession();
      await writeCoverThumb(session.dir, await host.captureJpeg(rect, COVER_THUMB_EDGE));
    },

    [CHANNEL.projectHasCoverThumb]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.projectHasCoverThumb, schemas.none, args);
      return (await coverThumbUrl(requireSession().dir)) !== undefined;
    },

    [CHANNEL.projectRecent]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.projectRecent, schemas.none, args);
      return recentProjects();
    },

    [CHANNEL.projectSnapshot]: async (_ctx, ...args) => {
      const [label] = parseArgs(CHANNEL.projectSnapshot, schemas.snapshotLabel, args);
      const session = requireSession();
      const info = await writeSnapshot(session.dir, session.book, label);
      try {
        await pruneSnapshots(session.dir);
      } catch (error) {
        // The snapshot is safe: pruning can wait for the next one.
        console.warn('Could not prune the snapshots:', error);
      }
      return info;
    },

    [CHANNEL.projectListSnapshots]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.projectListSnapshots, schemas.none, args);
      return listSnapshots(requireSession().dir);
    },

    [CHANNEL.projectReadSnapshot]: async (_ctx, ...args) => {
      const [id] = parseArgs(CHANNEL.projectReadSnapshot, schemas.snapshotId, args);
      return readSnapshot(requireSession().dir, id);
    },

    [CHANNEL.projectReveal]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.projectReveal, schemas.none, args);
      host.showInFolder(join(requireSession().dir, 'book.json'));
    },

    [CHANNEL.photosPick]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.photosPick, schemas.none, args);
      return host.pickPhotos();
    },

    [CHANNEL.photosImport]: async (ctx, ...args) => {
      const [paths] = parseArgs(CHANNEL.photosImport, schemas.paths, args);
      const session = requireSession();
      return serialize(importQueue(session), async () => {
        // The book as the renderer will have it: saved assets, plus every import since.
        const book = { ...session.book, assets: knownAssets(session) };
        const report = await importPhotos(session.dir, book, paths, ctx.progress);
        recordAssets(session, report.added);
        return report;
      });
    },

    [CHANNEL.assetsImportFiles]: async (_ctx, ...args) => {
      const [kind, paths] = parseArgs(CHANNEL.assetsImportFiles, schemas.importFiles, args);
      const session = requireSession();
      return serialize(importQueue(session), async () => {
        const assets = await importAssetFiles(session.dir, kind, paths);
        recordAssets(session, assets);
        return assets;
      });
    },

    [CHANNEL.assetsFromLibrary]: async (_ctx, ...args) => {
      const [itemId] = parseArgs(CHANNEL.assetsFromLibrary, schemas.libraryItem, args);
      const session = requireSession();
      return serialize(importQueue(session), async () => {
        // The book as the renderer will have it: saved assets, plus every import since.
        const book = { ...session.book, assets: knownAssets(session) };
        const asset = await copyIntoProject(session.dir, book, itemId);
        recordAssets(session, [asset]);
        await touchUsed(itemId);
        return asset;
      });
    },

    [CHANNEL.assetsFromBundled]: async (_ctx, ...args) => {
      const [file] = parseArgs(CHANNEL.assetsFromBundled, schemas.bundledFile, args);
      const session = requireSession();
      return serialize(importQueue(session), async () => {
        const asset = await importBundledBackground(session.dir, file);
        recordAssets(session, [asset]);
        return asset;
      });
    },

    [CHANNEL.assetsPalette]: async (_ctx, ...args) => {
      const [ids] = parseArgs(CHANNEL.assetsPalette, schemas.palette, args);
      const session = requireSession();
      return dominantColours(await paletteFiles(session, ids));
    },

    [CHANNEL.libraryBundledBackgrounds]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.libraryBundledBackgrounds, schemas.none, args);
      return bundledBackgrounds();
    },

    [CHANNEL.libraryList]: async (_ctx, ...args) => {
      const [kind, query] = parseArgs(CHANNEL.libraryList, schemas.libraryList, args);
      return listLibrary(kind, query);
    },

    [CHANNEL.libraryAdd]: async (_ctx, ...args) => {
      const [kind, paths] = parseArgs(CHANNEL.libraryAdd, schemas.libraryAdd, args);
      const added = new Map<string, LibraryItem>();
      for (const path of paths) {
        try {
          const ext = extname(path);
          const item = await addToLibrary(kind, { path, ext }, { title: basename(path, ext) });
          added.set(item.id, item);
        } catch (error) {
          throw new Error(`${basename(path)}: ${describeError(error)}`, { cause: error });
        }
      }
      return [...added.values()];
    },

    [CHANNEL.librarySetFavourite]: async (_ctx, ...args) => {
      const [itemId, on] = parseArgs(CHANNEL.librarySetFavourite, schemas.libraryFavourite, args);
      await setFavourite(itemId, on);
    },

    [CHANNEL.libraryRemove]: async (_ctx, ...args) => {
      const [itemId] = parseArgs(CHANNEL.libraryRemove, schemas.libraryItem, args);
      await removeFromLibrary(itemId);
    },

    [CHANNEL.libraryTemplateSave]: async (_ctx, ...args) => {
      const [template] = parseArgs(CHANNEL.libraryTemplateSave, schemas.template, args);
      await saveUserTemplate(template);
    },

    [CHANNEL.libraryTemplateList]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.libraryTemplateList, schemas.none, args);
      return listUserTemplates();
    },

    [CHANNEL.libraryBundledTemplates]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.libraryBundledTemplates, schemas.none, args);
      return bundledTemplates();
    },

    [CHANNEL.libraryTemplateDelete]: async (_ctx, ...args) => {
      const [templateId] = parseArgs(CHANNEL.libraryTemplateDelete, schemas.templateId, args);
      await deleteUserTemplate(templateId);
    },

    [CHANNEL.clipboardWrite]: async (_ctx, ...args) => {
      const [payload] = parseArgs(CHANNEL.clipboardWrite, schemas.clipboardWrite, args);
      await writeElements(host.clipboard, requireSession(), payload);
    },

    [CHANNEL.clipboardRead]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.clipboardRead, schemas.none, args);
      const session = requireSession();
      return serialize(importQueue(session), () => readElements(host.clipboard, session));
    },

    [CHANNEL.exportRun]: async (ctx, ...args) => {
      const [options] = parseArgs(CHANNEL.exportRun, schemas.exportRun, args);
      const session = requireSession();
      // The album as last saved: the window saves before it asks for an export.
      const book = session.book;
      const deps = {
        openRenderer: () => host.openExportRenderer(),
        onProgress: ctx.exportProgress,
      };
      const run = options.route === 'pdf' ? runPdfExport : runImageExport;
      const report = await run(book, session.dir, options as ExportOptions, deps);
      lastExportFiles = report.files;
      return { ...report, warnings: await exportPreflight(session.dir, book) };
    },

    [CHANNEL.exportCancel]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.exportCancel, schemas.none, args);
      cancelExport();
    },

    [CHANNEL.exportPreflight]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.exportPreflight, schemas.none, args);
      const session = requireSession();
      return exportPreflight(session.dir, session.book);
    },

    [CHANNEL.exportReveal]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.exportReveal, schemas.none, args);
      // Only what main wrote: the renderer names no path.
      const first = lastExportFiles[0];
      if (first === undefined) throw new Error('Aucun export à afficher.');
      host.showInFolder(first);
    },

    [CHANNEL.exportPresetsList]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.exportPresetsList, schemas.none, args);
      return listPresets();
    },

    [CHANNEL.exportPresetsSave]: async (_ctx, ...args) => {
      const [name, options] = parseArgs(CHANNEL.exportPresetsSave, schemas.exportPresetSave, args);
      await savePreset(name, options as ExportOptions);
    },

    [CHANNEL.exportPresetsDelete]: async (_ctx, ...args) => {
      const [name] = parseArgs(CHANNEL.exportPresetsDelete, schemas.exportPresetName, args);
      await deletePreset(name);
    },

    [CHANNEL.appVersion]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.appVersion, schemas.none, args);
      return host.version();
    },

    [CHANNEL.appOpenExternal]: async (_ctx, ...args) => {
      const [url] = parseArgs(CHANNEL.appOpenExternal, schemas.externalUrl, args);
      // The normalised form: what is opened is what was checked.
      await host.openExternal(new URL(url).href);
    },
  };
}

/** Where the app page lives: a file (built app) or the dev server (`npm run dev`). */
export type AppPage = { file: string } | { origin: string };

/**
 * Is `url`, the URL of the frame that sent a message, the app's own page? A file page is
 * compared as a path, so that the way the URL encodes it does not matter; a dev server page by
 * origin. Anything else (another file, a web page, an unparsable URL) is not trusted.
 */
export function isTrustedPage(url: string, page: AppPage): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if ('origin' in page) return parsed.origin === page.origin;
  if (parsed.protocol !== 'file:') return false;
  try {
    const path = resolve(fileURLToPath(parsed));
    const want = resolve(page.file);
    return process.platform === 'win32' ? path.toLowerCase() === want.toLowerCase() : path === want;
  } catch {
    return false;
  }
}

/**
 * Handle every channel on `ipcMain`. A message is served only if `isTrusted` accepts the event
 * (the sender must be the app's own page); progress goes back to the window that asked.
 */
export function registerIpc(
  ipcMain: Pick<IpcMain, 'handle'>,
  host: Host,
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
): void {
  const handlers = createHandlers(host);
  for (const channel of Object.values(CHANNEL)) {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!isTrusted(event)) return Promise.reject(new Error(`Untrusted sender for ${channel}`));
      const ctx: HandlerContext = {
        progress: (done, total) => {
          // The window can close in the middle of an import; the import must still finish.
          if (!event.sender.isDestroyed()) event.sender.send(PROGRESS_CHANNEL, done, total);
        },
        exportProgress: ({ page, total, step }) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(EXPORT_PROGRESS_CHANNEL, page, total, step);
          }
        },
      };
      return handlers[channel](ctx, ...args);
    });
  }
}
