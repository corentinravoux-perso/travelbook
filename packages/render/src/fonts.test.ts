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
  const stub = (
    load: (q: string) => Promise<unknown>,
    check: (q: string) => boolean = () => true,
  ) => vi.stubGlobal('document', { fonts: { load, check } });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('resolves once every family has loaded', async () => {
    const asked: string[] = [];
    stub((q) => {
      asked.push(q);
      return Promise.resolve([]);
    });
    await expect(whenFontsReady(['Good', 'Fine'])).resolves.toBeUndefined();
    expect(asked.some((q) => q.includes('"Good"'))).toBe(true);
    expect(asked.some((q) => q.includes('"Fine"'))).toBe(true);
  });

  it('rejects naming the families whose load failed, and only those', async () => {
    stub((q) => (q.includes('Bad') ? Promise.reject(new Error('404')) : Promise.resolve([])));
    const result = whenFontsReady(['Good', 'Bad']);
    await expect(result).rejects.toThrow(/: Bad$/);
  });

  it('rejects a family that settled but is not loaded', async () => {
    stub(
      () => Promise.resolve([]),
      (q) => !q.includes('Ghost'),
    );
    await expect(whenFontsReady(['Ghost'])).rejects.toThrow(/Ghost/);
  });

  it('rejects with the families named when a load never settles', async () => {
    vi.useFakeTimers();
    stub((q) => (q.includes('Slow') ? new Promise(() => undefined) : Promise.resolve([])));
    const check = expect(whenFontsReady(['Slow', 'Quick'], 5000)).rejects.toThrow(/: Slow$/);
    await vi.advanceTimersByTimeAsync(5000);
    await check;
  });
});
