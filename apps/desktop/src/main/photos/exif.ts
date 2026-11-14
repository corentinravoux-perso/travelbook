import { readFile } from 'node:fs/promises';
import exifr from 'exifr';
import sharp from 'sharp';
import type { AssetRef } from '@travelbook/core';

type Exif = NonNullable<AssetRef['exif']>;

/** Formats the album accepts as photos. */
const PHOTO_FORMATS = new Set(['jpeg', 'png', 'webp']);

/** The only tags we use. GPS tags are listed so that exifr can compute `latitude`/`longitude`. */
const TAGS = [
  'Make',
  'Model',
  'DateTimeOriginal',
  'OffsetTimeOriginal',
  'GPSLatitude',
  'GPSLatitudeRef',
  'GPSLongitude',
  'GPSLongitudeRef',
];

/**
 * Wall-clock capture time as ISO 8601, `YYYY-MM-DDTHH:mm:ss`, plus the UTC offset when the file
 * records one. The digits are those the camera wrote: no conversion to the machine's time zone,
 * so a photo shot at 23:50 stays on its day. Zero dates and impossible dates give `undefined`.
 */
function captureTime(tags: Record<string, unknown>): string | undefined {
  const raw = tags['DateTimeOriginal'];
  if (typeof raw !== 'string') return undefined;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return undefined;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const real =
    year > 0 &&
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day &&
    check.getUTCHours() === hour;
  if (!real) return undefined;
  const offset = tags['OffsetTimeOriginal'];
  const zone =
    typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset.trim()) ? offset.trim() : '';
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${zone}`;
}

/** "Make Model", trimmed, or `undefined` when neither is set. */
function cameraName(tags: Record<string, unknown>): string | undefined {
  const parts = [tags['Make'], tags['Model']]
    // eslint-disable-next-line no-control-regex -- some writers pad the strings with NULs
    .map((v) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim() : ''))
    .filter((v) => v !== '');
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function gpsPosition(tags: Record<string, unknown>): Exif['gps'] {
  const lat = tags['latitude'];
  const lon = tags['longitude'];
  if (typeof lat !== 'number' || typeof lon !== 'number') return undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  return { lat, lon };
}

/**
 * The tags exifr finds in `file`. exifr is handed the whole file as a buffer: its own file
 * reader does not work with current Node versions, and WebP keeps its EXIF block after the
 * pixel data. A file whose EXIF block is damaged has no tags; it is still a valid photo.
 */
async function readTags(file: string): Promise<Record<string, unknown>> {
  try {
    const tags = await exifr.parse(await readFile(file), {
      pick: TAGS,
      gps: true,
      translateValues: false,
      reviveValues: false,
    });
    return typeof tags === 'object' && tags !== null ? (tags as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Pixel size after EXIF orientation, and the EXIF fields the album uses (`orientation` only when
 * it is not 1). `exif` is `undefined` when the file has none of them. Rejects when the file is not a readable JPEG, PNG or WebP.
 */
export async function readPhotoMeta(
  file: string,
): Promise<{ pixel: { w: number; h: number }; exif: AssetRef['exif'] }> {
  const meta = await sharp(file).metadata();
  if (!meta.format || !PHOTO_FORMATS.has(meta.format)) {
    throw new Error(`Unsupported image format${meta.format ? `: ${meta.format}` : ''}`);
  }
  const w = meta.autoOrient.width;
  const h = meta.autoOrient.height;
  if (!(w > 0 && h > 0)) throw new Error('The image has no readable size');

  const tags = await readTags(file);
  const exif: Exif = {};
  const takenAt = captureTime(tags);
  if (takenAt !== undefined) exif.takenAt = takenAt;
  // 1 is "upright", the same as no tag: not worth a field.
  if (meta.orientation !== undefined && meta.orientation !== 1) exif.orientation = meta.orientation;
  const camera = cameraName(tags);
  if (camera !== undefined) exif.camera = camera;
  const gps = gpsPosition(tags);
  if (gps !== undefined) exif.gps = gps;
  return { pixel: { w, h }, exif: Object.keys(exif).length > 0 ? exif : undefined };
}
