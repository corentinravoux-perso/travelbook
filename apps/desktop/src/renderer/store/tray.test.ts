import { describe, expect, it } from 'vitest';
import { createTrayStore } from './tray';

describe('tray store', () => {
  it('starts sorted by date, showing everything, with nothing ticked', () => {
    const s = createTrayStore().getState();
    expect([s.sort, s.filter, s.selected, s.progress, s.failures]).toEqual([
      'date',
      'all',
      [],
      null,
      [],
    ]);
  });

  it('a click selects one photo, a second click on it clears, another replaces', () => {
    const store = createTrayStore();
    store.getState().pick('a', false);
    expect(store.getState().selected).toEqual(['a']);
    store.getState().pick('b', false);
    expect(store.getState().selected).toEqual(['b']);
    store.getState().pick('b', false);
    expect(store.getState().selected).toEqual([]);
  });

  it('an additive click toggles a photo in the selection', () => {
    const store = createTrayStore();
    store.getState().pick('a', true);
    store.getState().pick('b', true);
    expect(store.getState().selected).toEqual(['a', 'b']);
    store.getState().pick('a', true);
    expect(store.getState().selected).toEqual(['b']);
  });

  it('the checkbox of a day ticks and unticks all its photos and keeps the others', () => {
    const store = createTrayStore();
    store.getState().pick('x', false);
    store.getState().setMany(['a', 'b', 'x'], true);
    expect(store.getState().selected).toEqual(['x', 'a', 'b']);
    store.getState().setMany(['a', 'b'], false);
    expect(store.getState().selected).toEqual(['x']);
  });
});
