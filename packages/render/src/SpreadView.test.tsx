import { render } from '@testing-library/react';
import { exportBox, pageBox, type Element } from '@travelbook/core';
import { describe, expect, it, vi } from 'vitest';
import { SpreadView } from './SpreadView';
import { asset, bookWith, photo, shape, sticker, urlOf } from './test-helpers';
import type { SpreadViewProps } from './types';

const props = (over: Partial<SpreadViewProps> & Pick<SpreadViewProps, 'book' | 'spread'>) => ({
  quality: 'preview' as const,
  assetUrl: urlOf,
  ...over,
});

const ids = (root: HTMLElement): (string | null)[] =>
  [...root.querySelectorAll('[data-element-id]')].map((n) => n.getAttribute('data-element-id'));

/** `left top width height` of a positioned node, in mm, as numbers. */
function box(node: globalThis.Element | null): [number, number, number, number] {
  const style = (node as HTMLElement).style;
  const mm = (v: string): number => Number.parseFloat(v);
  return [mm(style.left), mm(style.top), mm(style.width), mm(style.height)];
}

describe('SpreadView root', () => {
  it('is a box as large as the spread, in mm, that clips its content', () => {
    const { book, spread } = bookWith();
    const { container } = render(<SpreadView {...props({ book, spread })} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.width).toBe('420mm');
    expect(root.style.height).toBe('297mm');
    expect(root.style.overflow).toBe('hidden');
    expect(root.style.position).toBe('relative');
    expect(root.getAttribute('data-quality')).toBe('preview');
    expect(root.getAttribute('data-spread-id')).toBe(spread.id);
  });

  it('is as wide as the cover, spine included', () => {
    const { book } = bookWith([], [], (b) => {
      b.spineWidth = 12;
    });
    const { container } = render(<SpreadView {...props({ book, spread: book.cover })} />);
    expect((container.firstElementChild as HTMLElement).style.width).toBe('432mm');
  });

  it('is 216 x 303 mm for the right page with its bleed', () => {
    const { book, spread } = bookWith();
    const clip = exportBox(book, spread, 'right', true);
    const { container } = render(<SpreadView {...props({ book, spread, clip })} />);
    const root = container.firstElementChild as HTMLElement;
    expect([root.style.width, root.style.height]).toEqual(['216mm', '303mm']);
  });

  it('shows the clip through the root: the content is moved by minus the clip origin', () => {
    const { book, spread } = bookWith([shape({ x: 220, y: 10, w: 30, h: 20 })]);
    const clip = exportBox(book, spread, 'right', true);
    const { container } = render(<SpreadView {...props({ book, spread, clip })} />);
    const layer = container.querySelector('[data-role="spread-layer"]') as HTMLElement;
    expect(box(layer).slice(0, 2)).toEqual([-207, 3]);
    // The element keeps its spread coordinates.
    expect(box(container.querySelector('[data-element-id]'))).toEqual([220, 10, 30, 20]);
  });
});

