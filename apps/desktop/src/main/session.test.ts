import { newBook, type AssetRef } from '@travelbook/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeSession,
  currentSession,
  knownAssets,
  openSession,
  recordAssets,
  recordBook,
  requireSession,
  setLibraryFileLookup,
  tbRoots,
} from './session';

const asset = (id: string, kind: AssetRef['kind'] = 'photo', file = `originals/${id}.jpg`) =>
  ({ id, kind, file, originalName: `${id}.jpg`, sha256: id.repeat(4) }) satisfies AssetRef;

afterEach(() => {
  closeSession();
  setLibraryFileLookup(null);
});

describe('session', () => {
  it('has no project until one is opened', () => {
    expect(currentSession()).toBeNull();
    expect(() => requireSession()).toThrow(/No project is open/);
  });

  it('indexes the assets of the book it is opened with', () => {
    const book = { ...newBook({ title: 'A' }), assets: { a1: asset('a1') } };
    const session = openSession('/p/a.travelbook', book);
    expect(currentSession()).toBe(session);
    expect(requireSession().dir).toBe('/p/a.travelbook');
    expect(knownAssets(session)).toEqual({ a1: asset('a1') });
  });

  it('replaces the previous project when another is opened', () => {
    const first = openSession('/p/a.travelbook', newBook({ title: 'A' }));
    recordAssets(first, [asset('a1')]);
    const second = openSession('/p/b.travelbook', newBook({ title: 'B' }));
    expect(currentSession()).toBe(second);
    expect(knownAssets(second)).toEqual({});
  });

  it('keeps imported assets until the project is closed, even when a save does not list them', () => {
    const session = openSession('/p/a.travelbook', newBook({ title: 'A' }));
    recordAssets(session, [asset('a1')]);
    // The renderer saves before it has added the import to its book.
    recordBook(session, newBook({ title: 'A2' }));
    expect(Object.keys(knownAssets(session))).toEqual(['a1']);
    expect(session.book.title).toBe('A2');
    recordBook(session, { ...newBook({ title: 'A3' }), assets: { a2: asset('a2') } });
    expect(Object.keys(knownAssets(session)).sort()).toEqual(['a1', 'a2']);
  });

  it('lets a later record of the same id replace the earlier one', () => {
    const session = openSession('/p/a.travelbook', newBook({ title: 'A' }));
    recordAssets(session, [asset('a1', 'photo', 'originals/a1.jpg')]);
    recordAssets(session, [asset('a1', 'photo', 'originals/a1.png')]);
    expect(knownAssets(session)['a1']?.file).toBe('originals/a1.png');
  });

  it('describes the open project as the roots of the tb: scheme', () => {
    const book = {
      ...newBook({ title: 'A' }),
      assets: { a1: asset('a1'), s1: asset('s1', 'sticker', 'assets/s1.png') },
    };
    const session = openSession('/p/a.travelbook', book);
    setLibraryFileLookup((id) => (id === 'l1' ? 'files/l1.png' : undefined));
    const roots = tbRoots(session, { libraryDir: '/lib', resourcesDir: '/res' });
    expect(roots).toMatchObject({
      projectDir: '/p/a.travelbook',
      libraryDir: '/lib',
      resourcesDir: '/res',
    });
    expect(roots.asset('a1')).toEqual({ file: 'originals/a1.jpg', proxies: true });
    expect(roots.asset('s1')).toEqual({ file: 'assets/s1.png', proxies: false });
    expect(roots.asset('zz')).toBeUndefined();
    expect(roots.libraryFile('l1')).toBe('files/l1.png');
    expect(roots.libraryFile('l2')).toBeUndefined();
  });

  it('describes no project as no project dir', () => {
    expect(tbRoots(null, { libraryDir: '/lib', resourcesDir: '/res' })).toMatchObject({
      projectDir: null,
    });
    expect(tbRoots(null, { libraryDir: '/lib', resourcesDir: '/res' }).asset('a1')).toBeUndefined();
  });

  it('does not expose names every object has as assets', () => {
    const session = openSession('/p/a.travelbook', newBook({ title: 'A' }));
    const roots = tbRoots(session, { libraryDir: '/lib', resourcesDir: '/res' });
    expect(roots.asset('constructor')).toBeUndefined();
    expect(roots.asset('__proto__')).toBeUndefined();
  });
});
