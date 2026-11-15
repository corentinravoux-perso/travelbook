/** Opening and chapter pages: a large title, with room for a photo or two. */
import type { Template } from '@travelbook/core';
import {
  P,
  T,
  col,
  deco,
  freeTemplate,
  gridTemplate,
  hline,
  photoSlot,
  ROUND,
  rowOf,
  textSlot,
  type Meta,
} from './dsl.ts';

const INK = '#1f1f1f';
const opening = (id: string, name: string): Meta => ({
  id: `o-${id}`,
  name,
  category: 'ouverture',
});
const roundH = (w: number): number => w * (210 / 297);

export function openings(): Template[] {
  return [
    freeTemplate(
      opening('titre', 'Titre de chapitre'),
      [textSlot('title', 0.1, 0.4, 0.8, 0.14)],
      [hline(0.4, 0.36, 0.2, INK, 0.6)],
    ),
    freeTemplate(
      opening('titre-sous-titre', 'Chapitre et sous-titre'),
      [textSlot('title', 0.1, 0.38, 0.8, 0.14), textSlot('caption', 0.15, 0.54, 0.7, 0.06)],
      [hline(0.4, 0.34, 0.2, INK, 0.6)],
    ),
    freeTemplate(
      opening('bas', 'Chapitre en bas de page'),
      [textSlot('title', 0.1, 0.7, 0.8, 0.12), textSlot('caption', 0.1, 0.83, 0.8, 0.05)],
      [hline(0.1, 0.67, 0.3, INK, 0.6)],
    ),
    freeTemplate(
      opening('encadre', 'Titre encadré'),
      [textSlot('title', 0.2, 0.43, 0.6, 0.12)],
      [deco('rect', 0.12, 0.34, 0.76, 0.3, { stroke: { width: 0.5, color: INK } })],
    ),
    freeTemplate(
      opening('bande', 'Titre sur une bande'),
      [textSlot('title', 0.1, 0.42, 0.8, 0.12)],
      [deco('rect', 0, 0.36, 1, 0.24, { fill: '#e6e6e0' })],
    ),
    freeTemplate(
      opening('numero', 'Chapitre dans un cercle'),
      [textSlot('title', 0.28, 0.4, 0.44, 0.1), textSlot('caption', 0.2, 0.7, 0.6, 0.05)],
      [
        deco('ellipse', 0.2, 0.5 - roundH(0.6) / 2 - 0.02, 0.6, roundH(0.6), {
          stroke: { width: 0.5, color: INK },
        }),
      ],
    ),
    freeTemplate(
      opening('citation', 'Citation'),
      [textSlot('body', 0.16, 0.36, 0.68, 0.2), textSlot('caption', 0.16, 0.6, 0.68, 0.05)],
      [hline(0.46, 0.3, 0.08, INK, 0.6)],
    ),
    gridTemplate(
      opening('photo-titre', 'Photo et titre de chapitre'),
      col([6, 1, 1], [P, T('title'), T('caption')]),
    ),
    freeTemplate(
      opening('photo-pleine', 'Grande photo et titre'),
      [photoSlot(-0.015, -0.011, 1.03, 0.68), textSlot('title', 0.1, 0.74, 0.8, 0.12)],
      [hline(0.4, 0.71, 0.2, INK, 0.6)],
    ),
    freeTemplate(
      opening('photo-ronde', 'Photo ronde et titre'),
      [
        photoSlot(0.25, 0.14, 0.5, roundH(0.5), { mask: ROUND }),
        textSlot('title', 0.1, 0.56, 0.8, 0.12),
      ],
      [],
    ),
    freeTemplate(
      opening('photo-coin', 'Photo en coin et titre'),
      [photoSlot(0.4, 0.06, 0.54, 0.4), textSlot('title', 0.08, 0.56, 0.84, 0.14)],
      [hline(0.08, 0.52, 0.3, INK, 0.6)],
    ),
    gridTemplate(
      opening('deux-photos', 'Deux photos et titre'),
      col([4, 1], [rowOf(2), T('title')]),
    ),
    gridTemplate(
      opening('trois-photos', 'Trois photos et titre'),
      col([4, 1], [rowOf(3), T('title')]),
    ),
  ];
}
