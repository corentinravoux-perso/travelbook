import { afterEach, describe, expect, it, vi } from 'vitest';
import { fontFaceCss, whenFontsReady } from './fonts';

describe('fontFaceCss', () => {
  it('writes one parseable @font-face per file', () => {
    const css = fontFaceCss([
      { family: 'Inter', weight: 400, style: 'normal', url: 'a/inter.woff2' },
      { family: 'My "Odd" Font', weight: 700, style: 'italic', url: 'b/x"y.woff2' },
    ]);
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    expect(sheet.cssRules).toHaveLength(2);
    const [a, b] = [...sheet.cssRules] as CSSFontFaceRule[];
    expect(a?.style.getPropertyValue('font-family')).toBe('Inter');
    expect(a?.style.getPropertyValue('font-weight')).toBe('400');
    expect(a?.style.getPropertyValue('src')).toContain('a/inter.woff2');
    expect(b?.style.getPropertyValue('font-style')).toBe('italic');
    expect(b?.style.getPropertyValue('font-family')).toContain('Odd');
  });

  it('gives an empty sheet for no fonts', () => {
    expect(fontFaceCss([])).toBe('');
  });
});

describe('whenFontsReady', () => {
  const stub = (load: (q: string) => Promise<unknown>) =>
    vi.stubGlobal('document', { fonts: { load } });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('resolves once every family has settled, a failed load included', async () => {
    const asked: string[] = [];
    stub((q) => {
      asked.push(q);
      return q.includes('Bad') ? Promise.reject(new Error('404')) : Promise.resolve([]);
    });
    await expect(whenFontsReady(['Good', 'Bad'])).resolves.toBeUndefined();
    expect(asked.some((q) => q.includes('"Good"'))).toBe(true);
    expect(asked.some((q) => q.includes('"Bad"'))).toBe(true);
  });

  it('rejects with the families named when a load never settles', async () => {
    vi.useFakeTimers();
    stub(() => new Promise(() => undefined));
    const result = whenFontsReady(['Slow', 'Slower'], 5000);
    const check = expect(result).rejects.toThrow(/Slow, Slower/);
    await vi.advanceTimersByTimeAsync(5000);
    await check;
  });
});