describe('SpreadView elements', () => {
  it('draws the elements in the order of spread.elements, and none that is hidden', () => {
    const els: Element[] = [
      shape({ x: 0, y: 0, w: 10, h: 10 }, { id: 'a' }),
      photo({ x: 0, y: 0, w: 10, h: 10 }, { id: 'b', assetId: 'p1' }),
      sticker({ x: 0, y: 0, w: 10, h: 10 }, { id: 'c', hidden: true }),
      shape({ x: 0, y: 0, w: 10, h: 10 }, { id: 'd' }),
      sticker({ x: 0, y: 0, w: 10, h: 10 }, { id: 'e' }),
    ];
    const { book, spread } = bookWith(els, [asset('p1', 'photo', { w: 600, h: 400 })]);
    const { container } = render(<SpreadView {...props({ book, spread })} />);
    expect(ids(container)).toEqual(['a', 'b', 'd', 'e']);
  });

  it('positions each element in mm with a rotation and its opacity', () => {
    const el = shape({ x: 12.5, y: 20, w: 40, h: 30 }, { id: 'r', rotation: 30, opacity: 0.5 });
    const { book, spread } = bookWith([el]);
    const { container } = render(<SpreadView {...props({ book, spread })} />);
    const node = container.querySelector('[data-element-id="r"]') as HTMLElement;
    expect(node.style.position).toBe('absolute');
    expect(box(node)).toEqual([12.5, 20, 40, 30]);
    expect(node.style.transform).toBe('rotate(30deg)');
    expect(node.style.opacity).toBe('0.5');
  });

  it('draws a text element as a placeholder box only', () => {
    const el = { ...shape({ x: 5, y: 6, w: 70, h: 20 }), id: 't' } as Element;
    const text: Element = {
      ...el,
      type: 'text',
      doc: { type: 'doc', content: [{ type: 'paragraph' }] },
      style: {
        fontFamily: 'Inter',
        fontSizePt: 12,
        color: '#000',
        lineHeight: 1.3,
        letterSpacing: 0,
      },
      align: 'left',
      vAlign: 'top',
      box: { fill: null, padding: 0 },
      outline: null,
      shadow: null,
    } as Element;
    const { book, spread } = bookWith([text]);
    const { container } = render(<SpreadView {...props({ book, spread })} />);
    const node = container.querySelector('[data-element-id="t"]') as HTMLElement;
    expect(node.getAttribute('data-element-type')).toBe('text');
    expect(box(node)).toEqual([5, 6, 70, 20]);
    expect(node.textContent).toBe('');
  });

  describe('empty photo slot', () => {
    const slot = photo({ x: 10, y: 10, w: 60, h: 40 }, { id: 'slot' });

    it('draws nothing by default', () => {
      const { book, spread } = bookWith([slot]);
      const { container } = render(<SpreadView {...props({ book, spread })} />);
      expect(ids(container)).toEqual([]);
    });

    it('draws a placeholder when showEmptySlots is set', () => {
      const { book, spread } = bookWith([slot]);
      const { container } = render(
        <SpreadView {...props({ book, spread, showEmptySlots: true })} />,
      );
      expect(ids(container)).toEqual(['slot']);
      expect(container.querySelector('[data-role="empty-slot"]')).not.toBeNull();
      expect(container.querySelector('img')).toBeNull();
    });

    it('does not draw a placeholder for a photo that has an asset', () => {
      const filled = photo({ x: 10, y: 10, w: 60, h: 40 }, { id: 'f', assetId: 'p1' });
      const { book, spread } = bookWith([filled], [asset('p1', 'photo', { w: 600, h: 400 })]);
      const { container } = render(
        <SpreadView {...props({ book, spread, showEmptySlots: true })} />,
      );
      expect(container.querySelector('[data-role="empty-slot"]')).toBeNull();
      expect(container.querySelectorAll('img')).toHaveLength(1);
    });
  });

  describe('renderElement', () => {
    it('wraps the node of every drawn element, in order, and uses what it returns', () => {
      const els: Element[] = [
        shape({ x: 0, y: 0, w: 10, h: 10 }, { id: 'a' }),
        shape({ x: 0, y: 0, w: 10, h: 10 }, { id: 'h', hidden: true }),
        photo({ x: 0, y: 0, w: 10, h: 10 }, { id: 'empty' }),
        shape({ x: 0, y: 0, w: 10, h: 10 }, { id: 'b' }),
      ];
      const { book, spread } = bookWith(els);
      const renderElement = vi.fn((el: Element, node: React.ReactNode) => (
        <div data-overlay={el.id}>{node}</div>
      ));
      const { container } = render(
        <SpreadView {...props({ book, spread, renderElement, showEmptySlots: true })} />,
      );
      expect(renderElement.mock.calls.map(([el]) => el.id)).toEqual(['a', 'empty', 'b']);
      const overlays = [...container.querySelectorAll('[data-overlay]')];
      expect(overlays.map((o) => o.getAttribute('data-overlay'))).toEqual(['a', 'empty', 'b']);
      // The element is inside its wrapper.
      expect(overlays[0]?.querySelector('[data-element-id="a"]')).not.toBeNull();
    });

    it('is not called for an empty slot when empty slots are not shown', () => {
      const { book, spread } = bookWith([photo({ x: 0, y: 0, w: 10, h: 10 }, { id: 'empty' })]);
      const renderElement = vi.fn((_el: Element, node: React.ReactNode) => node);
      render(<SpreadView {...props({ book, spread, renderElement })} />);
      expect(renderElement).not.toHaveBeenCalled();
    });
  });
});

