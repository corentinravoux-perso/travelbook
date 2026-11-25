// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { commandFor, pageTurn, spreadAfter } from './shortcuts';

const key = (
  k: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {},
) =>
  commandFor({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('commandFor', () => {
  it('nudges 1 mm, 10 with Shift, 0.1 with Alt', () => {
    expect(key('ArrowLeft')).toEqual({ kind: 'nudge', dx: -1, dy: 0 });
    expect(key('ArrowDown', { shiftKey: true })).toEqual({ kind: 'nudge', dx: 0, dy: 10 });
    expect(key('ArrowRight', { altKey: true })).toEqual({ kind: 'nudge', dx: 0.1, dy: 0 });
  });

  it('maps the clipboard, group and history shortcuts', () => {
    expect(key('c', { ctrlKey: true })).toEqual({ kind: 'copy' });
    expect(key('X', { ctrlKey: true })).toEqual({ kind: 'cut' });
    expect(key('v', { metaKey: true })).toEqual({ kind: 'paste' });
    expect(key('d', { ctrlKey: true })).toEqual({ kind: 'duplicate' });
    expect(key('g', { ctrlKey: true })).toEqual({ kind: 'group' });
    expect(key('G', { ctrlKey: true, shiftKey: true })).toEqual({ kind: 'ungroup' });
    expect(key('z', { ctrlKey: true })).toEqual({ kind: 'undo' });
    expect(key('Z', { ctrlKey: true, shiftKey: true })).toEqual({ kind: 'redo' });
    expect(key('a', { ctrlKey: true })).toEqual({ kind: 'selectAll' });
  });

  it('maps deletion, escape, stacking and zoom', () => {
    expect(key('Delete')).toEqual({ kind: 'delete' });
    expect(key('Escape')).toEqual({ kind: 'escape' });
    expect(key(']')).toEqual({ kind: 'forward' });
    expect(key('[')).toEqual({ kind: 'backward' });
    expect(key('+')).toEqual({ kind: 'zoomIn' });
    expect(key('-')).toEqual({ kind: 'zoomOut' });
    expect(key('0')).toEqual({ kind: 'fit' });
  });

  it('accepts the brackets typed with AltGr (Ctrl+Alt) and 0 typed with Shift', () => {
    expect(key(']', { ctrlKey: true, altKey: true })).toEqual({ kind: 'forward' });
    expect(key('0', { shiftKey: true })).toEqual({ kind: 'fit' });
  });

  it('ignores keys it does not own', () => {
    expect(key('a')).toBeNull();
    expect(key('s', { ctrlKey: true })).toBeNull();
  });
});

describe('page turns', () => {
  const book = {
    cover: { id: 'cover' },
    spreads: [{ id: 's1' }, { id: 's2' }],
  } as unknown as NonNullable<Parameters<typeof spreadAfter>[0]['book']>;
  const press = (
    k: string,
    selection: string[] = [],
    mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {},
    target: EventTarget | null = null,
  ) =>
    pageTurn(
      { key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target, ...mods },
      { selection },
    );

  it('turns with a plain arrow when nothing is selected', () => {
    expect(press('ArrowRight')).toEqual({ kind: 'turn', step: 1 });
    expect(press('ArrowDown')).toEqual({ kind: 'turn', step: 1 });
    expect(press('ArrowLeft')).toEqual({ kind: 'turn', step: -1 });
    expect(press('ArrowUp')).toEqual({ kind: 'turn', step: -1 });
  });

  it('leaves the arrows to the nudge with a selection or a modifier', () => {
    expect(press('ArrowRight', ['e1'])).toBeNull();
    expect(press('ArrowRight', [], { shiftKey: true })).toBeNull();
    expect(press('ArrowRight', [], { altKey: true })).toBeNull();
    expect(press('ArrowRight', [], { ctrlKey: true })).toBeNull();
  });

  it('leaves the arrows to a widget that moves with them', () => {
    const list = document.createElement('div');
    list.setAttribute('role', 'tablist');
    const tab = document.createElement('button');
    list.append(tab);
    expect(press('ArrowRight', [], {}, tab)).toBeNull();
    expect(press('ArrowRight', [], {}, document.createElement('button'))).toEqual({
      kind: 'turn',
      step: 1,
    });
  });

  it('turns with Page Up and Page Down', () => {
    expect(key('PageDown')).toEqual({ kind: 'turn', step: 1 });
    expect(key('PageUp')).toEqual({ kind: 'turn', step: -1 });
    expect(key('PageUp', { ctrlKey: true })).toBeNull();
  });

  it('goes through the cover then the spreads, and stops at both ends', () => {
    expect(spreadAfter({ book, currentSpreadId: 'cover' }, 1)).toBe('s1');
    expect(spreadAfter({ book, currentSpreadId: 's1' }, -1)).toBe('cover');
    expect(spreadAfter({ book, currentSpreadId: 's2' }, 1)).toBeNull();
    expect(spreadAfter({ book, currentSpreadId: 'cover' }, -1)).toBeNull();
    expect(spreadAfter({ book: null, currentSpreadId: null }, 1)).toBeNull();
  });
});
