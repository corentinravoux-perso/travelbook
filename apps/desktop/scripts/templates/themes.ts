/**
 * Themes: a cover, five pages, a background and the fonts that go with them. The pages of a theme
 * share a frame (white cards, tilted a little, or bare photos) and a motif drawn behind the
 * photos; each theme has its own colours, motif and cover.
 */
import type {
  Background,
  Element,
  FreeSlot,
  PhotoElement,
  Template,
  Theme,
} from '@travelbook/core';
import {
  deco,
  freeTemplate,
  hline,
  onCard,
  photoSlot,
  preset,
  ROUND,
  textSlot,
  type Frac,
  type Meta,
} from './dsl.ts';

const HAIR = { width: 0.3, color: '#cfcfcf' };
const roundH = (w: number): number => w * (210 / 297);

/** A page's frames: where each photo goes (a card on card themes) and how it is tilted. */
interface Frame extends Frac {
  rotation: number;
}

const FRAMES: Record<number, Frame[]> = {
  1: [{ x: 0.12, y: 0.12, w: 0.76, h: 0.72, rotation: -2 }],
  2: [
    { x: 0.08, y: 0.06, w: 0.62, h: 0.43, rotation: -3 },
    { x: 0.3, y: 0.5, w: 0.62, h: 0.43, rotation: 2 },
  ],
  3: [
    { x: 0.08, y: 0.05, w: 0.84, h: 0.45, rotation: -1 },
    { x: 0.07, y: 0.54, w: 0.41, h: 0.38, rotation: -2 },
    { x: 0.52, y: 0.56, w: 0.41, h: 0.38, rotation: 2 },
  ],
  4: [
    { x: 0.07, y: 0.06, w: 0.41, h: 0.4, rotation: -2 },
    { x: 0.52, y: 0.07, w: 0.41, h: 0.4, rotation: 2 },
    { x: 0.07, y: 0.52, w: 0.41, h: 0.4, rotation: 2 },
    { x: 0.52, y: 0.53, w: 0.41, h: 0.4, rotation: -2 },
  ],
  6: [
    { x: 0.07, y: 0.05, w: 0.41, h: 0.28, rotation: -2 },
    { x: 0.52, y: 0.06, w: 0.41, h: 0.28, rotation: 2 },
    { x: 0.07, y: 0.36, w: 0.41, h: 0.28, rotation: 2 },
    { x: 0.52, y: 0.37, w: 0.41, h: 0.28, rotation: -2 },
    { x: 0.07, y: 0.67, w: 0.41, h: 0.28, rotation: -2 },
    { x: 0.52, y: 0.68, w: 0.41, h: 0.28, rotation: 2 },
  ],
};
const PAGE_COUNTS = [1, 2, 3, 4, 6];

interface Spec {
  theme: Theme;
  background: Background;
  /** Photos sit on white cards; false puts them straight on the background. */
  cards: boolean;
  mask?: PhotoElement['mask'];
  /** Drawn behind everything; the frames are given so a motif can follow them. */
  motif(frames: Frame[], cover: boolean): Element[];
  cover(spec: Spec, meta: Meta): Template;
}

const sky = (top: string, bottom: string): Background => ({
  kind: 'gradient',
  type: 'linear',
  angle: 180,
  stops: [
    { offset: 0, color: top },
    { offset: 1, color: bottom },
  ],
});

/** The slots and decorations of a set of frames in a theme. */
function framed(
  spec: Spec,
  frames: Frame[],
  caption: boolean,
): { slots: FreeSlot[]; decos: Element[] } {
  const slots: FreeSlot[] = [];
  const decos: Element[] = [];
  frames.forEach((f, i) => {
    if (!spec.cards) {
      slots.push(
        photoSlot(f.x, f.y, f.w, f.h, { rotation: 0, ...(spec.mask ? { mask: spec.mask } : {}) }),
      );
      return;
    }
    decos.push(
      deco('rect', f.x, f.y, f.w, f.h, { fill: '#ffffff', stroke: HAIR, rotation: f.rotation }),
    );
    const photo = onCard(f, f.rotation, {
      x: 0.05,
      y: 0.04,
      w: 0.9,
      h: caption && i === 0 ? 0.78 : 0.86,
    });
    slots.push(
      photoSlot(photo.x, photo.y, photo.w, photo.h, {
        rotation: f.rotation,
        ...(spec.mask ? { mask: spec.mask } : {}),
      }),
    );
    if (caption && i === 0) {
      const c = onCard(f, f.rotation, { x: 0.08, y: 0.86, w: 0.84, h: 0.1 });
      slots.push(textSlot('caption', c.x, c.y, c.w, c.h, f.rotation));
    }
  });
  return { slots, decos };
}

