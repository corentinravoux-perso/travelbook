import { cleanup, render } from '@testing-library/react';
import type { AssetRef } from '@travelbook/core';
import { afterEach, describe, expect, it } from 'vitest';
import { projectFontFiles } from './projectFonts';
import { SpreadView } from './SpreadView';
import { bookWith, urlOf } from './test-helpers';

const font = (id: string, name: string): AssetRef => ({
  id,
  kind: 'font',
  file: `assets/${id}.woff2`,
  originalName: name,
  sha256: id,
});

const styles = (): HTMLStyleElement[] => [
  ...document.head.querySelectorAll<HTMLStyleElement>('style[data-project-fonts]'),
];

afterEach(() => {
  cleanup();
});

describe('projectFontFiles', () => {
  it('turns the font assets named as faces into files, sorted, and leaves the rest', () => {
    const { book } = bookWith();
    book.assets = {
      b: font('b', 'Lora|700|normal.woff2'),
      a: font('a', 'Lora|400|italic.woff2'),
      c: font('c', 'Lora|400|normal.woff2'),
      x: font('x', 'Mon fichier.woff2'),
    };
    expect(projectFontFiles(book.assets, urlOf).map((f) => [f.family, f.weight, f.style])).toEqual([
      ['Lora', 400, 'italic'],
      ['Lora', 400, 'normal'],
      ['Lora', 700, 'normal'],
    ]);
  });
});

describe('SpreadView and the album fonts', () => {
  it('declares them in <head> before it draws, once for several views, and removes them with the last', () => {
    const { book, spread } = bookWith();
    book.assets = { c: font('c', 'Lora|400|normal.woff2') };
    const props = { book, spread, quality: 'preview' as const, assetUrl: urlOf };
    const first = render(<SpreadView {...props} />);
    const second = render(<SpreadView {...props} />);
    expect(styles()).toHaveLength(1);
    const css = styles()[0]!.textContent ?? '';
    expect(css).toContain('font-family:"Lora"');
    expect(css).toContain('test://asset/c');
    first.unmount();
    expect(styles()).toHaveLength(1);
    second.unmount();
    expect(styles()).toHaveLength(0);
  });

  it('adds nothing for an album without fonts, and sits after the application styles', () => {
    const { book, spread } = bookWith();
    const early = document.createElement('style');
    document.head.append(early);
    render(<SpreadView book={book} spread={spread} quality="preview" assetUrl={urlOf} />);
    expect(styles()).toHaveLength(0);
    book.assets = { c: font('c', 'Lora|400|normal.woff2') };
    render(<SpreadView book={book} spread={spread} quality="preview" assetUrl={urlOf} />);
    expect(document.head.lastElementChild).toBe(styles()[0]);
    early.remove();
  });
});
