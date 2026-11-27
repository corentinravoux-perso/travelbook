import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  BookSchema,
  LicenceSchema,
  MapStyleSchema,
  TemplateSchema,
  fontFamiliesUsed,
  type Book,
} from '@travelbook/core';
import { z } from 'zod';
import type {
  CaptureRect,
  ExportOptions,
  ExportProgress,
  LibraryItem,
  MenuLanguage,
} from '../shared/api';
import {
  CHANNEL,
  EXPORT_PROGRESS_CHANNEL,
  PROGRESS_CHANNEL,
  type InvokeChannel,
} from '../shared/channels';
import { clipboardPayload, readElements, writeElements, type ClipboardHost } from './clipboard';
import { assetFromSvg } from './assets/from-svg';
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
  expandLibraryPaths,
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
import {
  addFromCatalogue,
  bundledFontFiles,
  ensureFontsInProject,
  fontAssetsFor,
  importFontFile,
  listFonts,
  searchCatalogue,
  unbundledFamilies,
} from './library/fonts';
import { getStickerService } from './library/stickers/service';
import { SourceError } from './library/stickers/source';
import { saveGeometryAsset } from './maps/geometry-asset';
import { loadPack } from './maps/packs';
import {
  USER_STYLE_ID,
  deleteUserStyle,
  listUserStyles,
  renameUserStyle,
  saveUserStyle,
} from './maps/user-styles';
import { projectFilePath } from './protocol';
import { isBusy, serialize } from './project/atomic-write';
import { describeError, importPhotos } from './photos/import';
import { ensureProxies } from './photos/proxies';
import { COVER_THUMB_EDGE, coverThumbUrl, writeCoverThumb } from './project/cover-thumb';
import { recentProjects, retitleRecentProject } from './project/recent';
import {
  SNAPSHOT_ID_PATTERN,
  listSnapshots,
  pruneSnapshots,
  readSnapshot,
  writeSnapshot,
} from './project/snapshots';
import { menuLanguage, setMenuLanguage } from './app-settings';
import { deleteProject } from './project/delete';
import { duplicateProject } from './project/duplicate';
import { MAX_TITLE_LENGTH, renameProject } from './project/rename';
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
  /** A font file picker (TTF, OTF, WOFF2); `null` when the user cancels. */
  pickFont(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  showInFolder(path: string): void;
  /** Move a file or folder to the system trash. */
  trashItem(path: string): Promise<void>;
  version(): string;
  /** Rebuild the application menu bar in this language. */
  applyMenu(language: MenuLanguage): void;
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

const fontFamilies = z.tuple([z.array(z.string().min(1).max(200)).max(200)]);
const stickerRef = z.strictObject({
  source: z.string().min(1).max(64),
  id: z.string().min(1).max(256),
});
const stickerSearch = z.strictObject({
  source: z.string().min(1).max(64),
  q: z.string().max(200),
  page: z.number().int().min(1).max(10_000),
  set: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional(),
  category: z.string().max(200).optional(),
  mono: z.boolean().optional(),
  noAttribution: z.boolean().optional(),
  group: z.enum(['travelbook', 'library']).optional(),
  recommended: z.boolean().optional(),
});
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** Longest SVG text `assets:fromSvg` accepts (a poster illustration is a few kB). */
const MAX_SVG_CHARS = 2_000_000;
/** Longest baked map geometry `maps:saveGeometry` accepts (a whole country is a few hundred kB). */
const MAX_GEOMETRY_CHARS = 20_000_000;
const styleName = z.string().trim().min(1).max(100);

/** A failed online call reaches the renderer as `SourceError:<kind>`, which it maps to French. */
async function viaSource<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (error instanceof SourceError)
      throw new Error(`SourceError:${error.kind}`, { cause: error });
    throw error;
  }
}

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
  duplicate: z.tuple([absolutePath]),
  delete: z.tuple([absolutePath]),
  rename: z.tuple([absolutePath, z.string().trim().min(1).max(MAX_TITLE_LENGTH)]),
  menuLanguage: z.tuple([z.enum(['fr', 'en'])]),
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
  fontPath: z.tuple([absolutePath]),
  fontQuery: z.tuple([z.string().max(100)]),
  fontId: z.tuple([z.string().regex(/^[a-z0-9-]{1,80}$/, 'must be a font id')]),
  fontFamilies,
  setId: z.tuple([z.string().regex(/^[a-z0-9-]{1,64}$/)]),
  stickerSearch: z.tuple([stickerSearch]),
  stickerRef: z.tuple([stickerRef]),
  stickerBytes: z.tuple([
    z.string().max(255),
    z.instanceof(Uint8Array).refine((b) => b.byteLength <= MAX_IMAGE_BYTES, 'over 20 MB'),
  ]),
  sourceKey: z.tuple([z.string().min(1).max(64), z.string().max(500)]),
  template: z.tuple([TemplateSchema]),
  templateId: z.tuple([identifier]),
  bundledFile: z.tuple([
    z
      .string()
      .regex(/^(patterns|textures)\/[A-Za-z0-9_-]+\.[a-z]{3,4}$/, 'must be a bundled background'),
  ]),
  palette: z.tuple([z.array(identifier).max(500)]),
  fromSvg: z.tuple([
    z.string().min(1).max(MAX_SVG_CHARS),
    z.object({ name: z.string().min(1).max(200), licence: LicenceSchema.optional() }).strict(),
  ]),
  mapGeometry: z.tuple([
    z.string().min(2).max(MAX_GEOMETRY_CHARS),
    z.strictObject({ name: z.string().min(1).max(200) }),
  ]),
  /** An index subject id: `TH`, `US-AK`, `FR-MET`. */
  subjectId: z.tuple([z.string().regex(/^[A-Za-z0-9-]{1,32}$/, 'must be a subject id')]),
  styleSave: z.tuple([styleName, MapStyleSchema]),
  styleRename: z.tuple([z.string().regex(USER_STYLE_ID, 'must be a user style id'), styleName]),
  styleId: z.tuple([z.string().regex(USER_STYLE_ID, 'must be a user style id')]),
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

