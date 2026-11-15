import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { ICONS_FILE, iconsModule } from './generate-icons';

it('src/renderer/theme/icons.ts is up to date (run `npm run icons` if not)', async () => {
  expect(await readFile(ICONS_FILE, 'utf8')).toBe(await iconsModule());
});
