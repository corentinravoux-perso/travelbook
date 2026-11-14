import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, posix, relative, sep, win32 } from 'node:path';
import type { Protocol } from 'electron';

/**
 * The `tb:` URL scheme the renderer loads project files through:
 *
 *   tb://asset/<assetId>?v=thumb|preview|original   a file of the open project
 *   tb://library/<itemId>                           a file of the user library
 *   tb://resource/<path>                            a bundled resource
 *
 * Nothing else reads files for the renderer, so everything here is about refusing paths that
 * leave the three roots. `resolveTbUrl` is pure (no file system, no Electron): it only maps a
 * URL onto the roots it is given, and it works on the path syntax it is told to (`posix` or
 * `win32`) so that Windows paths can be tested anywhere. `handleTbRequest` adds the file system.
 */

export const TB_SCHEME = 'tb';

/**
 * `standard` lets Chromium parse `tb://host/path` like an https URL and lets the CSP match `tb:`.
 * `secure` makes the scheme usable from a secure page. `supportFetchAPI` and `corsEnabled` allow
 * `fetch('tb://...')`, which the CSP `connect-src` permits. The scheme does not bypass the CSP.
 */
export const TB_PRIVILEGES = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  corsEnabled: true,
} as const;

export type PathFlavour = 'posix' | 'win32';
export type AssetVariant = 'thumb' | 'preview' | 'original';

const VARIANTS: readonly string[] = ['thumb', 'preview', 'original'] satisfies AssetVariant[];

/** What the open project knows about one asset. */
export interface TbAssetEntry {
  /** `AssetRef.file`: relative to the project folder. */
  file: string;
  /** Photos have a thumbnail and a preview; every other asset is served as it is. */
  proxies: boolean;
}

export interface TbRoots {
  /** Absolute folder of the open project, or `null` when none is open. */
  projectDir: string | null;
  /** Absolute folder of the user library. */
  libraryDir: string;
  /** Absolute folder of the bundled resources. */
  resourcesDir: string;
  /** The asset of the open project with this id. */
  asset(id: string): TbAssetEntry | undefined;
  /** The file of this library item, relative to `libraryDir`. */
  libraryFile(id: string): string | undefined;
}

export type TbResolution =
  | {
      ok: true;
      /** Absolute path of the file to serve. */
      path: string;
      /** The folder `path` must stay inside (one of the three roots). */
      root: string;
      /**
       * Set when `path` is a thumbnail or a preview that may not have been rendered yet: the id
       * of the asset to render it for.
       */
      proxyOf?: string;
    }
  | { ok: false; status: 400 | 404; reason: string };

const bad = (reason: string): TbResolution => ({ ok: false, status: 400, reason });
const notFound = (reason: string): TbResolution => ({ ok: false, status: 404, reason });

/** Asset and library item ids: safe in a file name, no dot, no separator. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Folders of the project an asset file may live in. `cache/` holds proxies, never an asset. */
const ASSET_FOLDERS = new Set(['originals', 'assets']);

/**
 * The URL is taken apart by hand, never through `new URL`: the WHATWG parser quietly removes
 * `..` and `%2e%2e` segments, which would hide an escape attempt instead of reporting it.
 */
const URL_PATTERN = /^tb:\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i;

function defaultFlavour(): PathFlavour {
  return process.platform === 'win32' ? 'win32' : 'posix';
}

/**
 * One decoded path segment that is a plain name: no separator, drive colon, control character,
 * and no `%`, so that a doubly encoded `%252e%252e` cannot turn into `..` if some later layer
 * decodes it once more.
 */
function isPlainName(name: string): boolean {
  if (name === '' || name === '.' || name === '..') return false;
  for (const char of name) {
    if (char === '/' || char === '\\' || char === ':' || char === '%') return false;
    if (char.charCodeAt(0) < 0x20) return false;
  }
  return true;
}

