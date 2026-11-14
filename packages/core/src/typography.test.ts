import { describe, expect, it } from 'vitest';
import { frenchSpacing } from './typography';

const NNBSP = '\u202F';
const NBSP = '\u00A0';

describe('frenchSpacing', () => {
  it('puts a narrow no-break space before ; ! ? and », a no-break space before : and after «', () => {
    expect(frenchSpacing('Quoi ? Oui : « non » !')).toBe(
      `Quoi${NNBSP}? Oui${NBSP}: «${NBSP}non${NNBSP}»${NNBSP}!`,
    );
    expect(frenchSpacing('a ; b')).toBe(`a${NNBSP}; b`);
  });

  it('adds the space where there is none', () => {
    expect(frenchSpacing('Quoi?Oui:non!«x»;')).toBe(
      `Quoi${NNBSP}?Oui${NBSP}:non${NNBSP}!«${NBSP}x${NNBSP}»${NNBSP};`,
    );
  });

  it('replaces whatever plain or no-break spaces are already there', () => {
    expect(frenchSpacing(`a${NBSP}? b${NNBSP}: c`)).toBe(`a${NNBSP}? b${NBSP}: c`);
    expect(frenchSpacing(`« ${NNBSP}x${NBSP}»`)).toBe(`«${NBSP}x${NNBSP}»`);
    expect(frenchSpacing('a   ?')).toBe(`a${NNBSP}?`);
  });

  it('leaves the space after the closing punctuation and before « alone', () => {
    expect(frenchSpacing('dit « oui » puis « non »')).toBe(
      `dit «${NBSP}oui${NNBSP}» puis «${NBSP}non${NNBSP}»`,
    );
  });

  it('adds nothing at the start of the text, after a line break, or inside a run of marks', () => {
    expect(frenchSpacing('?')).toBe('?');
    expect(frenchSpacing('Quoi\n?')).toBe('Quoi\n?');
    expect(frenchSpacing('Quoi?!')).toBe(`Quoi${NNBSP}?!`);
    expect(frenchSpacing('Quoi ?!')).toBe(`Quoi${NNBSP}?!`);
    expect(frenchSpacing('«')).toBe('«');
    expect(frenchSpacing('« \nx')).toBe(`«${NBSP}\nx`);
    expect(frenchSpacing('«\nx')).toBe('«\nx');
  });

  it('keeps times and ratios between digits', () => {
    expect(frenchSpacing('Départ à 7:45 !')).toBe(`Départ à 7:45${NNBSP}!`);
    expect(frenchSpacing('Voir : 1:2')).toBe(`Voir${NBSP}: 1:2`);
  });

  it('leaves web addresses untouched', () => {
    expect(frenchSpacing('Voir https://exemple.fr/a?b=1&c:d ! Et ?')).toBe(
      `Voir https://exemple.fr/a?b=1&c:d${NNBSP}! Et${NNBSP}?`,
    );
    expect(frenchSpacing('www.exemple.fr?x=1')).toBe('www.exemple.fr?x=1');
  });

  it('is idempotent', () => {
    for (const text of ['Quoi ? Oui : « non » !', 'a?b:c!d;e«f»g', 'x \u00A0 ? « » : ;']) {
      const once = frenchSpacing(text);
      expect(frenchSpacing(once)).toBe(once);
    }
  });

  it('is idempotent on every short string over the relevant alphabet', () => {
    const alphabet = ['a', '1', ' ', NBSP, NNBSP, '\n', '?', '!', ';', ':', '«', '»'];
    const visit = (prefix: string, depth: number): void => {
      const once = frenchSpacing(prefix);
      expect(frenchSpacing(once), JSON.stringify(prefix)).toBe(once);
      if (depth === 0) return;
      for (const c of alphabet) visit(prefix + c, depth - 1);
    };
    visit('', 5);
  });

  it('returns text without punctuation unchanged', () => {
    expect(frenchSpacing('')).toBe('');
    expect(frenchSpacing('Un été à la plage.')).toBe('Un été à la plage.');
  });
});
