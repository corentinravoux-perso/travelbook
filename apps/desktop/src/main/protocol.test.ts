import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  handleTbRequest,
  projectFilePath,
  resolveTbUrl,
  type PathFlavour,
  type TbAssetEntry,
  type TbHandlerDeps,
  type TbRoots,
} from './protocol';

interface Layout {
  flavour: PathFlavour;
  sep: string;
  projectDir: string;
  libraryDir: string;
  resourcesDir: string;
}

const POSIX: Layout = {
  flavour: 'posix',
  sep: '/',
  projectDir: '/home/corentin/Albums/Été 2026/mon livre.travelbook',
  libraryDir: '/home/corentin/.config/travelbook/library',
  resourcesDir: '/opt/travelbook/resources',
};

const WINDOWS: Layout = {
  flavour: 'win32',
  sep: '\\',
  projectDir: 'C:\\Users\\Corentin\\Documents\\Été 2026\\mon livre.travelbook',
  libraryDir: 'C:\\Users\\Corentin\\AppData\\Roaming\\travelbook\\library',
  resourcesDir: 'C:\\Program Files\\travelbook\\resources',
};

const UNC: Layout = {
  ...WINDOWS,
  projectDir: '\\\\nas\\albums\\Été 2026\\mon livre.travelbook',
};

/** A macOS folder name: "É" stored as E + combining acute, as HFS+/APFS hand it back. */
const NFD: Layout = {
  ...POSIX,
  projectDir: `/Users/corentin/${'Été 2026'.normalize('NFD')}/mon livre.travelbook`,
};

const ASSETS: Record<string, TbAssetEntry> = {
  abc: { file: 'originals/abc.jpg', proxies: true },
  stk: { file: 'assets/stk.png', proxies: false },
  fnt: { file: 'assets/fnt.woff2', proxies: false },
  // Entries as a hostile `book.json` could describe them.
  up: { file: '../../etc/passwd', proxies: true },
  deep: { file: 'originals/../../x.jpg', proxies: false },
  abs: { file: '/etc/passwd', proxies: false },
  winabs: { file: 'D:\\secrets\\x.jpg', proxies: false },
  drive: { file: 'D:x.jpg', proxies: false },
  ads: { file: 'originals/abc.jpg:stream', proxies: false },
  cache: { file: 'cache/abc.thumb.jpg', proxies: false },
  book: { file: 'book.json', proxies: false },
  top: { file: 'originals', proxies: false },
};

function rootsFor(layout: Layout, projectOpen = true): TbRoots {
  return {
    projectDir: projectOpen ? layout.projectDir : null,
    libraryDir: layout.libraryDir,
    resourcesDir: layout.resourcesDir,
    asset: (id) => (Object.hasOwn(ASSETS, id) ? ASSETS[id] : undefined),
    libraryFile: (id) => (id === 'lib1' ? 'files/lib1.png' : undefined),
    coverDir: (id) => (id === 'cov1' ? layout.projectDir : undefined),
    exportJob: (token) =>
      token === 'tok1'
        ? {
            dir: at(layout, layout.projectDir, 'tmp'),
            projectDir: layout.projectDir,
            assetFile: (id) => (Object.hasOwn(ASSETS, id) ? ASSETS[id]?.file : undefined),
          }
        : undefined,
  };
}

const sut =
  (layout: Layout) =>
  (url: string, projectOpen = true) =>
    resolveTbUrl(url, rootsFor(layout, projectOpen), layout.flavour);

/** The path a resolver must produce: `parts` joined with the separator of `layout`. */
const at = (layout: Layout, ...parts: string[]): string => parts.join(layout.sep);

