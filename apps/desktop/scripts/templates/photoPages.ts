/**
 * The "Classique" photo pages: arrangements of 1 to 16 photos (grids, rows of unequal frames,
 * mosaics, a few free collages), each in the frames a page needs: full bleed, margins, with a
 * caption, with a title, and with text beside or under the photos where the count leaves room.
 */
import type { LayoutNode, Template } from '@travelbook/core';
import {
  P,
  T,
  col,
  colOf,
  deco,
  freeTemplate,
  grid,
  gridTemplate,
  hline,
  onCard,
  photoSlot,
  preset,
  ROUND,
  row,
  rowOf,
  textSlot,
} from './dsl.ts';
import { mosaic } from './mosaic.ts';

/** How a page frames its photos. */
type Mode = 'margins' | 'bleed' | 'caption' | 'title' | 'text' | 'side';

interface Arrangement {
  /** Id fragment, unique within the photo count. */
  key: string;
  /** French name of the arrangement. */
  name: string;
  body: LayoutNode;
  modes: Mode[];
}

const MODE_ID: Record<Mode, string> = {
  margins: 'm',
  bleed: 'b',
  caption: 'c',
  title: 't',
  text: 'x',
  side: 's',
};
const MODE_NAME: Record<Mode, string> = {
  margins: '',
  bleed: ' plein cadre',
  caption: ' avec légende',
  title: ' avec titre',
  text: ' avec texte dessous',
  side: ' avec texte à côté',
};

/** The page layout of `body` in one mode. Text takes a little more room when there are many photos. */
function frame(mode: Mode, body: LayoutNode, photos: number): { root: LayoutNode; bleed: boolean } {
  switch (mode) {
    case 'margins':
      return { root: body, bleed: false };
    case 'bleed':
      return { root: body, bleed: true };
    case 'caption':
      return { root: col([14, 1], [body, T('caption')]), bleed: false };
    case 'title':
      return { root: col([1, 9], [T('title'), body]), bleed: false };
    case 'text':
      return { root: col(photos > 4 ? [5, 1] : [3, 1], [body, T('body')]), bleed: false };
    case 'side':
      return { root: row([3, 2], [body, T('body')]), bleed: false };
  }
}

function pages(photos: number, list: Arrangement[]): Template[] {
  return list.flatMap((a) =>
    a.modes.map((mode) => {
      const { root, bleed } = frame(mode, a.body, photos);
      return gridTemplate(
        { id: `p${photos}-${a.key}-${MODE_ID[mode]}`, name: `${a.name}${MODE_NAME[mode]}` },
        root,
        bleed,
      );
    }),
  );
}

const MB: Mode[] = ['margins', 'bleed'];

// ---------------------------------------------------------------- 1 photo

const one = (): Template[] => [
  ...pages(1, [
    {
      key: 'photo',
      name: 'Une photo',
      body: P,
      modes: ['margins', 'bleed', 'caption', 'title', 'text', 'side'],
    },
  ]),
  // Smaller than the page, so a free layout.
  freeTemplate({ id: 'p1-centree', name: 'Photo centrée' }, [photoSlot(0.16, 0.2, 0.68, 0.6)], []),
  freeTemplate(
    { id: 'p1-decalee', name: 'Photo décalée et titre' },
    [photoSlot(0.3, 0.26, 0.62, 0.64), textSlot('title', 0.08, 0.08, 0.84, 0.1)],
    [hline(0.08, 0.2, 0.3, '#1f1f1f', 0.5)],
  ),
  (() => {
    const card = { x: 0.12, y: 0.16, w: 0.76, h: 0.66 };
    const photo = onCard(card, -3, { x: 0.07, y: 0.06, w: 0.86, h: 0.74 });
    const caption = onCard(card, -3, { x: 0.08, y: 0.84, w: 0.84, h: 0.1 });
    return freeTemplate(
      { id: 'p1-polaroid', name: 'Polaroïd' },
      [
        photoSlot(photo.x, photo.y, photo.w, photo.h, { rotation: -3 }),
        textSlot('caption', caption.x, caption.y, caption.w, caption.h, -3),
      ],
      [
        deco('rect', card.x, card.y, card.w, card.h, {
          fill: '#ffffff',
          stroke: { width: 0.3, color: '#cfcfcf' },
          rotation: -3,
        }),
      ],
    );
  })(),
  freeTemplate(
    { id: 'p1-medaillon', name: 'Médaillon et titre' },
    [
      photoSlot(0.14, 0.12, 0.72, 0.72 * (210 / 297), { mask: ROUND }),
      textSlot('title', 0.1, 0.72, 0.8, 0.1),
    ],
    [
      deco('ellipse', 0.1, 0.085, 0.8, 0.8 * (210 / 297), {
        stroke: { width: 0.5, color: '#1f1f1f' },
      }),
    ],
  ),
  freeTemplate(
    { id: 'p1-arche', name: 'Arche et légende' },
    [
      photoSlot(0.2, 0.12, 0.6, 0.66, { mask: preset('arch') }),
      textSlot('caption', 0.15, 0.84, 0.7, 0.06),
    ],
    [],
  ),
  freeTemplate(
    { id: 'p1-cadre', name: 'Photo dans un cadre fin' },
    [photoSlot(0.14, 0.12, 0.72, 0.7)],
    [
      deco('rect', 0.1, 0.085, 0.8, 0.77, { stroke: { width: 0.5, color: '#1f1f1f' } }),
      hline(0.38, 0.9, 0.24, '#1f1f1f', 0.5),
    ],
  ),
];