function pages(spec: Spec): Template[] {
  return PAGE_COUNTS.map((n) => {
    const frames = FRAMES[n] as Frame[];
    const { slots, decos } = framed(spec, frames, n === 1);
    return freeTemplate(
      {
        id: `${spec.theme.id}-p${n}`,
        name: `${spec.theme.name}, ${n === 1 ? 'une photo' : `${n} photos`}`,
        themeId: spec.theme.id,
        background: spec.background,
      },
      slots,
      [...spec.motif(frames, false), ...decos],
    );
  });
}

// ---------------------------------------------------------------- the themes

const plage: Spec = {
  theme: { id: 'plage', name: 'Plage', coverTemplateId: 'b-plage-c', fonts: ['Lora', 'Inter'] },
  background: sky('#f8efdc', '#fdf9ef'),
  cards: true,
  motif: (_frames, cover) => [
    deco(
      'ellipse',
      cover ? 0.62 : 0.76,
      cover ? 0.03 : 0.015,
      cover ? 0.3 : 0.18,
      roundH(cover ? 0.3 : 0.18),
      {
        fill: '#f2c46d',
        opacity: 0.55,
      },
    ),
    ...[0.94, 0.955, 0.97].map((y, i) => hline(0.06 + i * 0.05, y, 0.88 - i * 0.1, '#8fb8c9', 0.5)),
  ],
  cover(spec, meta) {
    const card = { x: 0.14, y: 0.16, w: 0.72, h: 0.66 };
    const photo = onCard(card, -3, { x: 0.06, y: 0.05, w: 0.88, h: 0.76 });
    const title = onCard(card, -3, { x: 0.08, y: 0.84, w: 0.84, h: 0.11 });
    return freeTemplate(
      meta,
      [
        photoSlot(photo.x, photo.y, photo.w, photo.h, { rotation: -3 }),
        textSlot('title', title.x, title.y, title.w, title.h, -3),
      ],
      [
        ...spec.motif([], true),
        deco('rect', card.x, card.y, card.w, card.h, {
          fill: '#ffffff',
          stroke: HAIR,
          rotation: -3,
        }),
      ],
    );
  },
};

const triangle = (x: number, h: number, w: number, fill: string): Element =>
  // The base of a triangle sits three quarters down its box, so the box starts that much above the page foot.
  deco('polygon', x, 1 - 0.75 * h, w, h, { fill, points: 3 });

const montagne: Spec = {
  theme: {
    id: 'montagne',
    name: 'Montagne',
    coverTemplateId: 'b-montagne-c',
    fonts: ['Inter', 'Lora'],
  },
  background: sky('#e4edf3', '#f5f8fa'),
  cards: false,
  mask: { kind: 'rect' },
  motif: (_frames, cover) => [
    triangle(-0.05, cover ? 0.3 : 0.14, 0.5, '#b8cad6'),
    triangle(0.3, cover ? 0.38 : 0.18, 0.6, '#9fb5c4'),
    triangle(0.62, cover ? 0.26 : 0.12, 0.46, '#c6d5de'),
  ],
  cover(spec, meta) {
    return freeTemplate(
      meta,
      [
        photoSlot(0.2, 0.08, 0.6, 0.5, { mask: preset('arch') }),
        textSlot('title', 0.1, 0.62, 0.8, 0.1),
      ],
      spec.motif([], true),
    );
  },
};

const foret: Spec = {
  theme: { id: 'foret', name: 'Forêt', coverTemplateId: 'b-foret-c', fonts: ['Lora', 'Inter'] },
  background: { kind: 'color', color: '#e8f0e4' },
  cards: false,
  mask: preset('blob'),
  motif: () => [
    deco('ellipse', -0.06, 0.9, 0.3, 0.07, { fill: '#bcd5b0', opacity: 0.7, rotation: -28 }),
    deco('ellipse', 0.08, 0.95, 0.26, 0.06, { fill: '#a6c598', opacity: 0.6, rotation: -12 }),
    deco('ellipse', 0.8, -0.01, 0.3, 0.07, { fill: '#bcd5b0', opacity: 0.7, rotation: -30 }),
    deco('ellipse', 0.74, 0.04, 0.26, 0.06, { fill: '#a6c598', opacity: 0.6, rotation: -14 }),
  ],
  cover(spec, meta) {
    return freeTemplate(
      meta,
      [
        photoSlot(0.14, 0.12, 0.72, roundH(0.72), { mask: ROUND }),
        textSlot('title', 0.1, 0.72, 0.8, 0.1),
      ],
      [
        ...spec.motif([], true),
        deco('ellipse', 0.1, 0.08, 0.8, roundH(0.8), { stroke: { width: 0.5, color: '#6f8f64' } }),
      ],
    );
  },
};

