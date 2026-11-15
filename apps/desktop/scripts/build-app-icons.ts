/**
 * Builds the app icon from `resources/icons/icon.svg`, our own mark (CLEANROOM.md): the PNG sizes
 * Linux wants (`resources/icons/png/<size>x<size>.png`, which electron-builder installs into the
 * hicolor theme), a 512 px `icon.png`, and `icon.ico` for Windows. The files are committed.
 *
 *   npm run app-icons -w @travelbook/desktop    write the files
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

export const ICONS_DIR = join(import.meta.dirname, '../resources/icons');
export const SOURCE = join(ICONS_DIR, 'icon.svg');

/** The hicolor sizes. */
export const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512] as const;
/** The sizes inside `icon.ico`: Windows picks the nearest one for each place it draws the icon. */
export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256] as const;

export interface IcoImage {
  size: number;
  /** A PNG file. */
  data: Buffer;
}

/** An ICO file made of PNG images (Windows Vista and later read them at every size). */
export function encodeIco(images: IcoImage[]): Buffer {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  for (const [i, { size, data }] of images.entries()) {
    if (size > 256) throw new Error(`An ICO image is at most 256 px, not ${size}.`);
    const entry = 6 + i * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry); // 0 means 256
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  }
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

/** The mark drawn at `size` px, rasterised from the SVG at that size so lines stay sharp. */
function render(svg: Buffer, size: number): Promise<Buffer> {
  return sharp(svg, { density: (72 * size * 2) / 1024 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

if (import.meta.main) {
  const svg = await readFile(SOURCE);
  await mkdir(join(ICONS_DIR, 'png'), { recursive: true });
  const bySize = new Map<number, Buffer>();
  for (const size of PNG_SIZES) {
    const png = await render(svg, size);
    bySize.set(size, png);
    await writeFile(join(ICONS_DIR, 'png', `${size}x${size}.png`), png);
  }
  await writeFile(join(ICONS_DIR, 'icon.png'), bySize.get(512)!);
  const ico = encodeIco(ICO_SIZES.map((size) => ({ size, data: bySize.get(size)! })));
  await writeFile(join(ICONS_DIR, 'icon.ico'), ico);
  console.log(`Wrote ${ICONS_DIR}`);
}