/** The decoded segments of a raw URL path (`/a/b`), or `null` when one is not a plain name. */
function pathSegments(rawPath: string): string[] | null {
  if (!rawPath.startsWith('/')) return null;
  const segments: string[] = [];
  for (const raw of rawPath.slice(1).split('/')) {
    let name: string;
    try {
      name = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (!isPlainName(name)) return null;
    segments.push(name);
  }
  return segments;
}

/**
 * `file`, relative to `root`, as an absolute path; `null` when it is absolute, climbs out of
 * `root`, names `root` itself, or (with `folders`) does not start in one of those folders.
 */
function containedPath(
  flavour: PathFlavour,
  root: string,
  file: string,
  folders?: ReadonlySet<string>,
): string | null {
  const p = flavour === 'win32' ? win32 : posix;
  if (!p.isAbsolute(root) || file === '' || p.isAbsolute(file)) return null;
  const path = p.resolve(root, file);
  const rel = p.relative(root, path);
  if (rel === '' || p.isAbsolute(rel)) return null;
  const parts = rel.split(p.sep);
  if (!parts.every(isPlainName)) return null;
  if (folders && (parts.length < 2 || !folders.has(parts[0] as string))) return null;
  return path;
}

/**
 * Absolute path of the file of an asset (`AssetRef.file`). It must lie in `originals/` or
 * `assets/` of the project folder: `book.json` is edited by the renderer, so it is not trusted.
 */
export function projectFilePath(
  projectDir: string,
  file: string,
  flavour: PathFlavour = defaultFlavour(),
): string | null {
  return containedPath(flavour, projectDir, file, ASSET_FOLDERS);
}

function resolveAsset(
  segments: string[],
  query: string,
  roots: TbRoots,
  flavour: PathFlavour,
): TbResolution {
  const id = segments[0];
  if (segments.length !== 1 || id === undefined || !ID_PATTERN.test(id)) {
    return bad('An asset URL names exactly one valid id');
  }
  const variants = new URLSearchParams(query).getAll('v');
  const variant = variants[0];
  if (variants.length !== 1 || variant === undefined || !VARIANTS.includes(variant)) {
    return bad('The variant must be thumb, preview or original');
  }
  const { projectDir } = roots;
  if (projectDir === null) return notFound('No project is open');
  const entry = roots.asset(id);
  if (entry === undefined) return notFound(`Unknown asset: ${id}`);
  // The original is checked for every variant: an index entry that points outside the project
  // is refused outright, whatever it is asked for.
  const original = projectFilePath(projectDir, entry.file, flavour);
  if (original === null) return notFound(`Asset ${id} has no usable file`);
  if (variant === 'original' || !entry.proxies) {
    return { ok: true, path: original, root: projectDir };
  }
  const p = flavour === 'win32' ? win32 : posix;
  return {
    ok: true,
    path: p.join(projectDir, 'cache', `${id}.${variant}.jpg`),
    root: projectDir,
    proxyOf: id,
  };
}

function resolveLibrary(segments: string[], roots: TbRoots, flavour: PathFlavour): TbResolution {
  const id = segments[0];
  if (segments.length !== 1 || id === undefined || !ID_PATTERN.test(id)) {
    return bad('A library URL names exactly one valid id');
  }
  const file = roots.libraryFile(id);
  if (file === undefined) return notFound(`Unknown library item: ${id}`);
  const path = containedPath(flavour, roots.libraryDir, file);
  if (path === null) return notFound(`Library item ${id} has no usable file`);
  return { ok: true, path, root: roots.libraryDir };
}

function resolveResource(segments: string[], roots: TbRoots, flavour: PathFlavour): TbResolution {
  const path = containedPath(flavour, roots.resourcesDir, segments.join('/'));
  if (path === null) return bad('The resource path leaves the bundled resources');
  return { ok: true, path, root: roots.resourcesDir };
}

/**
 * Map a `tb:` URL onto a file of one of the roots. 400 means the URL is malformed or tries to
 * leave the roots; 404 means it is well formed but names nothing the app holds. Never throws.
 */
export function resolveTbUrl(
  url: string,
  roots: TbRoots,
  flavour: PathFlavour = defaultFlavour(),
): TbResolution {
  const match = URL_PATTERN.exec(url);
  if (match === null) return bad('Not a tb:// URL');
  const [, host = '', rawPath = '', query = ''] = match;
  const kind = host.toLowerCase();
  if (kind !== 'asset' && kind !== 'library' && kind !== 'resource') {
    return notFound(`Unknown tb:// host: ${host}`);
  }
  const segments = pathSegments(rawPath);
  if (segments === null) return bad('The URL path is not made of plain names');
  if (kind === 'asset') return resolveAsset(segments, query, roots, flavour);
  if (kind === 'library') return resolveLibrary(segments, roots, flavour);
  return resolveResource(segments, roots, flavour);
}

export interface TbHandlerDeps {
  roots(): TbRoots;
  /** Render the thumbnail and the preview of an asset of the open project when they are missing. */
  ensureProxy(assetId: string): Promise<void>;
  /** The content of a file as a response (Electron's `net.fetch` of a `file:` URL). */
  fetchFile(path: string): Promise<Response>;
  /** Path syntax of the roots; the running platform's when omitted. */
  flavour?: PathFlavour;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const fail = (status: number, reason: string): Response =>
  new Response(reason, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

const isFile = (path: string): Promise<boolean> =>
  stat(path).then(
    (info) => info.isFile(),
    () => false,
  );

/**
 * The real path of `path` (links followed), provided it is a file inside the real path of
 * `root`. A symbolic link inside a project must not lead the renderer to a file outside it.
 */
async function realFileWithin(path: string, root: string): Promise<string | null> {
  try {
    const [real, realRoot] = await Promise.all([realpath(path), realpath(root)]);
    const rel = relative(realRoot, real);
    // `..name` is a legal file name: only a real `..` segment is an escape.
    if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
    return (await isFile(real)) ? real : null;
  } catch {
    return null;
  }
}

/** Added to every file served: a file opened as a page must not be able to run anything. */
function inert(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  headers.set('access-control-allow-origin', '*');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Answer one `tb:` request. Never rejects. */
export async function handleTbRequest(
  request: { url: string; method: string },
  deps: TbHandlerDeps,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return fail(405, 'Only GET and HEAD are allowed');
  }
  try {
    const target = resolveTbUrl(request.url, deps.roots(), deps.flavour);
    if (!target.ok) return fail(target.status, target.reason);
    if (target.proxyOf !== undefined && !(await isFile(target.path))) {
      try {
        await deps.ensureProxy(target.proxyOf);
      } catch (error) {
        return fail(404, `No preview can be made for ${target.proxyOf}: ${messageOf(error)}`);
      }
    }
    const real = await realFileWithin(target.path, target.root);
    if (real === null) return fail(404, 'File not found');
    return inert(await deps.fetchFile(real));
  } catch (error) {
    return fail(500, messageOf(error));
  }
}

/** Serve the `tb:` scheme on `protocol` (after `app` is ready; the scheme must be registered). */
export function installTbProtocol(protocol: Pick<Protocol, 'handle'>, deps: TbHandlerDeps): void {
  protocol.handle(TB_SCHEME, (request) => handleTbRequest(request, deps));
}
