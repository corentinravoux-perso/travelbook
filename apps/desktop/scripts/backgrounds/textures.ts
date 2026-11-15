/**
 * Our own paper textures (CLEANROOM.md): each one is computed from seeded noise, so no photograph
 * and no third-party image is involved. A texture is a base colour, a fine grain, soft blotches,
 * optional fibres and optionally a thread structure (laid lines, linen, canvas). They are sized to
 * an A4 page at about 100 ppi (1131 × 1600) and cover a page or a double page; at print size they
 * read as paper, not as a picture.
 */
import sharp from 'sharp';

export const TEXTURE_WIDTH = 1131;
export const TEXTURE_HEIGHT = 1600;

type Structure = 'none' | 'laid' | 'linen' | 'canvas' | 'ribbed';

export interface TextureSpec {
  id: string;
  title: string;
  /** Base colour, `[r, g, b]` out of 255. */
  base: [number, number, number];
  /** Fine grain amplitude, as a fraction of the base. */
  grain: number;
  /** Soft cloudy variation. */
  blotch: number;
  /** Number of short fibres. */
  fibres: number;
  structure: Structure;
  /** Strength of `structure`. */
  weave?: number;
  seed: number;
}

/** Mulberry32: a small seeded generator, the same sequence on every machine. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise on a `cols × rows` lattice, stretched over the image; values in -1..1. */
function valueNoise(rnd: () => number, cols: number, rows: number): Float32Array {
  const lattice = Float32Array.from({ length: (cols + 2) * (rows + 2) }, () => rnd() * 2 - 1);
  const out = new Float32Array(TEXTURE_WIDTH * TEXTURE_HEIGHT);
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  for (let y = 0; y < TEXTURE_HEIGHT; y++) {
    const fy = (y / TEXTURE_HEIGHT) * rows;
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    for (let x = 0; x < TEXTURE_WIDTH; x++) {
      const fx = (x / TEXTURE_WIDTH) * cols;
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const at = (cx: number, cy: number): number => lattice[cy * (cols + 2) + cx] as number;
      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
      const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
      out[y * TEXTURE_WIDTH + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
}

function addStructure(light: Float32Array, spec: TextureSpec, rnd: () => number): void {
  const a = spec.weave ?? 0.05;
  const W = TEXTURE_WIDTH;
  const H = TEXTURE_HEIGHT;
  if (spec.structure === 'laid') {
    // Fine horizontal wire lines every 7 px, and a chain line every 150 px.
    for (let y = 0; y < H; y++) {
      const line = Math.cos((y / 7) * 2 * Math.PI) * a;
      for (let x = 0; x < W; x++) {
        const chain = Math.abs(((x % 150) + 150) % 150) < 3 ? -a * 0.8 : 0;
        light[y * W + x] = (light[y * W + x] as number) + line + chain;
      }
    }
  } else if (spec.structure === 'linen') {
    const rows = Float32Array.from({ length: H }, () => (rnd() - 0.5) * 2 * a);
    const cols = Float32Array.from({ length: W }, () => (rnd() - 0.5) * 2 * a);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const thread = Math.sin((x / 3) * 2 * Math.PI) * Math.sin((y / 3) * 2 * Math.PI) * a * 0.6;
        light[y * W + x] =
          (light[y * W + x] as number) + (rows[y] as number) + (cols[x] as number) + thread;
      }
    }
  } else if (spec.structure === 'canvas') {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const thread = Math.sin((x / 5) * 2 * Math.PI) * Math.sin((y / 5) * 2 * Math.PI);
        light[y * W + x] = (light[y * W + x] as number) + thread * a;
      }
    }
  } else if (spec.structure === 'ribbed') {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        light[y * W + x] = (light[y * W + x] as number) + Math.sin((x / 9) * 2 * Math.PI) * a;
      }
    }
  }
}

function addFibres(light: Float32Array, count: number, rnd: () => number): void {
  const W = TEXTURE_WIDTH;
  const H = TEXTURE_HEIGHT;
  for (let i = 0; i < count; i++) {
    let x = rnd() * W;
    let y = rnd() * H;
    let angle = rnd() * Math.PI * 2;
    const length = 14 + rnd() * 60;
    const delta = (rnd() < 0.5 ? -1 : 1) * (0.03 + rnd() * 0.05);
    for (let s = 0; s < length; s++) {
      const px = Math.round(x);
      const py = Math.round(y);
      if (px >= 0 && px < W && py >= 0 && py < H) {
        light[py * W + px] = (light[py * W + px] as number) + delta;
      }
      angle += (rnd() - 0.5) * 0.25;
      x += Math.cos(angle);
      y += Math.sin(angle);
    }
  }
}