describe.each([
  ['POSIX', POSIX],
  ['Windows (drive letter)', WINDOWS],
  ['Windows (UNC share)', UNC],
  ['POSIX (decomposed accents)', NFD],
])('resolveTbUrl, %s paths', (_name, layout) => {
  const resolve = sut(layout);

  describe('tb://export', () => {
    it('maps a derivative onto the folder of the export', () => {
      expect(resolve('tb://export/tok1/0123abcd.jpg')).toEqual({
        ok: true,
        path: at(layout, layout.projectDir, 'tmp', '0123abcd.jpg'),
        root: at(layout, layout.projectDir, 'tmp'),
      });
    });

    it('maps an original onto the project, through the album of the export', () => {
      expect(resolve('tb://export/tok1/original/abc')).toEqual({
        ok: true,
        path: at(layout, layout.projectDir, 'originals', 'abc.jpg'),
        root: layout.projectDir,
      });
      expect(resolve('tb://export/tok1/original/up')).toMatchObject({ ok: false, status: 404 });
      expect(resolve('tb://export/tok1/original/nope')).toMatchObject({ ok: false, status: 404 });
    });

    it('answers 404 for a token no export runs under', () => {
      expect(resolve('tb://export/other/a.jpg')).toMatchObject({ ok: false, status: 404 });
    });

    it('refuses what leaves the folder or is not a plain name', () => {
      for (const url of [
        'tb://export/tok1/..%2Fbook.json',
        'tb://export/tok1/%2e%2e/x.jpg',
        'tb://export/tok1/a%2Fb.jpg',
        'tb://export/tok1/original/..%2Fx',
        'tb://export/tok1/other/abc',
        'tb://export/tok1/original/abc/more',
        'tb://export/tok1',
        'tb://export/',
      ]) {
        expect(resolve(url), url).toMatchObject({ ok: false });
      }
    });
  });

  describe('tb://cover', () => {
    it('maps a cover id main handed out to the thumbnail in cache/', () => {
      expect(resolve('tb://cover/cov1?v=123')).toEqual({
        ok: true,
        path: at(layout, layout.projectDir, 'cache', 'cover-thumb.jpg'),
        root: layout.projectDir,
      });
    });

    it('answers 404 for an id main did not hand out, even a well-formed one', () => {
      expect(resolve('tb://cover/other')).toMatchObject({ ok: false, status: 404 });
    });

    it('refuses an id that is not a plain identifier, and extra path segments', () => {
      expect(resolve('tb://cover/..%2Fx')).toMatchObject({ ok: false, status: 400 });
      expect(resolve('tb://cover/cov1/more')).toMatchObject({ ok: false, status: 400 });
      expect(resolve('tb://cover/')).toMatchObject({ ok: false, status: 400 });
    });
  });

  describe('tb://asset', () => {
    it('maps a thumbnail to cache/<id>.thumb.jpg', () => {
      expect(resolve('tb://asset/abc?v=thumb')).toEqual({
        ok: true,
        path: at(layout, layout.projectDir, 'cache', 'abc.thumb.jpg'),
        root: layout.projectDir,
        proxyOf: 'abc',
      });
    });

    it('maps a preview to cache/<id>.preview.jpg', () => {
      expect(resolve('tb://asset/abc?v=preview')).toEqual({
        ok: true,
        path: at(layout, layout.projectDir, 'cache', 'abc.preview.jpg'),
        root: layout.projectDir,
        proxyOf: 'abc',
      });
    });

    it('maps the original through the asset index', () => {
      expect(resolve('tb://asset/abc?v=original')).toEqual({
        ok: true,
        path: at(layout, layout.projectDir, 'originals', 'abc.jpg'),
        root: layout.projectDir,
      });
    });

    it('serves an asset that has no proxies as itself for every variant', () => {
      for (const v of ['thumb', 'preview', 'original']) {
        expect(resolve(`tb://asset/stk?v=${v}`)).toEqual({
          ok: true,
          path: at(layout, layout.projectDir, 'assets', 'stk.png'),
          root: layout.projectDir,
        });
      }
    });

    it('keeps the project folder name byte for byte', () => {
      const r = resolve('tb://asset/abc?v=original');
      expect(r.ok && r.path.startsWith(layout.projectDir)).toBe(true);
    });

    it('ignores the fragment and unrelated query parameters', () => {
      const r = resolve('tb://asset/abc?t=1&v=thumb#x');
      expect(r.ok && r.path.endsWith('abc.thumb.jpg')).toBe(true);
    });

    it('accepts any letter case in the scheme and host', () => {
      expect(resolve('TB://Asset/abc?v=thumb').ok).toBe(true);
    });

    it.each(['', '?v=', '?v=big', '?v=THUMB', '?v=thumb&v=original', '?w=thumb', '?v=../x'])(
      'rejects the variant %j with 400',
      (query) => {
        expect(resolve(`tb://asset/abc${query}`)).toMatchObject({ ok: false, status: 400 });
      },
    );

    it.each([
      ['dot-dot', 'tb://asset/..?v=original'],
      ['dot', 'tb://asset/.?v=original'],
      ['dot-dot then name', 'tb://asset/../abc?v=original'],
      ['name then dot-dot', 'tb://asset/abc/..?v=original'],
      ['two segments', 'tb://asset/a/b?v=original'],
      ['trailing slash', 'tb://asset/abc/?v=original'],
      ['empty id', 'tb://asset/?v=original'],
      ['no path', 'tb://asset?v=original'],
      ['absolute path', 'tb://asset//etc/passwd?v=original'],
      ['absolute path as id', 'tb://asset/%2Fetc%2Fpasswd?v=original'],
      ['encoded dot-dot', 'tb://asset/%2e%2e?v=original'],
      ['encoded dot-dot, capitals', 'tb://asset/%2E%2E?v=original'],
      ['half-encoded dot-dot', 'tb://asset/.%2e?v=original'],
      ['encoded slash', 'tb://asset/a%2fb?v=original'],
      ['encoded slash, capitals', 'tb://asset/a%2Fb?v=original'],
      ['dot-dot with encoded slash', 'tb://asset/..%2f..%2fetc%2fpasswd?v=thumb'],
      ['encoded backslash', 'tb://asset/a%5cb?v=original'],
      ['raw backslash', 'tb://asset/a\\b?v=original'],
      ['dot-dot with backslash', 'tb://asset/..\\..\\x?v=original'],
      ['encoded NUL', 'tb://asset/abc%00?v=original'],
      ['encoded newline', 'tb://asset/abc%0a?v=original'],
      ['double encoding', 'tb://asset/%252e%252e?v=original'],
      ['encoded percent', 'tb://asset/abc%25?v=original'],
      ['malformed escape', 'tb://asset/%E0%A4%A?v=original'],
      ['lone percent', 'tb://asset/%?v=original'],
      ['encoded colon', 'tb://asset/C%3A?v=original'],
      ['space', 'tb://asset/a%20b?v=original'],
      ['dot in the id', 'tb://asset/abc.jpg?v=original'],
      ['non-ASCII id', 'tb://asset/%C3%A9t%C3%A9?v=original'],
      ['overlong id', `tb://asset/${'a'.repeat(129)}?v=original`],
    ])('rejects %s with 400', (_label, url) => {
      expect(resolve(url)).toMatchObject({ ok: false, status: 400 });
    });

    it('answers 404 for an id the project does not hold', () => {
      expect(resolve('tb://asset/nope?v=thumb')).toMatchObject({ ok: false, status: 404 });
      // Names that exist on every object.
      expect(resolve('tb://asset/constructor?v=thumb')).toMatchObject({ ok: false, status: 404 });
      expect(resolve('tb://asset/__proto__?v=thumb')).toMatchObject({ ok: false, status: 404 });
    });

    it('answers 404 when no project is open', () => {
      expect(resolve('tb://asset/abc?v=thumb', false)).toMatchObject({ ok: false, status: 404 });
    });

    it.each(Object.keys(ASSETS).filter((id) => !['abc', 'stk', 'fnt'].includes(id)))(
      'refuses index entry %s, whose file leaves originals/ and assets/',
      (id) => {
        for (const v of ['thumb', 'preview', 'original']) {
          expect(resolve(`tb://asset/${id}?v=${v}`)).toMatchObject({ ok: false, status: 404 });
        }
      },
    );
  });

  describe('tb://library', () => {
    it('maps an item through the library index', () => {
      expect(resolve('tb://library/lib1')).toEqual({
        ok: true,
        path: at(layout, layout.libraryDir, 'files', 'lib1.png'),
        root: layout.libraryDir,
      });
    });

    it('answers 404 for an unknown item', () => {
      expect(resolve('tb://library/nope')).toMatchObject({ ok: false, status: 404 });
    });

    it.each(['..', '%2e%2e', 'lib1/..', '../lib1', 'a%2fb', 'a%5cb', '', 'lib1/x'])(
      'rejects the item id %j with 400',
      (id) => {
        expect(resolve(`tb://library/${id}`)).toMatchObject({ ok: false, status: 400 });
      },
    );
  });

  describe('tb://resource', () => {
    it('maps a path below the bundled resources', () => {
      expect(resolve('tb://resource/fonts/Inter/Inter-Regular.woff2')).toEqual({
        ok: true,
        path: at(layout, layout.resourcesDir, 'fonts', 'Inter', 'Inter-Regular.woff2'),
        root: layout.resourcesDir,
      });
    });

    it('decodes an accented, spaced file name', () => {
      expect(resolve('tb://resource/stickers/%C3%89t%C3%A9%20n%C2%B01.png')).toEqual({
        ok: true,
        path: at(layout, layout.resourcesDir, 'stickers', 'Été n°1.png'),
        root: layout.resourcesDir,
      });
    });

    it.each([
      ['dot-dot', 'tb://resource/../secret'],
      ['nested dot-dot', 'tb://resource/fonts/../../secret'],
      ['encoded dot-dot', 'tb://resource/%2e%2e/secret'],
      ['encoded dot-dot, capitals', 'tb://resource/%2E%2E/secret'],
      ['encoded slash after dot-dot', 'tb://resource/..%2fsecret'],
      ['encoded dot-dot and slash', 'tb://resource/%2e%2e%2fsecret'],
      ['encoded dot-dot behind a folder', 'tb://resource/fonts/%2e%2e%2f%2e%2e%2fsecret'],
      ['dot segment', 'tb://resource/./fonts/x.woff2'],
      ['empty segment', 'tb://resource/fonts//x.woff2'],
      ['absolute POSIX path', 'tb://resource//etc/passwd'],
      ['absolute POSIX path, encoded', 'tb://resource/%2Fetc%2Fpasswd'],
      ['drive letter', 'tb://resource/C:/Windows/win.ini'],
      ['drive letter, encoded', 'tb://resource/C%3A/Windows/win.ini'],
      ['UNC path', 'tb://resource//server/share/x'],
      ['alternate data stream', 'tb://resource/fonts/x.woff2:stream'],
      ['backslash separator', 'tb://resource/fonts\\..\\..\\secret'],
      ['encoded backslash', 'tb://resource/fonts%5c..%5c..%5csecret'],
      ['double encoding', 'tb://resource/%252e%252e/secret'],
      ['encoded NUL', 'tb://resource/fonts/x.woff2%00.png'],
      ['malformed escape', 'tb://resource/%E0%A4%A'],
      ['empty path', 'tb://resource/'],
      ['no path', 'tb://resource'],
    ])('rejects %s with 400', (_label, url) => {
      expect(resolve(url)).toMatchObject({ ok: false, status: 400 });
    });
  });

  describe('the URL itself', () => {
    it.each([
      ['an unknown host', 'tb://evil/abc?v=thumb'],
      ['user information', 'tb://asset@evil/abc?v=thumb'],
      ['a port', 'tb://asset:80/abc?v=thumb'],
      ['an empty host', 'tb:///abc?v=thumb'],
      ['a host with a suffix', 'tb://asset.evil/abc?v=thumb'],
    ])('answers 404 for %s', (_label, url) => {
      expect(resolve(url)).toMatchObject({ ok: false, status: 404 });
    });

    it.each([
      'http://asset/abc?v=thumb',
      'file:///etc/passwd',
      'tb:asset/abc?v=thumb',
      'tb:/asset/abc?v=thumb',
      'xtb://asset/abc?v=thumb',
      ' tb://asset/abc?v=thumb',
      '',
      'not a url',
    ])('rejects %j with 400', (url) => {
      expect(resolve(url)).toMatchObject({ ok: false, status: 400 });
    });
  });
});

