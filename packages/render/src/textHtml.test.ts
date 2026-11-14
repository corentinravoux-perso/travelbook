import { describe, expect, it } from 'vitest';
import { textHtml } from './textHtml';

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const t = (text: string, ...marks: unknown[]) => ({ type: 'text', text, marks });

describe('textHtml', () => {
  it('renders paragraphs, headings and lists', () => {
    const html = textHtml(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [t('Title')] },
        p(t('Body')),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('a'))] }] },
        { type: 'orderedList', content: [{ type: 'listItem', content: [p(t('b'))] }] },
      ),
    );
    expect(html).toBe(
      '<h2>Title</h2><p>Body</p><ul><li><p>a</p></li></ul><ol><li><p>b</p></li></ol>',
    );
  });

  it('clamps a heading level outside 1-3 to an allowed tag', () => {
    expect(textHtml(doc({ type: 'heading', attrs: { level: 9 }, content: [t('x')] }))).toBe(
      '<h1>x</h1>',
    );
  });

  it('renders marks to tags and text style to an inline style', () => {
    const html = textHtml(
      doc(
        p(
          t('a', { type: 'bold' }, { type: 'italic' }, { type: 'underline' }),
          t('b', {
            type: 'textStyle',
            attrs: { fontFamily: 'Lora, serif', fontSize: '18pt', color: '#ff0000' },
          }),
        ),
      ),
    );
    expect(html).toBe(
      '<p><strong><em><u>a</u></em></strong>' +
        '<span style="font-family:&#39;Lora&#39;, serif;font-size:18pt;color:#ff0000">b</span></p>',
    );
  });

  it('renders text align and keeps empty paragraphs and hard breaks as lines', () => {
    const html = textHtml(
      doc({ type: 'paragraph', attrs: { textAlign: 'center' } }, p(t('a'), { type: 'hardBreak' })),
    );
    expect(html).toBe('<p style="text-align:center"><br></p><p>a<br></p>');
  });

  it('escapes text', () => {
    expect(textHtml(doc(p(t('<b>&"\'</b>'))))).toBe('<p>&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;</p>');
  });

  it('drops a node outside the allow-list, with its content', () => {
    const html = textHtml(
      doc({ type: 'script', content: [t('alert(1)')] }, p(t('ok')), {
        type: 'image',
        attrs: { src: 'x' },
      }),
    );
    expect(html).toBe('<p>ok</p>');
  });

  it('drops attributes outside the allow-list', () => {
    const html = textHtml(
      doc({
        type: 'paragraph',
        attrs: { onclick: 'alert(1)', class: 'x', textAlign: 'right' },
        content: [t('a', { type: 'bold', attrs: { onmouseover: 'x' } })],
      }),
    );
    expect(html).toBe('<p style="text-align:right"><strong>a</strong></p>');
    expect(html).not.toContain('onclick');
  });

  it('drops a link mark, javascript: URL included, and keeps its text', () => {
    const html = textHtml(
      doc(p(t('click', { type: 'link', attrs: { href: 'javascript:alert(1)' } }))),
    );
    expect(html).toBe('<p>click</p>');
  });

  it('drops invalid colours, sizes and font families and escapes the rest', () => {
    const style = (attrs: Record<string, unknown>) =>
      textHtml(doc(p(t('x', { type: 'textStyle', attrs }))));
    expect(style({ color: 'red;background:url(x)' })).toBe('<p>x</p>');
    expect(style({ color: 'expression(alert(1))' })).toBe('<p>x</p>');
    expect(style({ color: 'rgba(10, 20, 30, 0.5)' })).toContain('color:rgba(10, 20, 30, 0.5)');
    expect(style({ fontSize: '12pt;x:y' })).toBe('<p>x</p>');
    expect(style({ fontSize: '9999pt' })).toBe('<p>x</p>');
    expect(style({ fontFamily: 'a"onload="x' })).toBe('<p>x</p>');
    expect(style({ fontFamily: "Evil'; } body { x: y, Good Font" })).toContain(
      '&#39;Good Font&#39;',
    );
    expect(style({ fontFamily: "Evil'; } body { x: y, Good Font" })).not.toContain('}');
  });

  it('gives an empty string for anything that is not a doc', () => {
    for (const bad of [null, undefined, 'x', 3, [], { type: 'paragraph' }]) {
      expect(textHtml(bad)).toBe('');
    }
  });
});
