import type { PosterSpec } from './types';

/** A complete, valid poster spec for tests. */
export const validSpec: PosterSpec = {
  layout: 'classique',
  title: 'JAPON',
  subtitle: '',
  year: '',
  font: 'Anton',
  colors: {
    background: '#f1ece4',
    title: '#b5452f',
    accent: '#2b3a4a',
    decor: '#e8c9a9',
    illustration: { main: '#b5452f', shade: '#7d2f20' },
  },
  illustration: { set: 'affiches', id: 'japon-torii' },
  spine: true,
};
