import { describe, expect, it } from 'vitest';
import { clampWidth, PANEL_BOUNDS, readWidths, WIDTHS_KEY, writeWidths } from './layout';

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe('panel widths', () => {
  it('clamps to the bounds and rounds', () => {
    expect(clampWidth('panel', 10)).toBe(PANEL_BOUNDS.panel.min);
    expect(clampWidth('panel', 9999)).toBe(PANEL_BOUNDS.panel.max);
    expect(clampWidth('inspector', 300.6)).toBe(301);
    expect(clampWidth('inspector', Number.NaN)).toBe(PANEL_BOUNDS.inspector.initial);
    expect(clampWidth('inspector', '300')).toBe(PANEL_BOUNDS.inspector.initial);
  });

  it('starts from the initial widths when nothing is stored', () => {
    expect(readWidths(memoryStorage())).toEqual({ panel: 272, inspector: 264 });
  });

  it('reads back what it wrote', () => {
    const storage = memoryStorage();
    writeWidths(storage, { panel: 320, inspector: 240 });
    expect(readWidths(storage)).toEqual({ panel: 320, inspector: 240 });
  });

  it('ignores broken or out-of-range stored values', () => {
    expect(readWidths(memoryStorage({ [WIDTHS_KEY]: '{oops' }))).toEqual({
      panel: 272,
      inspector: 264,
    });
    expect(readWidths(memoryStorage({ [WIDTHS_KEY]: '{"panel":5000,"inspector":null}' }))).toEqual({
      panel: 440,
      inspector: 264,
    });
    expect(readWidths(memoryStorage({ [WIDTHS_KEY]: '7' }))).toEqual({
      panel: 272,
      inspector: 264,
    });
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readWidths(broken)).toEqual({ panel: 272, inspector: 264 });
    expect(() => writeWidths(broken, { panel: 300, inspector: 300 })).not.toThrow();
  });
});
