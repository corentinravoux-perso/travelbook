/**
 * Templates for a whole spread (both pages at once). They are laid out in the spread's box, so
 * a grid runs across the fold.
 */
import type { Template } from '@travelbook/core';
import {
  P,
  T,
  col,
  colOf,
  freeTemplate,
  grid,
  gridTemplate,
  hline,
  photoSlot,
  row,
  rowOf,
  textSlot,
  type Meta,
} from './dsl.ts';
import { mosaic } from './mosaic.ts';

const INK = '#1f1f1f';
const spread = (id: string, name: string): Meta => ({
  id: `d-${id}`,
  name,
  category: 'double',
  scope: 'spread',
});

export function spreads(): Template[] {
  return [
    gridTemplate(spread('panorama', 'Panorama plein cadre'), P, true),
    gridTemplate(spread('panorama-marges', 'Panorama avec marges'), P),
    gridTemplate(
      spread('panorama-legende', 'Panorama et légende'),
      col([14, 1], [P, T('caption')]),
    ),
    gridTemplate(spread('panorama-titre', 'Panorama et titre'), col([1, 7], [T('title'), P])),
    gridTemplate(spread('deux', 'Une photo par page'), rowOf(2)),
    gridTemplate(spread('deux-plein', 'Une photo par page, plein cadre'), rowOf(2), true),
    gridTemplate(
      spread('grande-droite', 'Une grande, deux petites à droite'),
      row([2, 1], [P, colOf(2)]),
    ),
    gridTemplate(
      spread('grande-gauche', 'Deux petites à gauche, une grande'),
      row([1, 2], [colOf(2), P]),
    ),
    gridTemplate(spread('trois', 'Trois colonnes'), rowOf(3)),
    gridTemplate(spread('quatre', 'Quatre cases'), grid([2, 2])),
    gridTemplate(spread('six', 'Six cases'), grid([3, 3])),
    gridTemplate(spread('huit', 'Huit cases'), grid([4, 4])),
    gridTemplate(spread('douze', 'Douze cases'), grid([4, 4, 4])),
    gridTemplate(spread('seize', 'Seize cases'), grid([4, 4, 4, 4])),
    gridTemplate(spread('mosaique', 'Mosaïque de huit'), mosaic(8, 201)),
    gridTemplate(
      spread('photo-texte', 'Photo et texte'),
      row([1, 1], [P, col([1, 5], [T('title'), T('body')])]),
    ),
    gridTemplate(
      spread('une-quatre', 'Une grande et quatre petites'),
      row([1, 1], [P, grid([2, 2])]),
    ),
    freeTemplate(
      spread('eparpille', 'Six photos éparpillées'),
      [
        photoSlot(0.04, 0.08, 0.2, 0.34, { rotation: -4 }),
        photoSlot(0.28, 0.46, 0.2, 0.34, { rotation: 3 }),
        photoSlot(0.4, 0.08, 0.2, 0.34, { rotation: 2 }),
        photoSlot(0.52, 0.46, 0.2, 0.34, { rotation: -3 }),
        photoSlot(0.76, 0.08, 0.2, 0.34, { rotation: 4 }),
        photoSlot(0.04, 0.5, 0.2, 0.34, { rotation: 2 }),
      ],
      [],
    ),
    freeTemplate(
      spread('bande', 'Bande de photo sur la pliure'),
      [textSlot('title', 0.08, 0.1, 0.84, 0.1), photoSlot(0.04, 0.3, 0.92, 0.42)],
      [hline(0.08, 0.24, 0.84, INK, 0.4)],
    ),
  ];
}
