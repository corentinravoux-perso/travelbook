/**
 * Front covers. They are applied to the front page of the cover (the layout box of that page),
 * and a cover template holds the photo frames and the title. Most are free layouts: a title
 * needs room that a photo does not take, and a few shapes (polaroid cards, rings, a film strip)
 * are decorations under the frames.
 */
import type { Template } from '@travelbook/core';
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
  type Meta,
} from './dsl.ts';
import { mosaic } from './mosaic.ts';

const INK = '#1f1f1f';
const HAIR = { width: 0.3, color: '#cfcfcf' };
const cover = (id: string, name: string): Meta => ({ id: `c-${id}`, name, category: 'couverture' });
const roundH = (w: number): number => w * (210 / 297);

/** A white card with a thin edge, `rotation` degrees about its centre. */
const card = (c: { x: number; y: number; w: number; h: number }, rotation = 0) =>
  deco('rect', c.x, c.y, c.w, c.h, { fill: '#ffffff', stroke: HAIR, rotation });

function gridCovers(): Template[] {
  return [
    gridTemplate(cover('photo-titre', 'Photo et titre'), col([6, 1], [P, T('title')])),
    gridTemplate(
      cover('photo-titre-legende', 'Photo, titre et légende'),
      col([10, 2, 1], [P, T('title'), T('caption')]),
    ),
    gridTemplate(cover('titre-haut', 'Titre en haut'), col([1, 6], [T('title'), P])),
    gridTemplate(cover('plein-cadre', 'Plein cadre'), P, true),
    gridTemplate(cover('deux-titre', 'Deux photos et titre'), col([5, 1], [rowOf(2), T('title')])),
    gridTemplate(
      cover('deux-empilees', 'Deux empilées et titre'),
      col([5, 5, 2], [P, P, T('title')]),
    ),
    gridTemplate(
      cover('trois-titre', 'Trois colonnes et titre'),
      col([5, 1], [rowOf(3), T('title')]),
    ),
    gridTemplate(
      cover('quatre-titre', 'Quatre cases et titre'),
      col([5, 1], [grid([2, 2]), T('title')]),
    ),
    gridTemplate(
      cover('grande-petites', 'Une grande, trois petites et titre'),
      col([8, 1], [col([3, 1], [P, rowOf(3)]), T('title')]),
    ),
    gridTemplate(
      cover('six-titre', 'Six cases et titre'),
      col([5, 1], [grid([2, 2, 2]), T('title')]),
    ),
    gridTemplate(
      cover('mosaique-titre', 'Mosaïque et titre'),
      col([5, 1], [mosaic(6, 101), T('title')]),
    ),
    gridTemplate(
      cover('colonne-titre', 'Colonne de photos et titre'),
      row([3, 2], [colOf(3), col([2, 1], [T('title'), T('caption')])]),
    ),
  ];
}

