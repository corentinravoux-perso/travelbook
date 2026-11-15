import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { mmToPxAtDpi, visibleRect, type Crop, type Mm, type PhotoElement } from '@travelbook/core';
import { featherMaskSvg } from '@travelbook/render/src/masks.ts';

export interface DerivativeOpts {
  dpi: number;
  /** Keep the visible window at its own pixel size instead of resizing it to the frame. */
  nativeResolution: boolean;
  /** JPEG quality; 95 by default. */
  quality?: number;
}

/** What the derivative takes from the photo element besides its crop. */
export interface DerivativeLook {
  adjust: PhotoElement['adjust'];
  edge: PhotoElement['edge'];
  /** The frame's mask: the feather follows its outline. Its shape itself stays CSS. */
  mask?: PhotoElement['mask'];
}

export const DEFAULT_QUALITY = 95;

/** `[r, g, b]` rows, as `sharp().recomb()` takes them. */
type Matrix = [[number, number, number], [number, number, number], [number, number, number]];

/** The matrices of the CSS Filter Effects spec (`saturate`, `grayscale`, `sepia`). */
const saturateMatrix = (s: number): Matrix => [
  [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
  [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
  [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
];
const grayscaleMatrix = (g: number): Matrix => {
  const a = 1 - Math.min(Math.max(g, 0), 1);
  return [
    [0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a],
    [0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a],
    [0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a],
  ];
};
const sepiaMatrix = (p: number): Matrix => {
  const a = 1 - Math.min(Math.max(p, 0), 1);
  return [
    [0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a],
    [0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a],
    [0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a],
  ];
};

/**
 * Black overlay of the editor's vignette (`vignetteGradient` in the render package): clear to 45 %
 * of the way to the corner, `strength * .3` at 72 %, `strength` at the corner, on an ellipse
 * of the frame's aspect that passes through the corners (`farthest-corner`).
 */
function vignetteOverlay(w: number, h: number, strength: number): Buffer {
  const s = Math.min(Math.max(strength, 0), 1);
  const out = Buffer.alloc(w * h * 4); // black, alpha below
  const rx = (w / 2) * Math.SQRT2;
  const ry = (h / 2) * Math.SQRT2;
  for (let y = 0; y < h; y++) {
    const dy = ((y + 0.5 - h / 2) / ry) ** 2;
    for (let x = 0; x < w; x++) {
      const t = Math.sqrt(((x + 0.5 - w / 2) / rx) ** 2 + dy);
      let alpha: number;
      if (t <= 0.45) alpha = 0;
      else if (t <= 0.72) alpha = s * 0.3 * ((t - 0.45) / 0.27);
      else alpha = s * (0.3 + 0.7 * Math.min((t - 0.72) / 0.28, 1));
      out[(y * w + x) * 4 + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

/**
 * Build the image the export draws for one placed photo, and return its file in `outDir`.
 *
 * The ORIGINAL is read, never written. It is turned upright from its EXIF orientation, cut to
 * `visibleRect`, resized to the frame at `opts.dpi` (Lanczos; never enlarged, and not resized at
 * all with `nativeResolution`), mirrored, then given the look in the order of the editor's CSS:
 * brightness, contrast, saturate, grayscale, sepia, then the vignette, then the feather as alpha.
 * The result is sRGB with its profile embedded: a JPEG (4:4:4), or a PNG when the original has
 * transparency or the feather is on. The file name derives from the inputs, so the same call
 * gives the same file. `pixel` is the size of the original after orientation.
 */
export async function makeDerivative(
  original: string,
  pixel: { w: number; h: number },
  frame: { w: Mm; h: Mm },
  crop: Crop,
  flip: { h: boolean; v: boolean },
  look: DerivativeLook,
  opts: DerivativeOpts,
  outDir: string,
): Promise<{ file: string; w: number; h: number }> {
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const { sx, sy, sw, sh } = visibleRect(pixel, frame, crop);
  const left = Math.min(Math.floor(sx), pixel.w - 1);
  const top = Math.min(Math.floor(sy), pixel.h - 1);
  const width = Math.max(1, Math.min(Math.round(sw), pixel.w - left));
  const height = Math.max(1, Math.min(Math.round(sh), pixel.h - top));
  const outW = opts.nativeResolution
    ? width
    : Math.max(1, Math.min(mmToPxAtDpi(frame.w, opts.dpi), width));
  const outH = opts.nativeResolution
    ? height
    : Math.max(1, Math.min(mmToPxAtDpi(frame.h, opts.dpi), height));

  // Stage 1: upright, cut, resized, in sRGB (the embedded profile is applied here).
  let stage = sharp(original, { failOn: 'error' }).rotate().extract({ left, top, width, height });
  if (outW !== width || outH !== height) {
    stage = stage.resize(outW, outH, { fit: 'fill', kernel: 'lanczos3' });
  }
  const base = await stage.toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const { channels } = base.info;
  const hasAlpha = channels === 4;

  // Stage 2: the look, on 8-bit sRGB pixels.
  let image = sharp(base.data, { raw: base.info });
  if (flip.h) image = image.flop();
  if (flip.v) image = image.flip();
  const { adjust } = look;
  let current = await image.raw().toBuffer({ resolveWithObject: true });
  const apply = async (step: (s: Sharp) => Sharp): Promise<void> => {
    current = await step(sharp(current.data, { raw: current.info }))
      .raw()
      .toBuffer({ resolveWithObject: true });
  };
  // Alpha, if any, is left alone: the steps change the colour bands only.
  const colour = (rgb: [number, number, number]): number[] => (hasAlpha ? [...rgb, 1] : rgb);
  if (adjust.brightness !== 1) {
    await apply((s) =>
      s.linear(
        colour([adjust.brightness, adjust.brightness, adjust.brightness]),
        colour([0, 0, 0]),
      ),
    );
  }
  if (adjust.contrast !== 1) {
    const c = adjust.contrast;
    const o = 127.5 * (1 - c);
    await apply((s) => s.linear(colour([c, c, c]), colour([o, o, o])));
  }
  for (const m of [
    adjust.saturation !== 1 ? saturateMatrix(adjust.saturation) : undefined,
    adjust.grayscale !== 0 ? grayscaleMatrix(adjust.grayscale) : undefined,
    adjust.sepia !== 0 ? sepiaMatrix(adjust.sepia) : undefined,
  ]) {
    if (m) await apply((s) => s.recomb(m));
  }
  if (adjust.vignette > 0) {
    const overlay = vignetteOverlay(current.info.width, current.info.height, adjust.vignette);
    await apply((s) =>
      s.composite([
        {
          input: overlay,
          // Atop: transparent pixels of the original stay transparent.
          blend: 'atop',
          raw: { width: current.info.width, height: current.info.height, channels: 4 },
        },
      ]),
    );
  }

  let result = sharp(current.data, { raw: current.info });
  let png = hasAlpha;
  const feather = look.edge?.feather ?? 0;
  if (feather > 0) {
    const w = current.info.width;
    const h = current.info.height;
    const svg = featherMaskSvg(look.mask ?? { kind: 'rect' }, frame, feather);
    if (svg !== undefined) {
      // The same SVG the editor uses as a CSS mask, drawn at the derivative's pixel size.
      const sized = svg.replace('<svg ', `<svg width="${w}" height="${h}" `);
      const mask = await sharp(Buffer.from(sized)).ensureAlpha().extractChannel(3).raw().toBuffer();
      const rgba = await result.ensureAlpha().raw().toBuffer();
      for (let i = 0; i < w * h; i++) {
        rgba[i * 4 + 3] = Math.round(((rgba[i * 4 + 3] as number) * (mask[i] as number)) / 255);
      }
      result = sharp(rgba, { raw: { width: w, height: h, channels: 4 } });
      png = true;
    }
  }

  const file = join(
    outDir,
    `${createHash('sha256')
      .update(JSON.stringify([original, pixel, frame, crop, flip, look, outW, outH, quality]))
      .digest('hex')
      .slice(0, 24)}.${png ? 'png' : 'jpg'}`,
  );
  await mkdir(outDir, { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    const encoded = result.withIccProfile('srgb');
    await (
      png
        ? encoded.png({ compressionLevel: 6 })
        : encoded.jpeg({ quality, chromaSubsampling: '4:4:4' })
    ).toFile(tmp);
    await rename(tmp, file);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
  return { file, w: current.info.width, h: current.info.height };
}
