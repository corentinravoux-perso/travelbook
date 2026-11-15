import {
  newBook,
  newElement,
  addElement,
  fillSlot,
  type AssetRef,
  type Book,
} from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import { captureDay, dayLabel, dayState, pickerSections, trayGroups, NO_DATE } from './trayModel';

function photo(id: string, name: string, takenAt?: string): AssetRef {
  return {
    id,
    kind: 'photo',
    file: `originals/${id}.jpg`,
    originalName: name,
    sha256: id,
    pixel: { w: 4000, h: 3000 },
    ...(takenAt ? { exif: { takenAt } } : {}),
  };
}

/** A book holding `assets`, with each id in `placed` put in its own frame on the first spread. */
function bookWith(assets: AssetRef[], placed: string[] = []): Book {
  let book: Book = { ...newBook({ title: 'T', innerSpreads: 2 }), assets: {} };
  book = { ...book, assets: Object.fromEntries(assets.map((a) => [a.id, a])) };
  const spread = book.spreads[0]!.id;
  for (const id of placed) {
    const el = newElement('photo', { x: 0, y: 0, w: 10, h: 10 });
    book = fillSlot(addElement(book, spread, el), spread, el.id, id);
  }
  return book;
}

const names = (groups: ReturnType<typeof trayGroups>) =>
  groups.map((g) => [g.key, g.photos.map((p) => p.originalName)]);

describe('captureDay', () => {
  it('reads the camera wall-clock day, whatever the offset', () => {
    expect(captureDay(photo('a', 'a.jpg', '2026-06-10T23:50:00'))).toBe('2026-06-10');
    expect(captureDay(photo('a', 'a.jpg', '2026-06-10T23:50:00+09:00'))).toBe('2026-06-10');
  });
  it('is null without a usable date', () => {
    expect(captureDay(photo('a', 'a.jpg'))).toBeNull();
    expect(captureDay(photo('a', 'a.jpg', 'yesterday'))).toBeNull();
  });
});

describe('dayLabel', () => {
  it('writes the day in French with its weekday', () => {
    expect(dayLabel('2026-06-11')).toBe('jeudi 11 juin 2026');
    expect(dayLabel('2026-01-01')).toBe('jeudi 1 janvier 2026');
  });
});

describe('trayGroups', () => {
  const assets = [
    photo('c', 'IMG_10.jpg', '2026-06-11T09:00:00'),
    photo('a', 'IMG_2.jpg', '2026-06-10T16:00:00'),
    photo('b', 'IMG_1.jpg', '2026-06-10T08:00:00'),
    photo('n', 'scan.png'),
    photo('m', 'carte.png'),
  ];
  const book = bookWith(assets, ['a']);

  it('groups by day, days in order, the photos without a date last', () => {
    const groups = trayGroups(book, { sort: 'date', filter: 'all' });
    expect(groups.map((g) => g.key)).toEqual(['2026-06-10', '2026-06-11', NO_DATE]);
  });

  it('sorts by date inside a day, then by name for photos without one', () => {
    expect(names(trayGroups(book, { sort: 'date', filter: 'all' }))).toEqual([
      ['2026-06-10', ['IMG_1.jpg', 'IMG_2.jpg']],
      ['2026-06-11', ['IMG_10.jpg']],
      [NO_DATE, ['carte.png', 'scan.png']],
    ]);
  });

  it('sorts by name inside a day, numbers as numbers', () => {
    const late = bookWith([
      photo('x', 'IMG_10.jpg', '2026-06-10T08:00:00'),
      photo('y', 'IMG_9.jpg', '2026-06-10T09:00:00'),
      photo('z', 'IMG_100.jpg', '2026-06-10T07:00:00'),
    ]);
    expect(names(trayGroups(late, { sort: 'name', filter: 'all' }))).toEqual([
      ['2026-06-10', ['IMG_9.jpg', 'IMG_10.jpg', 'IMG_100.jpg']],
    ]);
  });

  it('filters on usage and drops the days left empty', () => {
    expect(names(trayGroups(book, { sort: 'date', filter: 'used' }))).toEqual([
      ['2026-06-10', ['IMG_2.jpg']],
    ]);
    expect(trayGroups(book, { sort: 'date', filter: 'unused' }).map((g) => g.key)).toEqual([
      '2026-06-10',
      '2026-06-11',
      NO_DATE,
    ]);
    expect(names(trayGroups(book, { sort: 'date', filter: 'unused' }))[0]).toEqual([
      '2026-06-10',
      ['IMG_1.jpg'],
    ]);
  });

  it('lists photos only', () => {
    const sticker: AssetRef = { ...photo('s', 's.svg'), kind: 'sticker' };
    expect(trayGroups(bookWith([sticker]), { sort: 'date', filter: 'all' })).toEqual([]);
  });
});

describe('pickerSections', () => {
  it('lists the photos not placed yet first, then the others', () => {
    const book = bookWith(
      [photo('a', 'a.jpg', '2026-06-10T08:00:00'), photo('b', 'b.jpg', '2026-06-09T08:00:00')],
      ['b'],
    );
    expect(pickerSections(book).map((s) => [s.key, s.photos.map((p) => p.id)])).toEqual([
      ['unused', ['a']],
      ['used', ['b']],
    ]);
  });
  it('leaves out an empty section', () => {
    const book = bookWith([photo('a', 'a.jpg')], ['a']);
    expect(pickerSections(book).map((s) => s.key)).toEqual(['used']);
  });
});

describe('dayState', () => {
  const photos = [photo('a', 'a.jpg'), photo('b', 'b.jpg')];
  it('says whether none, some or all of the photos are selected', () => {
    expect(dayState(new Set(), photos)).toBe('none');
    expect(dayState(new Set(['a']), photos)).toBe('some');
    expect(dayState(new Set(['a', 'b', 'z']), photos)).toBe('all');
  });
});
