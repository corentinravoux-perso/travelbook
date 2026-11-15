// @vitest-environment jsdom
// Scrolling a windowed grid must not read the React event after it is dispatched: React runs a
// state updater later, when `event.currentTarget` is already null. That threw on the first scroll
// of the sticker grid and the photo tray, unmounted the app and left a white window.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PhotoGrid } from './PhotoGrid';
import { TileGrid } from './stickers/TileGrid';

afterEach(cleanup);

// jsdom has no ResizeObserver; the grids only use it to re-measure.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Two scroll events in one batch, as a wheel or a drag sends them: React computes the first
// update at once, but queues the second and runs its updater after the event is gone.
const scroll = (el: Element, top: number) =>
  act(() => {
    (el as HTMLElement).scrollTop = top;
    fireEvent.scroll(el);
    (el as HTMLElement).scrollTop = top * 2;
    fireEvent.scroll(el);
  });

describe('windowed grids', () => {
  it('the sticker grid survives a scroll', () => {
    const { container } = render(<TileGrid tiles={[]} renderTile={() => null} />);
    const grid = container.querySelector('.stk-grid')!;
    expect(() => scroll(grid, 500)).not.toThrow();
    expect(container.querySelector('.stk-grid')).not.toBeNull();
  });

  it('the photo tray survives a scroll', () => {
    const { container } = render(<PhotoGrid groups={[]} thumb={() => null} />);
    const grid = container.querySelector('.photo-grid')!;
    expect(() => scroll(grid, 500)).not.toThrow();
    expect(container.querySelector('.photo-grid')).not.toBeNull();
  });
});
