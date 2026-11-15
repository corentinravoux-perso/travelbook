import { assetUsage, type AssetRef, type Book } from '@travelbook/core';

export type SortKey = 'date' | 'name';
export type UsageFilter = 'all' | 'used' | 'unused';

/** Key of the group that holds the photos whose EXIF has no capture date. */
export const NO_DATE = 'none';

/** A run of photos under one header: a capture day, or one of the picker's two sections. */
export interface PhotoGroup {
  key: string;
  photos: AssetRef[];
}

/**
 * The capture day of a photo as `YYYY-MM-DD`: the digits the camera wrote (`takenAt` keeps the
 * wall-clock time), so a photo shot at 23:50 stays on its day. `null` without a usable date.
 */
export function captureDay(asset: AssetRef): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(asset.exif?.takenAt ?? '');
  return match ? (match[1] as string) : null;
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "jeudi 11 juin 2026" for a `YYYY-MM-DD` key. */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return dayFormat.format(new Date(Date.UTC(y, m - 1, d)));
}

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

const byName = (a: AssetRef, b: AssetRef): number =>
  collator.compare(a.originalName, b.originalName) || (a.id < b.id ? -1 : 1);

/** Capture time order; photos with the same time (or none) fall back to their names. */
const byTime = (a: AssetRef, b: AssetRef): number => {
  const ta = a.exif?.takenAt?.slice(0, 19) ?? '';
  const tb = b.exif?.takenAt?.slice(0, 19) ?? '';
  return ta === tb ? byName(a, b) : ta < tb ? -1 : 1;
};

const photosOf = (book: Book): AssetRef[] =>
  Object.values(book.assets).filter((asset) => asset.kind === 'photo');

/**
 * The tray: the book's photos kept by `filter`, grouped by capture day (days in order, the photos
 * without a date last) and sorted inside each group by time or by name. A group left empty by the
 * filter is dropped.
 */
export function trayGroups(
  book: Book,
  { sort, filter }: { sort: SortKey; filter: UsageFilter },
): PhotoGroup[] {
  const usage = assetUsage(book);
  const kept = photosOf(book).filter(
    (asset) => filter === 'all' || (filter === 'used') === (usage[asset.id] ?? 0) > 0,
  );
  const days = new Map<string, AssetRef[]>();
  for (const asset of kept) {
    const key = captureDay(asset) ?? NO_DATE;
    days.set(key, [...(days.get(key) ?? []), asset]);
  }
  const order = [...days.keys()].sort((a, b) =>
    a === NO_DATE ? 1 : b === NO_DATE ? -1 : a < b ? -1 : 1,
  );
  return order.map((key) => ({
    key,
    photos: (days.get(key) as AssetRef[]).sort(sort === 'name' ? byName : byTime),
  }));
}

/** The photo picker: the photos not placed yet first, then the ones already in the book. */
export function pickerSections(book: Book): PhotoGroup[] {
  const usage = assetUsage(book);
  const photos = photosOf(book).sort(byTime);
  const sections: PhotoGroup[] = [
    { key: 'unused', photos: photos.filter((a) => !usage[a.id]) },
    { key: 'used', photos: photos.filter((a) => usage[a.id]) },
  ];
  return sections.filter((s) => s.photos.length > 0);
}

/** How many of `photos` are in `selected`: for the checkbox of a day. */
export function dayState(
  selected: ReadonlySet<string>,
  photos: readonly AssetRef[],
): 'none' | 'some' | 'all' {
  const count = photos.filter((p) => selected.has(p.id)).length;
  return count === 0 ? 'none' : count === photos.length ? 'all' : 'some';
}