/** The texture as WebP bytes. */
export async function renderTexture(spec: TextureSpec): Promise<Buffer> {
  const rnd = rng(spec.seed);
  const W = TEXTURE_WIDTH;
  const H = TEXTURE_HEIGHT;
  const cloud = valueNoise(rnd, 5, 7);
  const mist = valueNoise(rnd, 22, 31);
  const light = new Float32Array(W * H);
  for (let i = 0; i < light.length; i++) {
    light[i] =
      (cloud[i] as number) * spec.blotch +
      (mist[i] as number) * spec.blotch * 0.5 +
      (rnd() * 2 - 1) * spec.grain;
  }
  addStructure(light, spec, rnd);
  addFibres(light, spec.fibres, rnd);
  const rgb = Buffer.alloc(W * H * 3);
  const [r, g, b] = spec.base;
  for (let i = 0; i < light.length; i++) {
    const k = 1 + (light[i] as number);
    rgb[i * 3] = Math.max(0, Math.min(255, Math.round(r * k)));
    rgb[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(g * k)));
    rgb[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(b * k)));
  }
  return sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
    .blur(0.5)
    .webp({ quality: 72, effort: 5 })
    .toBuffer();
}

const spec = (
  id: string,
  title: string,
  base: [number, number, number],
  seed: number,
  rest: Partial<Omit<TextureSpec, 'id' | 'title' | 'base' | 'seed'>> = {},
): TextureSpec => ({
  id,
  title,
  base,
  seed,
  grain: 0.025,
  blotch: 0.02,
  fibres: 0,
  structure: 'none',
  ...rest,
});

export const TEXTURES: TextureSpec[] = [
  spec('paper-white', 'Papier blanc', [244, 243, 240], 101, { grain: 0.018, blotch: 0.012 }),
  spec('paper-cream', 'Papier crème', [239, 230, 208], 102, { fibres: 900 }),
  spec('paper-ivory', 'Papier ivoire', [236, 228, 210], 103, { grain: 0.03, fibres: 600 }),
  spec('paper-warm-grey', 'Papier gris chaud', [214, 209, 200], 104, { fibres: 700 }),
  spec('paper-cold-grey', 'Papier gris froid', [205, 208, 211], 105, { fibres: 700 }),
  spec('kraft', 'Papier kraft', [183, 146, 100], 106, { grain: 0.04, blotch: 0.04, fibres: 3200 }),
  spec('kraft-light', 'Kraft clair', [205, 172, 128], 107, {
    grain: 0.035,
    blotch: 0.035,
    fibres: 2600,
  }),
  spec('kraft-dark', 'Kraft foncé', [140, 105, 70], 108, {
    grain: 0.04,
    blotch: 0.045,
    fibres: 3200,
  }),
  spec('parchment', 'Parchemin', [226, 206, 160], 109, { grain: 0.03, blotch: 0.07, fibres: 800 }),
  spec('old-paper', 'Papier ancien', [214, 192, 150], 110, {
    grain: 0.035,
    blotch: 0.09,
    fibres: 1000,
  }),
  spec('watercolour', 'Papier aquarelle', [246, 244, 238], 111, {
    grain: 0.05,
    blotch: 0.02,
    fibres: 400,
  }),
  spec('laid-white', 'Vergé blanc', [243, 241, 235], 112, {
    structure: 'laid',
    weave: 0.03,
    fibres: 500,
  }),
  spec('laid-cream', 'Vergé crème', [236, 226, 204], 113, {
    structure: 'laid',
    weave: 0.035,
    fibres: 600,
  }),
  spec('linen-natural', 'Lin naturel', [219, 208, 187], 114, {
    structure: 'linen',
    weave: 0.05,
    grain: 0.02,
  }),
  spec('linen-grey', 'Lin gris', [188, 186, 180], 115, {
    structure: 'linen',
    weave: 0.05,
    grain: 0.02,
  }),
  spec('canvas-white', 'Toile blanche', [236, 233, 226], 116, {
    structure: 'canvas',
    weave: 0.045,
    grain: 0.02,
  }),
  spec('canvas-sand', 'Toile sable', [208, 190, 156], 117, {
    structure: 'canvas',
    weave: 0.05,
    grain: 0.025,
  }),
  spec('card-black', 'Carton noir', [38, 38, 40], 118, { grain: 0.06, blotch: 0.12, fibres: 600 }),
  spec('card-navy', 'Carton bleu nuit', [34, 46, 74], 119, {
    grain: 0.05,
    blotch: 0.1,
    fibres: 500,
  }),
  spec('card-sage', 'Carton vert sauge', [158, 172, 146], 120, {
    grain: 0.03,
    blotch: 0.03,
    fibres: 800,
  }),
  spec('card-rose', 'Carton rose poudré', [226, 188, 184], 121, {
    grain: 0.03,
    blotch: 0.03,
    fibres: 800,
  }),
  spec('card-sky', 'Carton bleu ciel', [178, 200, 216], 122, {
    grain: 0.03,
    blotch: 0.03,
    fibres: 700,
  }),
  spec('card-sand', 'Carton sable', [222, 200, 166], 123, {
    grain: 0.03,
    blotch: 0.035,
    fibres: 900,
  }),
  spec('ribbed-cream', 'Papier côtelé crème', [237, 228, 208], 124, {
    structure: 'ribbed',
    weave: 0.025,
    fibres: 500,
  }),
];