// ---------------------------------------------------------------- 2 photos

const two = (): Template[] => [
  ...pages(2, [
    {
      key: 'cote',
      name: 'Deux côte à côte',
      body: rowOf(2),
      modes: ['margins', 'bleed', 'caption', 'title', 'text'],
    },
    { key: 'pile', name: 'Deux empilées', body: colOf(2), modes: ['margins', 'bleed', 'title'] },
    {
      key: 'grande',
      name: 'Une grande, une petite',
      body: row([3, 2], [P, P]),
      modes: ['margins', 'bleed', 'caption'],
    },
    {
      key: 'haute',
      name: 'Grande et petite empilées',
      body: col([2, 1], [P, P]),
      modes: ['margins', 'bleed'],
    },
  ]),
  (() => {
    const a = { x: 0.1, y: 0.1, w: 0.62, h: 0.34 };
    const b = { x: 0.28, y: 0.5, w: 0.62, h: 0.34 };
    return freeTemplate(
      { id: 'p2-inclinees', name: 'Deux photos inclinées' },
      [
        photoSlot(a.x, a.y, a.w, a.h, { rotation: -4 }),
        photoSlot(b.x, b.y, b.w, b.h, { rotation: 3 }),
      ],
      [],
    );
  })(),
  freeTemplate(
    { id: 'p2-medaillons', name: 'Deux médaillons' },
    [
      photoSlot(0.1, 0.1, 0.62, 0.62 * (210 / 297), { mask: ROUND }),
      photoSlot(0.28, 0.5, 0.62, 0.62 * (210 / 297), { mask: ROUND }),
    ],
    [],
  ),
];

// ---------------------------------------------------------------- 3 photos

const three = (): Template[] => [
  ...pages(3, [
    {
      key: 'bandes',
      name: 'Trois bandes',
      body: colOf(3),
      modes: ['margins', 'bleed', 'caption', 'title'],
    },
    {
      key: 'colonnes',
      name: 'Trois colonnes',
      body: rowOf(3),
      modes: ['margins', 'bleed', 'caption'],
    },
    {
      key: 'droite',
      name: 'Une grande, deux petites à droite',
      body: row([2, 1], [P, colOf(2)]),
      modes: ['margins', 'bleed', 'caption', 'text'],
    },
    {
      key: 'dessous',
      name: 'Une grande, deux petites dessous',
      body: col([3, 2], [P, rowOf(2)]),
      modes: ['margins', 'bleed', 'title'],
    },
    {
      key: 'dessus',
      name: 'Deux petites, une grande',
      body: col([2, 3], [rowOf(2), P]),
      modes: MB,
    },
    {
      key: 'inegales',
      name: 'Trois bandes inégales',
      body: col([2, 3, 2], [P, P, P]),
      modes: ['margins'],
    },
  ]),
  (() => {
    const cards = [
      { x: 0.1, y: 0.06, w: 0.52, h: 0.3, r: -4 },
      { x: 0.36, y: 0.35, w: 0.52, h: 0.3, r: 3 },
      { x: 0.1, y: 0.64, w: 0.52, h: 0.3, r: -2 },
    ];
    return freeTemplate(
      { id: 'p3-cartes', name: 'Trois polaroïds' },
      cards.map((c) => {
        const p = onCard(c, c.r, { x: 0.06, y: 0.06, w: 0.88, h: 0.74 });
        return photoSlot(p.x, p.y, p.w, p.h, { rotation: c.r });
      }),
      cards.map((c) =>
        deco('rect', c.x, c.y, c.w, c.h, {
          fill: '#ffffff',
          stroke: { width: 0.3, color: '#cfcfcf' },
          rotation: c.r,
        }),
      ),
    );
  })(),
];

