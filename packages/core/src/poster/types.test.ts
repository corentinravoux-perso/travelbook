import { describe, expect, it } from 'vitest';
import { validSpec } from './test-helpers';
import { PosterPresetSchema, PosterSpecSchema } from './types';

describe('PosterSpecSchema', () => {
  it('accepts a full valid spec', () => {
    expect(PosterSpecSchema.safeParse(validSpec).success).toBe(true);
  });
  it('accepts a library illustration', () => {
    expect(
      PosterSpecSchema.safeParse({ ...validSpec, illustration: { itemId: 'x' } }).success,
    ).toBe(true);
  });
  it('rejects a colour that is not #rrggbb', () => {
    const bad = { ...validSpec, colors: { ...validSpec.colors, title: 'red' } };
    expect(PosterSpecSchema.safeParse(bad).success).toBe(false);
  });
  it('requires a decor colour', () => {
    const colors: Partial<typeof validSpec.colors> = { ...validSpec.colors };
    delete colors.decor;
    expect(PosterSpecSchema.safeParse({ ...validSpec, colors }).success).toBe(false);
  });
  it('rejects an unknown layout or font', () => {
    expect(PosterSpecSchema.safeParse({ ...validSpec, layout: 'x' }).success).toBe(false);
    expect(PosterSpecSchema.safeParse({ ...validSpec, layout: 'bas' }).success).toBe(false);
    expect(PosterSpecSchema.safeParse({ ...validSpec, font: 'Inter' }).success).toBe(false);
  });
});

describe('PosterPresetSchema', () => {
  it('accepts a preset', () => {
    expect(
      PosterPresetSchema.safeParse({
        id: 'japon-torii',
        destination: 'japon',
        name: 'Japon, torii',
        spec: validSpec,
      }).success,
    ).toBe(true);
  });
});
