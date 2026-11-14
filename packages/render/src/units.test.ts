import { describe, expect, it } from 'vitest';
import { cssUrl } from './units';

describe('cssUrl', () => {
  it('escapes quotes, backslashes, parentheses and newlines, so the URL cannot end its string', () => {
    const hostile = 'a"); background:red; /*\\\n\rb(c)';
    const css = cssUrl(hostile);
    expect(css).toBe('url("a\\"\\); background:red; /*\\\\\\a \\a b\\(c\\)")');
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`.x{background:${css}}`);
    const rule = sheet.cssRules[0] as CSSStyleRule;
    expect(rule.style.getPropertyValue('background')).toContain('url(');
    expect(rule.style.getPropertyValue('background-color')).not.toBe('red');
    expect(sheet.cssRules).toHaveLength(1);
  });
});