// ---------------------------------------------------------------- 4 photos

const four = (): Template[] => [
  ...pages(4, [
    {
      key: 'cases',
      name: 'Quatre cases',
      body: grid([2, 2]),
      modes: ['margins', 'bleed', 'caption', 'title', 'text'],
    },
    { key: 'bandes', name: 'Quatre bandes', body: colOf(4), modes: MB },
    {
      key: 'dessous',
      name: 'Une grande, trois petites dessous',
      body: col([3, 1], [P, rowOf(3)]),
      modes: ['margins', 'bleed', 'caption'],
    },
    {
      key: 'droite',
      name: 'Une grande, trois petites à droite',
      body: row([3, 1], [P, colOf(3)]),
      modes: ['margins', 'bleed', 'title'],
    },
    {
      key: 'decalees',
      name: 'Colonnes décalées',
      body: row([1, 1], [col([2, 1], [P, P]), col([1, 2], [P, P])]),
      modes: MB,
    },
    {
      key: 'mosaique',
      name: 'Mosaïque de quatre',
      body: col([1, 1], [row([2, 1], [P, P]), row([1, 2], [P, P])]),
      modes: MB,
    },
  ]),
];

// ---------------------------------------------------------------- 5 and 6 photos

const five = (): Template[] =>
  pages(5, [
    {
      key: 'deux-trois',
      name: 'Deux et trois',
      body: grid([2, 3]),
      modes: ['margins', 'bleed', 'caption', 'title', 'text'],
    },
    { key: 'trois-deux', name: 'Trois et deux', body: grid([3, 2]), modes: MB },
    {
      key: 'quatre-petites',
      name: 'Une grande, quatre petites',
      body: col([2, 1], [P, rowOf(4)]),
      modes: ['margins', 'bleed', 'caption'],
    },
    {
      key: 'grille',
      name: 'Une grande, quatre en grille',
      body: row([3, 2], [P, grid([2, 2])]),
      modes: MB,
    },
    { key: 'mosaique', name: 'Mosaïque de cinq', body: mosaic(5, 11), modes: MB },
  ]);

const six = (): Template[] =>
  pages(6, [
    {
      key: 'deux-colonnes',
      name: 'Six en deux colonnes',
      body: grid([2, 2, 2]),
      modes: ['margins', 'bleed', 'caption', 'title', 'text'],
    },
    {
      key: 'deux-rangees',
      name: 'Six en deux rangées',
      body: grid([3, 3]),
      modes: ['margins', 'bleed', 'caption'],
    },
    {
      key: 'cinq-petites',
      name: 'Une grande, cinq petites',
      body: row([2, 1], [P, colOf(5)]),
      modes: MB,
    },
    {
      key: 'deux-quatre',
      name: 'Deux grandes, quatre petites',
      body: col([2, 1], [rowOf(2), rowOf(4)]),
      modes: MB,
    },
    { key: 'mosaique', name: 'Mosaïque de six', body: mosaic(6, 21), modes: MB },
  ]);

// ---------------------------------------------------------------- 7 to 16 photos