const skyline = (): Element[] => {
  const widths = [0.1, 0.07, 0.12, 0.08, 0.14, 0.09, 0.11, 0.07, 0.12, 0.1];
  const heights = [0.07, 0.11, 0.05, 0.13, 0.08, 0.1, 0.04, 0.12, 0.06, 0.09];
  const fills = ['#d9d9d4', '#e5ddd0', '#cfcfca', '#e0e0dc', '#d6d0c4'];
  let x = 0;
  return widths.map((w, i) => {
    const block = deco('rect', x, 1 - (heights[i] as number), w, heights[i] as number, {
      fill: fills[i % fills.length] as string,
    });
    x += w;
    return block;
  });
};

const ville: Spec = {
  theme: {
    id: 'ville',
    name: 'Ville',
    coverTemplateId: 'b-ville-c',
    fonts: ['IBM Plex Sans', 'Inter'],
  },
  background: { kind: 'color', color: '#f0f0ee' },
  cards: false,
  motif: () => skyline(),
  cover(spec, meta) {
    return freeTemplate(
      meta,
      [
        photoSlot(-0.015, -0.011, 1.03, 0.66),
        textSlot('title', 0.08, 0.7, 0.84, 0.1),
        textSlot('caption', 0.08, 0.81, 0.84, 0.04),
      ],
      spec.motif([], true),
    );
  },
};

const tape = (f: Frame): Element =>
  deco('rect', f.x + f.w / 2 - 0.07, f.y - 0.012, 0.14, 0.026, {
    fill: '#f3e3a4',
    opacity: 0.85,
    rotation: -4,
  });

const carnet: Spec = {
  theme: {
    id: 'carnet',
    name: 'Carnet',
    coverTemplateId: 'b-carnet-c',
    fonts: ['Lora', 'IBM Plex Sans'],
  },
  background: { kind: 'color', color: '#eadcc4' },
  cards: true,
  motif: (frames) => frames.map(tape),
  cover(spec, meta) {
    const card = { x: 0.1, y: 0.1, w: 0.8, h: 0.74, rotation: 2 };
    const photo = onCard(card, 2, { x: 0.05, y: 0.04, w: 0.9, h: 0.78 });
    const title = onCard(card, 2, { x: 0.08, y: 0.85, w: 0.84, h: 0.1 });
    return freeTemplate(
      meta,
      [
        photoSlot(photo.x, photo.y, photo.w, photo.h, { rotation: 2 }),
        textSlot('title', title.x, title.y, title.w, title.h, 2),
      ],
      [
        deco('rect', card.x, card.y, card.w, card.h, {
          fill: '#ffffff',
          stroke: HAIR,
          rotation: 2,
        }),
        tape(card),
      ],
    );
  },
};

const confetti = (): Element[] => {
  const colours = ['#f4c06a', '#e89bb0', '#9bc4e8', '#b7a6e0'];
  const at: [number, number, 'star' | 'ellipse', number][] = [
    [0.04, 0.02, 'star', 0.05],
    [0.88, 0.03, 'ellipse', 0.03],
    [0.93, 0.12, 'star', 0.04],
    [0.02, 0.5, 'ellipse', 0.025],
    [0.95, 0.55, 'star', 0.045],
    [0.05, 0.93, 'ellipse', 0.035],
    [0.9, 0.94, 'star', 0.05],
    [0.45, 0.97, 'ellipse', 0.022],
  ];
  return at.map(([x, y, kind, size], i) =>
    deco(kind, x, y, size, roundH(size), {
      fill: colours[i % colours.length] as string,
      opacity: 0.8,
      points: 5,
    }),
  );
};

const fete: Spec = {
  theme: { id: 'fete', name: 'Fête', coverTemplateId: 'b-fete-c', fonts: ['Inter', 'Lora'] },
  background: sky('#fbeaf0', '#f1ecfa'),
  cards: true,
  mask: { kind: 'rounded', radius: 4 },
  motif: () => confetti(),
  cover(spec, meta) {
    return freeTemplate(
      meta,
      [
        photoSlot(0.16, 0.14, 0.68, roundH(0.68), { mask: preset('hexagon') }),
        textSlot('title', 0.1, 0.66, 0.8, 0.1),
        textSlot('caption', 0.2, 0.78, 0.6, 0.05),
      ],
      spec.motif([], true),
    );
  },
};

const SPECS: Spec[] = [plage, montagne, foret, ville, carnet, fete];

export const themes = (): Theme[] => SPECS.map((s) => s.theme);

/** Every template of every theme: each theme's cover, then its pages. */
export function themedTemplates(): Template[] {
  return SPECS.flatMap((spec) => {
    const coverMeta: Meta = {
      id: `${spec.theme.id}-c`,
      name: `${spec.theme.name}, couverture`,
      category: 'couverture',
      themeId: spec.theme.id,
      background: spec.background,
    };
    return [spec.cover(spec, coverMeta), ...pages(spec)];
  });
}
