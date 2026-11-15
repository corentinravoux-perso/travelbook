/** Text-only pages. */
import type { Template } from '@travelbook/core';
import {
  T,
  col,
  deco,
  freeTemplate,
  gridTemplate,
  hline,
  row,
  textSlot,
  type Meta,
} from './dsl.ts';

const INK = '#1f1f1f';
const text = (id: string, name: string): Meta => ({ id: `t-${id}`, name, category: 'texte' });

export function textPages(): Template[] {
  return [
    gridTemplate(text('titre-texte', 'Titre et texte'), col([1, 7], [T('title'), T('body')])),
    gridTemplate(text('texte', 'Texte seul'), T('body')),
    gridTemplate(
      text('deux-colonnes', 'Texte en deux colonnes'),
      col([1, 8], [T('title'), row([1, 1], [T('body'), T('body')])]),
    ),
    gridTemplate(
      text('trois-colonnes', 'Texte en trois colonnes'),
      col([1, 8], [T('title'), row([1, 1, 1], [T('body'), T('body'), T('body')])]),
    ),
    gridTemplate(
      text('texte-legende', 'Texte et légende'),
      col([14, 1], [T('body'), T('caption')]),
    ),
    gridTemplate(
      text('titre-texte-legende', 'Titre, texte et légende'),
      col([1, 10, 1], [T('title'), T('body'), T('caption')]),
    ),
    freeTemplate(
      text('titre-seul', 'Titre seul'),
      [textSlot('title', 0.1, 0.42, 0.8, 0.14)],
      [hline(0.4, 0.38, 0.2, INK, 0.6)],
    ),
    freeTemplate(
      text('citation', 'Citation centrée'),
      [textSlot('body', 0.18, 0.34, 0.64, 0.24), textSlot('caption', 0.18, 0.62, 0.64, 0.05)],
      [hline(0.46, 0.3, 0.08, INK, 0.6)],
    ),
    freeTemplate(
      text('lettre', 'Lettre'),
      [textSlot('title', 0.2, 0.1, 0.6, 0.07), textSlot('body', 0.2, 0.2, 0.6, 0.66)],
      [deco('rect', 0.14, 0.06, 0.72, 0.84, { stroke: { width: 0.3, color: '#cfcfcf' } })],
    ),
  ];
}
