import { expect, it } from 'vitest';
import { pickTheme } from './theme';

it('the stored choice wins; without one the system setting decides', () => {
  expect(pickTheme('light', true)).toBe('light');
  expect(pickTheme('dark', false)).toBe('dark');
  expect(pickTheme(null, true)).toBe('dark');
  expect(pickTheme(null, false)).toBe('light');
  expect(pickTheme('sepia', true)).toBe('dark');
});
