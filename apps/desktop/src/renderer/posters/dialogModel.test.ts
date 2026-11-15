import { shadeOf } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import {
  canApply,
  contrastWarning,
  initialPosterState,
  posterReducer,
  type PosterDialogState,
} from './dialogModel';
import { POSTER_PRESETS } from './presets';

const preset = POSTER_PRESETS.find((p) => p.id === 'japon-torii')!;
const start = (): PosterDialogState => initialPosterState('Été au Japon');

describe('initialPosterState', () => {
  it('starts from the book title in capitals, the house face, no preset, tie off', () => {
    const s = start();
    expect(s.presetId).toBeNull();
    expect(s.spec.title).toBe('ÉTÉ AU JAPON');
    expect(s.spec.layout).toBe('classique');
    expect(s.spec.font).toBe('Lilita One');
    expect(s.spec.spine).toBe(true);
    expect(s.tieIllustrationToTitle).toBe(false);
    expect(s.destination).toBe('all');
    expect(s.spec.illustration).toEqual(POSTER_PRESETS[0]!.spec.illustration);
  });
  it('falls back to MON VOYAGE for an empty title', () => {
    expect(initialPosterState('  ').spec.title).toBe('MON VOYAGE');
  });
});

describe('posterReducer', () => {
  it('copies a picked preset and remembers it', () => {
    const s = posterReducer(start(), { type: 'pickPreset', id: preset.id });
    expect(s.presetId).toBe(preset.id);
    expect(s.spec).toEqual(preset.spec);
  });

  it('keeps a typed year and subtitle when a preset is picked', () => {
    let s = posterReducer(start(), { type: 'setField', field: 'year', value: '2026' });
    s = posterReducer(s, { type: 'setField', field: 'subtitle', value: 'Kyoto' });
    s = posterReducer(s, { type: 'pickPreset', id: preset.id });
    expect(s.spec.year).toBe('2026');
    expect(s.spec.subtitle).toBe('Kyoto');
    expect(s.spec.layout).toBe(preset.spec.layout);
  });

  it('keeps any edit made after picking a preset', () => {
    let s = posterReducer(start(), { type: 'pickPreset', id: preset.id });
    s = posterReducer(s, { type: 'setField', field: 'title', value: 'Kyoto' });
    s = posterReducer(s, { type: 'setLayout', layout: 'arche' });
    s = posterReducer(s, { type: 'setFont', font: 'Anton' });
    s = posterReducer(s, { type: 'setColor', role: 'background', color: '#ffffff' });
    s = posterReducer(s, { type: 'setColor', role: 'decor', color: '#eeeeee' });
    s = posterReducer(s, { type: 'setSpine', on: false });
    expect(s.spec).toMatchObject({ title: 'Kyoto', layout: 'arche', font: 'Anton', spine: false });
    expect(s.spec.colors.background).toBe('#ffffff');
    expect(s.spec.colors.decor).toBe('#eeeeee');
    expect(s.presetId).toBe(preset.id);
  });

  it('ties the illustration to the title colour only when asked', () => {
    let s = posterReducer(start(), { type: 'setColor', role: 'title', color: '#336699' });
    expect(s.spec.colors.illustration.main).not.toBe('#336699');
    s = posterReducer(s, { type: 'setTie', on: true });
    expect(s.spec.colors.illustration).toEqual({ main: '#336699', shade: shadeOf('#336699') });
    s = posterReducer(s, { type: 'setColor', role: 'title', color: '#993366' });
    expect(s.spec.colors.illustration).toEqual({ main: '#993366', shade: shadeOf('#993366') });
  });

  it('sets the illustration colours freely', () => {
    let s = posterReducer(start(), {
      type: 'setColor',
      role: 'illustrationMain',
      color: '#111111',
    });
    s = posterReducer(s, { type: 'setColor', role: 'illustrationShade', color: '#222222' });
    expect(s.spec.colors.illustration).toEqual({ main: '#111111', shade: '#222222' });
  });

  it('changes the illustration, with its own colours when given', () => {
    const s = posterReducer(start(), {
      type: 'setIllustration',
      illustration: { itemId: 'sticker-x' },
      colors: { main: '#abcdef', shade: '#123456' },
    });
    expect(s.spec.illustration).toEqual({ itemId: 'sticker-x' });
    expect(s.spec.colors.illustration).toEqual({ main: '#abcdef', shade: '#123456' });
  });

  it('filters the gallery by destination', () => {
    expect(posterReducer(start(), { type: 'filter', destination: 'kenya' }).destination).toBe(
      'kenya',
    );
  });
});

describe('canApply and contrastWarning', () => {
  it('needs a title', () => {
    expect(canApply(start())).toBe(true);
    expect(
      canApply(posterReducer(start(), { type: 'setField', field: 'title', value: '  ' })),
    ).toBe(false);
  });
  it('warns when the title vanishes into the background, not on pastel presets', () => {
    let s = posterReducer(start(), { type: 'setColor', role: 'title', color: '#777777' });
    s = posterReducer(s, { type: 'setColor', role: 'background', color: '#888888' });
    expect(contrastWarning(s)).toBe(true);
    expect(contrastWarning(posterReducer(start(), { type: 'pickPreset', id: preset.id }))).toBe(
      false,
    );
  });
});