function freeCovers(): Template[] {
  const out: Template[] = [];

  // One polaroid, then two and three of them.
  const polaroid = (
    id: string,
    name: string,
    cards: { x: number; y: number; w: number; h: number; r: number }[],
  ) => {
    const slots = cards.flatMap((c, i) => {
      const photo = onCard(c, c.r, { x: 0.06, y: 0.05, w: 0.88, h: 0.76 });
      const photoFrame = photoSlot(photo.x, photo.y, photo.w, photo.h, { rotation: c.r });
      if (i !== cards.length - 1) return [photoFrame];
      const title = onCard(c, c.r, { x: 0.08, y: 0.84, w: 0.84, h: 0.11 });
      return [photoFrame, textSlot('title', title.x, title.y, title.w, title.h, c.r)];
    });
    return freeTemplate(
      cover(id, name),
      slots,
      cards.map((c) => card(c, c.r)),
    );
  };
  out.push(polaroid('polaroid', 'Polaroïd', [{ x: 0.12, y: 0.12, w: 0.76, h: 0.74, r: -3 }]));
  out.push(
    polaroid('deux-polaroids', 'Deux polaroïds', [
      { x: 0.08, y: 0.08, w: 0.56, h: 0.5, r: -5 },
      { x: 0.34, y: 0.4, w: 0.58, h: 0.52, r: 4 },
    ]),
  );
  out.push(
    polaroid('trois-polaroids', 'Trois polaroïds', [
      { x: 0.06, y: 0.06, w: 0.46, h: 0.36, r: -6 },
      { x: 0.46, y: 0.18, w: 0.46, h: 0.36, r: 5 },
      { x: 0.22, y: 0.5, w: 0.56, h: 0.44, r: -2 },
    ]),
  );

  // Photos in a shape, a ring or a thin frame, and the title under them.
  const shaped = (
    id: string,
    name: string,
    mask: ReturnType<typeof preset>,
    w: number,
    h: number,
    ring: boolean,
  ) => {
    const x = (1 - w) / 2;
    const y = 0.1;
    return freeTemplate(
      cover(id, name),
      [photoSlot(x, y, w, h, { mask }), textSlot('title', 0.1, y + h + 0.06, 0.8, 0.1)],
      ring
        ? [
            deco('ellipse', x - 0.04, y - 0.03, w + 0.08, h + 0.06, {
              stroke: { width: 0.5, color: INK },
            }),
          ]
        : [],
    );
  };
  out.push(shaped('medaillon', 'Médaillon', ROUND, 0.7, roundH(0.7), true));
  out.push(shaped('arche', 'Arche', preset('arch'), 0.62, 0.62, false));
  out.push(shaped('coeur', 'Cœur', preset('heart'), 0.7, roundH(0.7), false));
  out.push(shaped('hexagone', 'Hexagone', preset('hexagon'), 0.7, roundH(0.7), false));
  out.push(shaped('galet', 'Galet', preset('blob'), 0.74, 0.5, false));

  out.push(
    frameCover(),
    freeTemplate(
      cover('bandeau-couleur', 'Photo et bandeau coloré'),
      [
        photoSlot(-0.015, -0.011, 1.03, 0.62),
        textSlot('title', 0.1, 0.68, 0.8, 0.12),
        textSlot('caption', 0.15, 0.82, 0.7, 0.05),
      ],
      [deco('rect', 0, 0.6, 1, 0.4, { fill: '#efe4d0' })],
    ),
    freeTemplate(
      cover('fenetre', 'Fenêtre'),
      [photoSlot(0.2, 0.16, 0.6, 0.5), textSlot('title', 0.1, 0.72, 0.8, 0.1)],
      [deco('rect', 0.1, 0.08, 0.8, 0.66, { fill: '#e6e6e0' })],
    ),
    freeTemplate(
      cover('bande-large', 'Bande de photo'),
      [
        textSlot('title', 0.1, 0.1, 0.8, 0.12),
        photoSlot(-0.015, 0.3, 1.03, 0.4),
        textSlot('caption', 0.1, 0.76, 0.8, 0.05),
      ],
      [hline(0.1, 0.25, 0.8, INK, 0.4)],
    ),
    freeTemplate(
      cover('pellicule', 'Pellicule'),
      [
        photoSlot(0.12, 0.07, 0.34, 0.25),
        photoSlot(0.12, 0.35, 0.34, 0.25),
        photoSlot(0.12, 0.63, 0.34, 0.25),
        textSlot('title', 0.54, 0.38, 0.38, 0.2),
      ],
      [deco('rect', 0.08, 0, 0.42, 1, { fill: INK })],
    ),
    freeTemplate(
      cover('quinconce', 'Deux photos en quinconce'),
      [
        photoSlot(0.06, 0.06, 0.6, 0.38),
        photoSlot(0.34, 0.42, 0.6, 0.38),
        textSlot('title', 0.06, 0.86, 0.88, 0.09),
      ],
      [],
    ),
    freeTemplate(
      cover('ronde-haut', 'Photo ronde en haut'),
      [
        photoSlot(0.25, 0.08, 0.5, roundH(0.5), { mask: ROUND }),
        textSlot('title', 0.1, 0.5, 0.8, 0.12),
        textSlot('caption', 0.2, 0.64, 0.6, 0.05),
      ],
      [hline(0.4, 0.47, 0.2, INK, 0.5)],
    ),
    freeTemplate(
      cover('decalee', 'Photo décalée'),
      [photoSlot(0.28, 0.2, 0.64, 0.7), textSlot('title', 0.08, 0.06, 0.8, 0.1)],
      [deco('rect', 0.08, 0.28, 0.34, 0.6, { fill: '#e6e6e0' })],
    ),
    freeTemplate(
      cover('deux-medaillons', 'Deux médaillons'),
      [
        photoSlot(0.1, 0.12, 0.5, roundH(0.5), { mask: ROUND }),
        photoSlot(0.4, 0.36, 0.5, roundH(0.5), { mask: ROUND }),
        textSlot('title', 0.1, 0.74, 0.8, 0.1),
      ],
      [],
    ),
    freeTemplate(
      cover('trois-medaillons', 'Trois médaillons'),
      [
        photoSlot(0.05, 0.24, 0.28, roundH(0.28), { mask: ROUND }),
        photoSlot(0.36, 0.24, 0.28, roundH(0.28), { mask: ROUND }),
        photoSlot(0.67, 0.24, 0.28, roundH(0.28), { mask: ROUND }),
        textSlot('title', 0.1, 0.5, 0.8, 0.12),
      ],
      [hline(0.1, 0.47, 0.8, INK, 0.4)],
    ),
    freeTemplate(
      cover('quatre-inclinees', 'Quatre photos inclinées'),
      [
        photoSlot(0.07, 0.07, 0.4, 0.28, { rotation: -4 }),
        photoSlot(0.53, 0.09, 0.4, 0.28, { rotation: 3 }),
        photoSlot(0.07, 0.41, 0.4, 0.28, { rotation: 3 }),
        photoSlot(0.53, 0.43, 0.4, 0.28, { rotation: -3 }),
        textSlot('title', 0.1, 0.74, 0.8, 0.12),
      ],
      [],
    ),
  );

  // No photo: the title does the work.
  out.push(
    freeTemplate(
      cover('titre-encadre', 'Titre encadré'),
      [textSlot('title', 0.16, 0.38, 0.68, 0.14), textSlot('caption', 0.2, 0.55, 0.6, 0.05)],
      [
        deco('rect', 0.08, 0.06, 0.84, 0.88, { stroke: { width: 0.6, color: INK } }),
        deco('rect', 0.1, 0.075, 0.8, 0.85, { stroke: { width: 0.25, color: INK } }),
      ],
    ),
    freeTemplate(
      cover('titre-seul', 'Titre seul'),
      [textSlot('title', 0.1, 0.4, 0.8, 0.14)],
      [hline(0.4, 0.36, 0.2, INK, 0.6), hline(0.4, 0.58, 0.2, INK, 0.6)],
    ),
  );
  return out;
}

/** One photo in a thin offset frame, the title under it. */
function frameCover(): Template {
  return freeTemplate(
    cover('cadre-fin', 'Photo dans un cadre fin'),
    [photoSlot(0.14, 0.1, 0.72, 0.62), textSlot('title', 0.1, 0.8, 0.8, 0.1)],
    [deco('rect', 0.1, 0.066, 0.8, 0.7, { stroke: { width: 0.5, color: INK } })],
  );
}

export function covers(): Template[] {
  return [...gridCovers(), ...freeCovers()];
}