describe('SpreadView backgrounds', () => {
  const red = { kind: 'color', color: '#ff0000' } as const;
  const blue = { kind: 'color', color: '#0000ff' } as const;

  const layers = (root: HTMLElement) =>
    [...root.querySelectorAll('[data-background]')].map((n) => ({
      layer: n.getAttribute('data-background'),
      kind: n.getAttribute('data-background-kind'),
      box: box(n),
    }));

  it('draws a spread background across both pages, bleed included', () => {
    const { book, spread } = bookWith([], [], (_b, s) => {
      s.background = { spread: red };
    });
    const { container } = render(<SpreadView {...props({ book, spread })} />);
    expect(layers(container)).toEqual([
      { layer: 'spread', kind: 'color', box: [-3, -3, 426, 303] },
    ]);
  });

  it('keeps a page background on its page, and on the outer side lets it run into the bleed', () => {
    const { book, spread } = bookWith([], [], (_b, s) => {
      s.background = { left: red, right: blue };
    });
    const { container } = render(<SpreadView {...props({ book, spread })} />);
    expect(layers(container)).toEqual([
      // left page 0..210; outer edge, top and bottom run 3 mm into the bleed, the spine side stops.
      { layer: 'left', kind: 'color', box: [-3, -3, 213, 303] },
      { layer: 'right', kind: 'color', box: [210, -3, 213, 303] },
    ]);
    const left = pageBox(book, spread, 'left');
    const right = pageBox(book, spread, 'right');
    expect(left).toEqual({ x: 0, y: 0, w: 210, h: 297 });
    expect(right).toEqual({ x: 210, y: 0, w: 210, h: 297 });
  });

  it('puts the spread background under the page backgrounds, and both under the elements', () => {
    const { book, spread } = bookWith(
      [shape({ x: 0, y: 0, w: 10, h: 10 }, { id: 'a' })],
      [],
      (_b, s) => {
        s.background = { spread: red, left: blue, right: blue };
      },
    );
    const { container } = render(<SpreadView {...props({ book, spread })} />);
    const order = [...container.querySelectorAll('[data-background], [data-element-id]')].map(
      (n) => n.getAttribute('data-background') ?? n.getAttribute('data-element-id'),
    );
    expect(order).toEqual(['spread', 'left', 'right', 'a']);
  });

  it('uses the cover bleed on a cover, and places the front page after the spine', () => {
    const { book } = bookWith([], [], (b) => {
      b.spineWidth = 10;
      b.coverBleed = 5;
      b.cover.background = { left: red, right: blue, spread: red };
    });
    const { container } = render(<SpreadView {...props({ book, spread: book.cover })} />);
    expect(layers(container)).toEqual([
      { layer: 'spread', kind: 'color', box: [-5, -5, 440, 307] },
      { layer: 'left', kind: 'color', box: [-5, -5, 215, 307] },
      { layer: 'right', kind: 'color', box: [220, -5, 215, 307] },
    ]);
  });

  it('draws no background for a page that does not exist', () => {
    const { book } = bookWith();
    const first = book.spreads[0];
    if (!first) throw new Error('no first spread');
    first.background = { left: red, right: blue };
    const { container } = render(<SpreadView {...props({ book, spread: first })} />);
    expect(layers(container).map((l) => l.layer)).toEqual(['right']);
  });

  it('draws nothing for a spread with no background', () => {
    const { book, spread } = bookWith();
    const { container } = render(<SpreadView {...props({ book, spread })} />);
    expect(layers(container)).toEqual([]);
  });
});
