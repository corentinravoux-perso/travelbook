import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from './launch';

let work: string;
test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-shell-'));
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

const theme = (page: Page) => page.locator('html').getAttribute('data-theme');

test('the shell shows its six regions under their French names', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('banner', { name: 'Barre du haut' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Outils' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Panneau Photos' })).toBeVisible();
    await expect(page.getByRole('main', { name: 'Plan de travail' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Inspecteur' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Doubles pages' })).toBeVisible();

    // The rail switches the panel; the active entry is pressed.
    const rail = page.getByRole('navigation', { name: 'Outils' });
    await rail.getByRole('button', { name: 'Modèles' }).click();
    await expect(rail.getByRole('button', { name: 'Modèles' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('region', { name: 'Panneau Modèles' })).toBeVisible();

    // The UI face is the bundled IBM Plex Sans, not a system fallback.
    // (`fonts.load` resolves to the faces it loaded: none if no bundled face matched.)
    const faces = await page.evaluate(async () =>
      Promise.all(
        ['400', '500', '600'].map(
          async (w) => (await document.fonts.load(`${w} 13px "IBM Plex Sans"`)).length,
        ),
      ),
    );
    expect(faces).toEqual([1, 1, 1]);
  } finally {
    await app.close();
  }
});

test('the theme follows the system until the user picks one, then keeps it', async () => {
  const userData = join(work, 'user data');
  let app = await launchApp(userData);
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => theme(page)).toBe('dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => theme(page)).toBe('light');

    await page.getByRole('button', { name: 'Passer au thème sombre' }).click();
    await expect.poll(() => theme(page)).toBe('dark');
    await page.getByRole('button', { name: 'Passer au thème clair' }).click();
    await expect.poll(() => theme(page)).toBe('light');
    await page.getByRole('button', { name: 'Passer au thème sombre' }).click();
    await expect.poll(() => theme(page)).toBe('dark');

    // The user's choice wins over the system from now on.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(200);
    expect(await theme(page)).toBe('dark');
  } finally {
    await app.close();
  }

  app = await launchApp(userData);
  try {
    const page = await app.firstWindow();
    await expect.poll(() => theme(page)).toBe('dark');
  } finally {
    await app.close();
  }
});

test('panel and inspector widths follow their handles and survive a restart', async () => {
  const userData = join(work, 'user data');
  const widthOf = async (page: Page, name: string) =>
    (
      await page
        .getByRole(name === 'Inspecteur' ? 'complementary' : 'region', { name })
        .boundingBox()
    )?.width;

  let app = await launchApp(userData);
  try {
    const page = await app.firstWindow();
    const panel = page.getByRole('separator', { name: 'Largeur du panneau' });
    await expect(panel).toHaveAttribute('aria-valuenow', '272');
    const box = await panel.boundingBox();
    if (!box) throw new Error('No panel handle');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 4 });
    await page.mouse.up();
    await expect(panel).toHaveAttribute('aria-valuenow', '312');
    expect(await widthOf(page, 'Panneau Photos')).toBeCloseTo(312, 0);

    // Dragging far past the bound stops at the maximum.
    await page.mouse.move(x + 40, y);
    await page.mouse.down();
    await page.mouse.move(x + 900, y, { steps: 4 });
    await page.mouse.up();
    await expect(panel).toHaveAttribute('aria-valuenow', '440');

    // The inspector grows to the left; its handle also takes the keyboard.
    const inspector = page.getByRole('separator', { name: "Largeur de l'inspecteur" });
    await inspector.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(inspector).toHaveAttribute('aria-valuenow', String(264 + 8 + 32));
  } finally {
    await app.close();
  }

  app = await launchApp(userData);
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('separator', { name: 'Largeur du panneau' })).toHaveAttribute(
      'aria-valuenow',
      '440',
    );
    await expect(page.getByRole('separator', { name: "Largeur de l'inspecteur" })).toHaveAttribute(
      'aria-valuenow',
      '304',
    );
    expect(await widthOf(page, 'Inspecteur')).toBeCloseTo(304, 0);
  } finally {
    await app.close();
  }
});