describe('resolveTbUrl, hostile roots', () => {
  it('refuses a relative project folder instead of resolving it against the working directory', () => {
    const roots = { ...rootsFor(POSIX), projectDir: 'relative/project' };
    expect(resolveTbUrl('tb://asset/abc?v=original', roots, 'posix')).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it('defaults to the path flavour of the running platform', () => {
    const roots = rootsFor(process.platform === 'win32' ? WINDOWS : POSIX);
    expect(resolveTbUrl('tb://asset/abc?v=original', roots)).toMatchObject({ ok: true });
  });
});

describe('Windows paths on every platform', () => {
  it('resolves a forward-slash file name from book.json on a Windows project', () => {
    expect(resolveTbUrl('tb://asset/abc?v=original', rootsFor(WINDOWS), 'win32')).toMatchObject({
      ok: true,
      path: `${WINDOWS.projectDir}\\originals\\abc.jpg`,
    });
  });

  it('keeps a Windows project folder that contains a dot-dot-looking name', () => {
    const layout: Layout = { ...WINDOWS, projectDir: 'C:\\Albums\\..été\\mon livre.travelbook' };
    expect(resolveTbUrl('tb://asset/abc?v=thumb', rootsFor(layout), 'win32')).toMatchObject({
      ok: true,
      path: 'C:\\Albums\\..été\\mon livre.travelbook\\cache\\abc.thumb.jpg',
    });
  });
});

describe('projectFilePath', () => {
  it('returns the absolute path of a file below originals/ or assets/', () => {
    expect(projectFilePath(POSIX.projectDir, 'originals/abc.jpg', 'posix')).toBe(
      `${POSIX.projectDir}/originals/abc.jpg`,
    );
    expect(projectFilePath(WINDOWS.projectDir, 'assets/x.png', 'win32')).toBe(
      `${WINDOWS.projectDir}\\assets\\x.png`,
    );
  });

  it.each(['../x.jpg', '/etc/passwd', 'originals', 'cache/a.jpg', 'originals/../cache/a.jpg', ''])(
    'returns null for %j',
    (file) => {
      expect(projectFilePath(POSIX.projectDir, file, 'posix')).toBeNull();
    },
  );
});

describe('handleTbRequest', () => {
  let work: string;
  let project: string;
  let library: string;
  let resources: string;
  let outside: string;

  beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), 'tb-protocol-'));
    // The project folder name has spaces and accents on purpose.
    project = join(work, 'Été 2026', 'mon livre.travelbook');
    library = join(work, 'library');
    resources = join(work, 'resources');
    outside = join(work, 'outside');
    for (const dir of ['originals', 'assets', 'cache'].map((d) => join(project, d))) {
      await mkdir(dir, { recursive: true });
    }
    await mkdir(join(library, 'files'), { recursive: true });
    await mkdir(join(resources, 'fonts'), { recursive: true });
    await mkdir(outside, { recursive: true });
  });

  afterEach(async () => {
    await rm(work, { recursive: true, force: true });
  });

  interface TestDeps extends TbHandlerDeps {
    fetchFile: Mock<TbHandlerDeps['fetchFile']>;
    ensureProxy: Mock<TbHandlerDeps['ensureProxy']>;
  }

  function deps(overrides: Partial<TbHandlerDeps> = {}): TestDeps {
    const assets: Record<string, TbAssetEntry> = {
      abc: { file: 'originals/abc.jpg', proxies: true },
      stk: { file: 'assets/stk.svg', proxies: false },
      link: { file: 'originals/link.jpg', proxies: false },
    };
    return {
      roots: () => ({
        projectDir: project,
        libraryDir: library,
        resourcesDir: resources,
        asset: (id) => (Object.hasOwn(assets, id) ? assets[id] : undefined),
        libraryFile: (id) => (id === 'lib1' ? 'files/lib1.png' : undefined),
      }),
      ensureProxy: vi.fn<TbHandlerDeps['ensureProxy']>(async () => undefined),
      fetchFile: vi.fn<TbHandlerDeps['fetchFile']>(
        async (path) =>
          new Response(await readFile(path), { headers: { 'content-type': 'image/jpeg' } }),
      ),
      ...overrides,
    } as TestDeps;
  }

  const get = (url: string, method = 'GET') => ({ url, method });

  it('serves an existing thumbnail without rendering anything', async () => {
    await writeFile(join(project, 'cache', 'abc.thumb.jpg'), 'THUMB');
    const d = deps();
    const res = await handleTbRequest(get('tb://asset/abc?v=thumb'), d);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('THUMB');
    expect(d.ensureProxy).not.toHaveBeenCalled();
  });

  it('renders a missing thumbnail first, then serves it', async () => {
    const d = deps({
      ensureProxy: vi.fn(async (id: string) => {
        await writeFile(join(project, 'cache', `${id}.thumb.jpg`), 'RENDERED');
      }),
    });
    const res = await handleTbRequest(get('tb://asset/abc?v=thumb'), d);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('RENDERED');
    expect(d.ensureProxy).toHaveBeenCalledExactlyOnceWith('abc');
  });

  it('answers 404 when the original is gone and no proxy can be made', async () => {
    const d = deps({
      ensureProxy: vi.fn(async () => {
        throw new Error('Input file is missing');
      }),
    });
    const res = await handleTbRequest(get('tb://asset/abc?v=preview'), d);
    expect(res.status).toBe(404);
    expect(d.fetchFile).not.toHaveBeenCalled();
  });

  it('serves the original of a photo and of an asset that has no proxies', async () => {
    await writeFile(join(project, 'originals', 'abc.jpg'), 'ORIGINAL');
    await writeFile(join(project, 'assets', 'stk.svg'), '<svg/>');
    const d = deps();
    expect(await (await handleTbRequest(get('tb://asset/abc?v=original'), d)).text()).toBe(
      'ORIGINAL',
    );
    expect(await (await handleTbRequest(get('tb://asset/stk?v=thumb'), d)).text()).toBe('<svg/>');
    expect(d.ensureProxy).not.toHaveBeenCalled();
  });

  it('answers 404 when the original is missing from disk', async () => {
    const res = await handleTbRequest(get('tb://asset/abc?v=original'), deps());
    expect(res.status).toBe(404);
  });

  it('serves library items and bundled resources', async () => {
    await writeFile(join(library, 'files', 'lib1.png'), 'LIB');
    await writeFile(join(resources, 'fonts', 'Inter.woff2'), 'FONT');
    const d = deps();
    expect(await (await handleTbRequest(get('tb://library/lib1'), d)).text()).toBe('LIB');
    expect(await (await handleTbRequest(get('tb://resource/fonts/Inter.woff2'), d)).text()).toBe(
      'FONT',
    );
  });

  it('forwards the resolver rejections as responses and reads nothing', async () => {
    const d = deps();
    for (const [url, status] of [
      ['tb://asset/..?v=original', 400],
      ['tb://asset/%2e%2e%2f%2e%2e%2fetc%2fpasswd?v=original', 400],
      ['tb://resource/../outside/x', 400],
      ['tb://asset/unknown?v=thumb', 404],
      ['tb://evil/x', 404],
    ] as const) {
      expect((await handleTbRequest(get(url), d)).status).toBe(status);
    }
    expect(d.fetchFile).not.toHaveBeenCalled();
    expect(d.ensureProxy).not.toHaveBeenCalled();
  });

  it('allows GET and HEAD only', async () => {
    await writeFile(join(project, 'originals', 'abc.jpg'), 'ORIGINAL');
    const d = deps();
    expect((await handleTbRequest(get('tb://asset/abc?v=original', 'HEAD'), d)).status).toBe(200);
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await handleTbRequest(get('tb://asset/abc?v=original', method), d);
      expect(res.status).toBe(405);
    }
  });

  it('adds the headers that keep a served file inert', async () => {
    await writeFile(join(project, 'originals', 'abc.jpg'), 'ORIGINAL');
    const res = await handleTbRequest(get('tb://asset/abc?v=original'), deps());
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('answers 500, not an exception, when the file cannot be read', async () => {
    await writeFile(join(project, 'originals', 'abc.jpg'), 'ORIGINAL');
    const d = deps({
      fetchFile: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const res = await handleTbRequest(get('tb://asset/abc?v=original'), d);
    expect(res.status).toBe(500);
  });

  it.skipIf(process.platform === 'win32')(
    'refuses a file that is a symbolic link to somewhere outside the project',
    async () => {
      await writeFile(join(outside, 'secret.jpg'), 'SECRET');
      await symlink(join(outside, 'secret.jpg'), join(project, 'originals', 'link.jpg'));
      const d = deps();
      const res = await handleTbRequest(get('tb://asset/link?v=original'), d);
      expect(res.status).toBe(404);
      expect(d.fetchFile).not.toHaveBeenCalled();
    },
  );

  it.skipIf(process.platform === 'win32')(
    'refuses a resource folder that is a symbolic link out of the resources',
    async () => {
      await writeFile(join(outside, 'secret.txt'), 'SECRET');
      await symlink(outside, join(resources, 'linked'));
      const res = await handleTbRequest(get('tb://resource/linked/secret.txt'), deps());
      expect(res.status).toBe(404);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'serves a project that is itself reached through a symbolic link',
    async () => {
      const alias = join(work, 'alias.travelbook');
      await symlink(project, alias);
      await writeFile(join(project, 'originals', 'abc.jpg'), 'ORIGINAL');
      const d = deps();
      const roots = d.roots();
      d.roots = () => ({ ...roots, projectDir: alias });
      expect(await (await handleTbRequest(get('tb://asset/abc?v=original'), d)).text()).toBe(
        'ORIGINAL',
      );
    },
  );
});
