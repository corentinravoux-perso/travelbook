import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ICONS_DIR, ICO_SIZES, PNG_SIZES, encodeIco } from './build-app-icons';

describe('encodeIco', () => {
  it('writes a directory of PNG images, the 256 px one with the size byte 0', async () => {
    const png = (size: number) =>
      sharp({ create: { width: size, height: size, channels: 4, background: '#1f1f1f' } })
        .png()
        .toBuffer();
    const images = [
      { size: 16, data: await png(16) },
      { size: 256, data: await png(256) },
    ];
    const ico = encodeIco(images);

    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(2); // image count
    for (const [i, image] of images.entries()) {
      const entry = 6 + i * 16;
      expect(ico.readUInt8(entry)).toBe(image.size === 256 ? 0 : image.size); // width
      expect(ico.readUInt8(entry + 1)).toBe(image.size === 256 ? 0 : image.size); // height
      expect(ico.readUInt16LE(entry + 4)).toBe(1); // colour planes
      expect(ico.readUInt16LE(entry + 6)).toBe(32); // bits per pixel
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      expect(length).toBe(image.data.length);
      expect(ico.subarray(offset, offset + length).equals(image.data)).toBe(true);
    }
  });

  it('refuses a size an ICO entry cannot hold', () => {
    expect(() => encodeIco([{ size: 512, data: Buffer.alloc(1) }])).toThrow(/256/);
  });
});

describe('the committed app icon', () => {
  it('has a PNG for every size, each at its own size', async () => {
    for (const size of PNG_SIZES) {
      const meta = await sharp(join(ICONS_DIR, 'png', `${size}x${size}.png`)).metadata();
      expect([meta.width, meta.height], `${size} px`).toEqual([size, size]);
    }
  });

  it('has an .ico holding every ICO size', async () => {
    const ico = await readFile(join(ICONS_DIR, 'icon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(ICO_SIZES.length);
  });
});
