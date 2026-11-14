import type { TextElement } from '@travelbook/core';
import { newElement } from '@travelbook/core';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextView } from './TextView';

function textEl(patch: Partial<TextElement> = {}): TextElement {
  return {
    ...(newElement('text', { x: 5, y: 6, w: 70, h: 20 }) as TextElement),
    doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] },
    ...patch,
  };
}

describe('TextView', () => {
  it('draws the sanitised document inside the text.css classes', () => {
    const { container } = render(<TextView el={textEl()} />);
    const box = container.querySelector('.tb-text') as HTMLElement;
    expect(box.getAttribute('data-element-type')).toBe('text');
    expect(box.querySelector('.tb-text__content')?.innerHTML).toBe('<p>Hi</p>');
    expect(box.style.left).toBe('5mm');
  });

  it('carries style, alignment, padding, fill, outline and shadow in the box style', () => {
    const el = textEl({
      style: {
        fontFamily: "'Lora', serif",
        fontSizePt: 14,
        color: '#112233',
        lineHeight: 1.5,
        letterSpacing: 0.02,
      },
      align: 'justify',
      vAlign: 'bottom',
      box: { fill: '#ffeecc', padding: 3 },
      outline: { width: 0.5, color: '#000000' },
      shadow: { dx: 1, dy: 2, blur: 3, color: 'rgba(0,0,0,0.5)' },
    });
    const { container } = render(<TextView el={el} />);
    const box = container.querySelector('.tb-text') as HTMLElement;
    const prop = (n: string) => box.style.getPropertyValue(n);
    expect(prop('--tb-text-size')).toBe('14pt');
    expect(prop('--tb-text-color')).toBe('#112233');
    expect(prop('--tb-text-line-height')).toBe('1.5');
    expect(prop('--tb-text-letter-spacing')).toBe('0.02em');
    expect(prop('--tb-text-align')).toBe('justify');
    expect(prop('--tb-text-valign')).toBe('flex-end');
    expect(prop('--tb-text-padding')).toBe('3mm');
    expect(box.style.background).toContain('rgb(255, 238, 204)');
    expect(box.style.outline).toContain('0.5mm solid');
    expect(box.style.filter).toContain('1mm 2mm 3mm');
  });

  it('draws nothing from a document with a hostile node', () => {
    const el = textEl({ doc: { type: 'doc', content: [{ type: 'script', content: [] }] } });
    const { container } = render(<TextView el={el} />);
    expect(container.querySelector('.tb-text__content')?.innerHTML).toBe('');
  });
});