const many = (): Template[] => [
  ...pages(7, [
    {
      key: 'deux-trois-deux',
      name: 'Deux, trois, deux',
      body: grid([2, 3, 2]),
      modes: ['margins', 'bleed', 'caption'],
    },
    {
      key: 'six-petites',
      name: 'Une grande, six petites',
      body: row([1, 1], [P, grid([2, 2, 2])]),
      modes: MB,
    },
    { key: 'mosaique', name: 'Mosaïque de sept', body: mosaic(7, 31), modes: MB },
  ]),
  ...pages(8, [
    {
      key: 'deux-colonnes',
      name: 'Huit en deux colonnes',
      body: grid([2, 2, 2, 2]),
      modes: ['margins', 'bleed', 'caption', 'title'],
    },
    { key: 'trois-deux-trois', name: 'Trois, deux, trois', body: grid([3, 2, 3]), modes: MB },
    {
      key: 'sept-petites',
      name: 'Une grande, sept petites',
      body: row([1, 1], [P, grid([2, 3, 2])]),
      modes: MB,
    },
    { key: 'mosaique', name: 'Mosaïque de huit', body: mosaic(8, 41), modes: MB },
  ]),
  ...pages(9, [
    {
      key: 'cases',
      name: 'Neuf cases',
      body: grid([3, 3, 3]),
      modes: ['margins', 'bleed', 'caption', 'title'],
    },
    {
      key: 'huit-petites',
      name: 'Une grande, huit petites',
      body: col([1, 1], [P, grid([4, 4])]),
      modes: MB,
    },
    { key: 'mosaique', name: 'Mosaïque de neuf', body: mosaic(9, 51), modes: MB },
  ]),
  ...pages(10, [
    {
      key: 'deux-colonnes',
      name: 'Dix en deux colonnes',
      body: grid([2, 2, 2, 2, 2]),
      modes: ['margins', 'bleed', 'caption'],
    },
    { key: 'trois-quatre-trois', name: 'Trois, quatre, trois', body: grid([3, 4, 3]), modes: MB },
    { key: 'mosaique', name: 'Mosaïque de dix', body: mosaic(10, 61), modes: MB },
  ]),
  ...pages(11, [
    {
      key: 'trois-quatre-quatre',
      name: 'Onze en trois rangées',
      body: grid([4, 4, 3]),
      modes: ['margins', 'bleed', 'caption'],
    },
    { key: 'mosaique', name: 'Mosaïque de onze', body: mosaic(11, 66), modes: MB },
  ]),
  ...pages(12, [
    {
      key: 'cases',
      name: 'Douze cases',
      body: grid([3, 3, 3, 3]),
      modes: ['margins', 'bleed', 'caption', 'title'],
    },
    { key: 'trois-rangees', name: 'Douze en trois rangées', body: grid([4, 4, 4]), modes: MB },
    { key: 'mosaique', name: 'Mosaïque de douze', body: mosaic(12, 71), modes: MB },
  ]),
  ...pages(13, [
    {
      key: 'cases',
      name: 'Treize photos',
      body: grid([4, 5, 4]),
      modes: ['margins', 'bleed', 'caption'],
    },
    { key: 'mosaique', name: 'Mosaïque de treize', body: mosaic(13, 76), modes: MB },
  ]),
  ...pages(14, [
    {
      key: 'cases',
      name: 'Quatorze en deux colonnes',
      body: grid([2, 2, 2, 2, 2, 2, 2]),
      modes: ['margins', 'bleed', 'caption'],
    },
    { key: 'mosaique', name: 'Mosaïque de quatorze', body: mosaic(14, 86), modes: MB },
  ]),
  ...pages(15, [
    {
      key: 'cases',
      name: 'Quinze cases',
      body: grid([3, 3, 3, 3, 3]),
      modes: ['margins', 'bleed', 'caption'],
    },
    { key: 'cinq-rangees', name: 'Quinze en trois rangées', body: grid([5, 5, 5]), modes: MB },
  ]),
  ...pages(16, [
    {
      key: 'cases',
      name: 'Seize cases',
      body: grid([4, 4, 4, 4]),
      modes: ['margins', 'bleed', 'caption', 'title'],
    },
    { key: 'mosaique', name: 'Mosaïque de seize', body: mosaic(16, 81), modes: MB },
    { key: 'cinq-six-cinq', name: 'Cinq, six, cinq', body: grid([5, 6, 5]), modes: MB },
  ]),
  ...collages(),
];