/**
 * Whether the text of `book` draws with a family the app does not bundle, so that saving it may
 * have faces to copy. When that cannot be told (the font list is unreadable) the copy runs and
 * reports why it cannot.
 */
function carriesLibraryFonts(book: Book): boolean {
  try {
    return unbundledFamilies(fontFamiliesUsed(book)).length > 0;
  } catch {
    return true;
  }
}

/** The files the palette is counted on: thumbnails of photos, the files of the other assets. */
async function paletteFiles(session: Session, ids: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  for (const id of new Set(ids)) {
    const asset = session.assets.get(id);
    if (asset === undefined) throw new Error(`Unknown asset: ${id}`);
    // A font and a map's geometry are not images: there is no palette to take from them.
    if (asset.kind === 'font' || asset.kind === 'map') continue;
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
  /** The book of the font copy waiting in a project's import queue, by queue key. */
  const waitingFontCopies = new Map<string, Book>();

  /**
   * Copy the faces `book` uses into the album once the queue is free. Saves that come while the
   * copy still waits only hand it their newer book: it runs once, on the latest. A font that
   * cannot be copied must not stop the save, so this never rejects.
   */
  function queueFontCopy(session: Session, book: Book): Promise<void> {
    const queue = importQueue(session);
    const waiting = waitingFontCopies.has(queue);
    waitingFontCopies.set(queue, book);
    if (waiting) return Promise.resolve();
    return serialize(queue, async () => {
      const latest = waitingFontCopies.get(queue) ?? book;
      waitingFontCopies.delete(queue);
      await ensureFontsInProject(session.dir, latest);
    }).catch((error: unknown) => console.warn('Could not copy the fonts into the album:', error));
  }

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

    [CHANNEL.settingsMenuLanguage]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.settingsMenuLanguage, schemas.none, args);
      return menuLanguage();
    },

    [CHANNEL.settingsSetMenuLanguage]: async (_ctx, ...args) => {
      const [language] = parseArgs(CHANNEL.settingsSetMenuLanguage, schemas.menuLanguage, args);
      await setMenuLanguage(language);
      host.applyMenu(language);
    },

    [CHANNEL.projectDuplicate]: async (_ctx, ...args) => {
      const [dir] = parseArgs(CHANNEL.projectDuplicate, schemas.duplicate, args);
      return duplicateProject(dir);
    },

    [CHANNEL.projectDelete]: async (_ctx, ...args) => {
      const [dir] = parseArgs(CHANNEL.projectDelete, schemas.delete, args);
      await deleteProject(dir, (path) => host.trashItem(path));
    },

    [CHANNEL.projectRename]: async (_ctx, ...args) => {
      const [dir, title] = parseArgs(CHANNEL.projectRename, schemas.rename, args);
      return renameProject(dir, title);
    },

    [CHANNEL.projectPickFolder]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.projectPickFolder, schemas.none, args);
      return host.pickFolder('create');
    },

    [CHANNEL.projectSave]: async (_ctx, ...args) => {
      const [book] = parseArgs(CHANNEL.projectSave, schemas.save, args);
      const session = requireSession();
      // The album carries the fonts its text uses. When no import is running the faces are copied
      // before the book that names them is written. During an import the save does not wait for
      // it: the book is written now and the copy follows the import (a save waiting behind 400
      // photos would never show "Enregistré", and the close-time save would time out).
      const queue = importQueue(session);
      const importing = isBusy(queue);
      const fonts = carriesLibraryFonts(book) ? queueFontCopy(session, book) : undefined;
      if (!importing) await fonts;
      const retitled = book.title !== session.book.title;
      await saveBook(session.dir, book);
      recordBook(session, book);
      // A title changed in the editor shows on the home screen too.
      if (retitled) {
        await retitleRecentProject(session.dir, book.title).catch((error: unknown) =>
          console.warn('Could not update the recent projects list:', error),
        );
      }
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
      const session = requireSession();
      const book = await readSnapshot(session.dir, id);
      // Assets pruned from book.json since (an unreferenced map geometry) still sit in assets/:
      // index them so the preview and a restore can load them through tb://asset.
      recordAssets(session, Object.values(book.assets));
      return book;
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

    [CHANNEL.assetsFromSvg]: async (_ctx, ...args) => {
      const [svg, meta] = parseArgs(CHANNEL.assetsFromSvg, schemas.fromSvg, args);
      const session = requireSession();
      return serialize(importQueue(session), async () => {
        const asset = await assetFromSvg(session.dir, svg, meta);
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
      const files = await expandLibraryPaths(kind, paths).catch((error: unknown) => {
        throw new Error(describeError(error), { cause: error });
      });
      for (const path of files) {
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

    [CHANNEL.fontsList]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.fontsList, schemas.none, args);
      return listFonts();
    },

    [CHANNEL.fontsSearch]: async (_ctx, ...args) => {
      const [q] = parseArgs(CHANNEL.fontsSearch, schemas.fontQuery, args);
      return viaSource(() => searchCatalogue(q, () => host.version()));
    },

    [CHANNEL.fontsAdd]: async (_ctx, ...args) => {
      const [id] = parseArgs(CHANNEL.fontsAdd, schemas.fontId, args);
      return viaSource(() => addFromCatalogue(id, () => host.version()));
    },

    [CHANNEL.fontsPick]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.fontsPick, schemas.none, args);
      return host.pickFont();
    },

    [CHANNEL.fontsImport]: async (_ctx, ...args) => {
      const [path] = parseArgs(CHANNEL.fontsImport, schemas.fontPath, args);
      try {
        return await importFontFile(path);
      } catch (error) {
        throw new Error(`${basename(path)}: ${describeError(error)}`, { cause: error });
      }
    },

    [CHANNEL.fontsAssetsFor]: async (_ctx, ...args) => {
      const [families] = parseArgs(CHANNEL.fontsAssetsFor, schemas.fontFamilies, args);
      const session = requireSession();
      return serialize(importQueue(session), async () => {
        const book = { ...session.book, assets: knownAssets(session) };
        const refs = await fontAssetsFor(session.dir, book, families);
        recordAssets(session, refs);
        return refs;
      });
    },

    [CHANNEL.stickersSets]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.stickersSets, schemas.none, args);
      return (await getStickerService(() => host.version())).sets();
    },

    [CHANNEL.stickersCategories]: async (_ctx, ...args) => {
      const [setId] = parseArgs(CHANNEL.stickersCategories, schemas.setId, args);
      return (await getStickerService(() => host.version())).categories(setId);
    },

    [CHANNEL.stickersSources]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.stickersSources, schemas.none, args);
      return (await getStickerService(() => host.version())).sources();
    },

    [CHANNEL.stickersSearch]: async (_ctx, ...args) => {
      const [query] = parseArgs(CHANNEL.stickersSearch, schemas.stickerSearch, args);
      const service = await getStickerService(() => host.version());
      return viaSource(() => service.search(query));
    },

    [CHANNEL.stickersAdd]: async (_ctx, ...args) => {
      const [ref] = parseArgs(CHANNEL.stickersAdd, schemas.stickerRef, args);
      const service = await getStickerService(() => host.version());
      return viaSource(() => service.add(ref));
    },

    [CHANNEL.stickersAddBytes]: async (_ctx, ...args) => {
      const [name, bytes] = parseArgs(CHANNEL.stickersAddBytes, schemas.stickerBytes, args);
      const service = await getStickerService(() => host.version());
      return viaSource(() => service.addBytes(name, bytes));
    },

    [CHANNEL.stickersIsOpaque]: async (_ctx, ...args) => {
      const [ref] = parseArgs(CHANNEL.stickersIsOpaque, schemas.stickerRef, args);
      return (await getStickerService(() => host.version())).isOpaque(ref);
    },

    [CHANNEL.stickersSetKey]: async (_ctx, ...args) => {
      const [sourceId, key] = parseArgs(CHANNEL.stickersSetKey, schemas.sourceKey, args);
      await (await getStickerService(() => host.version())).setKey(sourceId, key);
    },

    [CHANNEL.mapsSaveGeometry]: async (_ctx, ...args) => {
      const [json, meta] = parseArgs(CHANNEL.mapsSaveGeometry, schemas.mapGeometry, args);
      const session = requireSession();
      return serialize(importQueue(session), async () => {
        const asset = await saveGeometryAsset(session.dir, json, meta);
        recordAssets(session, [asset]);
        return asset;
      });
    },

    [CHANNEL.mapsLoadPack]: async (_ctx, ...args) => {
      const [subjectId] = parseArgs(CHANNEL.mapsLoadPack, schemas.subjectId, args);
      return loadPack(subjectId, () => host.version());
    },

    [CHANNEL.mapsListStyles]: async (_ctx, ...args) => {
      parseArgs(CHANNEL.mapsListStyles, schemas.none, args);
      return listUserStyles();
    },

    [CHANNEL.mapsSaveStyle]: async (_ctx, ...args) => {
      const [name, style] = parseArgs(CHANNEL.mapsSaveStyle, schemas.styleSave, args);
      return saveUserStyle(name, style);
    },

    [CHANNEL.mapsRenameStyle]: async (_ctx, ...args) => {
      const [id, name] = parseArgs(CHANNEL.mapsRenameStyle, schemas.styleRename, args);
      await renameUserStyle(id, name);
    },

    [CHANNEL.mapsDeleteStyle]: async (_ctx, ...args) => {
      const [id] = parseArgs(CHANNEL.mapsDeleteStyle, schemas.styleId, args);
      await deleteUserStyle(id);
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
        fonts: bundledFontFiles(fontFamiliesUsed(book)),
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
