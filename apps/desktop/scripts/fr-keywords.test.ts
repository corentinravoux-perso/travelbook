import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KEYWORDS_FILE } from './build-sticker-packs';

describe('fr-keywords.json', () => {
  const map = JSON.parse(readFileSync(KEYWORDS_FILE, 'utf8')) as Record<string, unknown>;

  it('holds at least 500 French words, each with English icon words', () => {
    const entries = Object.entries(map);
    expect(entries.length).toBeGreaterThanOrEqual(500);
    for (const [french, english] of entries) {
      expect(french.trim()).toBe(french);
      expect(french).not.toBe('');
      expect(typeof english === 'string' && english.trim() !== '').toBe(true);
    }
  });

  it('has the examples of the brief', () => {
    expect(map['valise']).toMatch(/suitcase/);
    expect(map['avion']).toMatch(/airplane/);
  });
});