/** Free collages for many photos. */
function collages(): Template[] {
  const roundH = (w: number): number => w * (210 / 297);

  // A rosette: one photo in the middle, six round ones around it.
  const rosette = (() => {
    const mid = { w: 0.34 };
    const small = { w: 0.27 };
    const slots = [
      photoSlot(0.5 - mid.w / 2, 0.5 - roundH(mid.w) / 2, mid.w, roundH(mid.w), { mask: ROUND }),
    ];
    for (let i = 0; i < 6; i++) {
      const angle = (-90 + 60 * i) * (Math.PI / 180);
      const cx = 0.5 + 0.33 * Math.cos(angle);
      const cy = 0.5 + 0.33 * (210 / 297) * Math.sin(angle);
      slots.push(
        photoSlot(cx - small.w / 2, cy - roundH(small.w) / 2, small.w, roundH(small.w), {
          mask: ROUND,
        }),
      );
    }
    return freeTemplate({ id: 'p7-rosace', name: 'Rosace de sept' }, slots, [
      deco('ellipse', 0.09, 0.5 - roundH(0.82) / 2, 0.82, roundH(0.82), {
        stroke: { width: 0.3, color: '#8a8a8a' },
      }),
    ]);
  })();

  // Nine photos thrown on a table: a 3 x 3 scatter, each one a little off and tilted.
  const tilts = [-5, 3, -2, 4, -3, 2, -4, 5, -1];
  const scatter = freeTemplate(
    { id: 'p9-eparpille', name: 'Neuf photos éparpillées' },
    tilts.map((rotation, i) => {
      const c = i % 3;
      const r = Math.floor(i / 3);
      const jx = [0.01, -0.015, 0.02, -0.01, 0.015, -0.02, 0.0, 0.01, -0.01][i] as number;
      const jy = [0.01, -0.01, 0.015, -0.015, 0.01, 0.0, -0.01, 0.015, -0.01][i] as number;
      return photoSlot(0.07 + c * 0.3 + jx, 0.06 + r * 0.31 + jy, 0.26, 0.26, { rotation });
    }),
    [],
  );

  // Twelve photos overlapping like a pin-board.
  const board = freeTemplate(
    { id: 'p12-pele-mele', name: 'Pêle-mêle de douze' },
    Array.from({ length: 12 }, (_, i) => {
      const c = i % 3;
      const r = Math.floor(i / 3);
      const rotation = [-6, 4, -3, 5, -4, 2, -2, 6, -5, 3, -6, 4][i] as number;
      const wide = (c + r) % 2 === 0;
      const w = wide ? 0.34 : 0.28;
      const h = wide ? 0.2 : 0.23;
      return photoSlot(
        0.05 + c * 0.3 + (wide ? 0 : 0.03),
        0.04 + r * 0.24 + (wide ? 0 : 0.01),
        w,
        h,
        {
          rotation,
        },
      );
    }),
    [],
  );

  // Sixteen small windows in four columns, every other column a little lower.
  const stagger = freeTemplate(
    { id: 'p16-decalees', name: 'Seize en colonnes décalées' },
    Array.from({ length: 16 }, (_, i) => {
      const c = i % 4;
      const r = Math.floor(i / 4);
      return photoSlot(0.06 + c * 0.225, 0.04 + r * 0.225 + (c % 2 === 0 ? 0 : 0.05), 0.2, 0.19);
    }),
    [],
  );

  // Sixteen small photos laid out in the outline of a heart on a 5 x 5 pattern.
  const heart = ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'];
  const pitch = 0.18;
  const cell = { w: 0.165, h: 0.165 * (210 / 297) };
  const heartSlots = heart.flatMap((line, r) =>
    [...line].flatMap((mark, c) =>
      mark === 'X'
        ? [
            photoSlot(
              0.5 - (5 * pitch) / 2 + c * pitch + (pitch - cell.w) / 2,
              0.18 + r * pitch * (210 / 297) + 0.005,
              cell.w,
              cell.h,
            ),
          ]
        : [],
    ),
  );
  const heartCollage = freeTemplate({ id: 'p16-coeur', name: 'Cœur de seize photos' }, heartSlots);

  return [rosette, scatter, board, stagger, heartCollage];
}

export function photoPages(): Template[] {
  return [...one(), ...two(), ...three(), ...four(), ...five(), ...six(), ...many()];
}
