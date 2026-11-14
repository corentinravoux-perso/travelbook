import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp, { type Exif } from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureFixtures, fixturePath } from '../../../../../tests/fixtures/make-fixtures';
import { readPhotoMeta } from './exif';

let dir: string;

beforeAll(async () => {
  await ensureFixtures();
  dir = await mkdtemp(join(tmpdir(), 'tb-exif-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A tiny JPEG carrying the given EXIF blocks (sharp writes the Orientation tag itself). */
async function jpegWithExif(name: string, exif: Exif) {
  const path = join(dir, name);
  const data = await sharp({
    create: { width: 64, height: 48, channels: 3, background: '#888888' },
  })
    .jpeg()
    .withExif(exif)
    .toBuffer();
  await writeFile(path, data);
  return path;
}

describe('readPhotoMeta', () => {
  it('reports the pixel size and no EXIF for a plain JPEG', async () => {
    expect(await readPhotoMeta(fixturePath('landscape.jpg'))).toEqual({
      pixel: { w: 6000, h: 4000 },
      exif: undefined,
    });
  });

  it('applies the EXIF orientation to the pixel size and records it', async () => {
    const meta = await readPhotoMeta(fixturePath('portrait-o6.jpg'));
    expect(meta.pixel).toEqual({ w: 4000, h: 6000 });
    expect(meta.exif).toEqual({ orientation: 6 });
  });

  it('reads PNG sizes, with and without alpha', async () => {
    expect((await readPhotoMeta(fixturePath('alpha.png'))).pixel).toEqual({ w: 400, h: 300 });
    expect((await readPhotoMeta(fixturePath('opaque.png'))).pixel).toEqual({ w: 400, h: 300 });
  });

  it('reads WebP', async () => {
    const path = join(dir, 'x.webp');
    await sharp(fixturePath('small.jpg')).webp().toFile(path);
    expect((await readPhotoMeta(path)).pixel).toEqual({ w: 800, h: 600 });
  });

  it('reads the capture time, the camera and the GPS position', async () => {
    const path = await jpegWithExif('full.jpg', {
      IFD0: { Make: 'Canon ', Model: ' EOS R5' },
      IFD2: { DateTimeOriginal: '2023:07:14 09:30:05', OffsetTimeOriginal: '+02:00' },
      IFD3: {
        GPSLatitudeRef: 'S',
        GPSLatitude: '48/1 51/1 30/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '2/1 21/1 7/1',
      },
    });
    const { exif } = await readPhotoMeta(path);
    expect(exif?.takenAt).toBe('2023-07-14T09:30:05+02:00');
    expect(exif?.camera).toBe('Canon EOS R5');
    expect(exif?.gps?.lat).toBeCloseTo(-48.858333, 5);
    expect(exif?.gps?.lon).toBeCloseTo(2.351944, 5);
  });

  it('keeps the wall-clock time as shot when the file has no time zone', async () => {
    const path = await jpegWithExif('nozone.jpg', {
      IFD2: { DateTimeOriginal: '2021:12:31 23:59:58' },
    });
    expect((await readPhotoMeta(path)).exif).toEqual({ takenAt: '2021-12-31T23:59:58' });
  });

  it('leaves out fields that are missing or nonsense', async () => {
    const path = await jpegWithExif('junk.jpg', {
      IFD0: { Make: '   ' },
      IFD2: { DateTimeOriginal: '0000:00:00 00:00:00' },
    });
    expect((await readPhotoMeta(path)).exif).toBeUndefined();
    const feb30 = await jpegWithExif('feb30.jpg', {
      IFD2: { DateTimeOriginal: '2023:02:30 10:00:00' },
    });
    expect((await readPhotoMeta(feb30)).exif).toBeUndefined();
  });

  it('keeps one camera field when only the model is set', async () => {
    const path = await jpegWithExif('model.jpg', { IFD0: { Model: 'Pixel 9' } });
    expect((await readPhotoMeta(path)).exif).toEqual({ camera: 'Pixel 9' });
  });

  it('still reads the image when its EXIF block is corrupt', async () => {
    const path = join(dir, 'corrupt-exif.jpg');
    const good = await sharp(fixturePath('small.jpg'))
      .withExif({ IFD0: { Make: 'Canon', Model: 'EOS' } })
      .jpeg()
      .toBuffer();
    // Overwrite the TIFF header of the APP1 segment (right after "Exif\0\0").
    const at = good.indexOf(Buffer.from('Exif\0\0', 'latin1')) + 6;
    good.fill(0xff, at, at + 8);
    await writeFile(path, good);
    const meta = await readPhotoMeta(path);
    expect(meta.pixel).toEqual({ w: 800, h: 600 });
    expect(meta.exif?.camera).toBeUndefined();
  });

  it('rejects a truncated file whose header is also cut', async () => {
    const path = join(dir, 'cut.jpg');
    await writeFile(path, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]));
    await expect(readPhotoMeta(path)).rejects.toThrow();
  });

  it('rejects formats other than JPEG, PNG and WebP, whatever the extension', async () => {
    await expect(readPhotoMeta(fixturePath('plain.svg'))).rejects.toThrow(/unsupported/i);
    const gif = join(dir, 'fake.jpg');
    await sharp(fixturePath('small.jpg')).gif().toFile(gif);
    await expect(readPhotoMeta(gif)).rejects.toThrow(/unsupported.*gif/i);
  });

  it('rejects a missing file', async () => {
    await expect(readPhotoMeta(join(dir, 'nope.jpg'))).rejects.toThrow();
  });
});
