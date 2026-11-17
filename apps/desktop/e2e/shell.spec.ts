import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFromHome, openAlbumCard, pickFolders } from './home';
import { launchApp } from './launch';

let work: string;
test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-shell-'));
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

/** The editor shell is behind the home screen: create an album to reach it. */
async function openShell(app: ElectronApplication): Promise<Page> {
  await pickFolders(app, join(work, 'albums'));
  const page = await app.firstWindow();
  await createFromHome(page, 'Album de test');
  await expect(page.getByRole('banner', { name: 'Barre du haut' })).toBeVisible();
  return page;
}

const theme = (page: Page) => page.locator('html').getAttribute('data-theme');

test('the shell shows its six regions under their French names', async () => {
  const app = await launchApp(join(work, 'user data'));
  try {
    const page = await openShell(app);
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

    // The UI faces are the bundled Nunito and Caveat, not a system fallback.
    // (`fonts.load` resolves to the faces it loaded: none if no bundled face matched.)
    const faces = await page.evaluate(async () =>
      Promise.all(
        [
          '400 13px "Nunito"',
          '600 13px "Nunito"',
          '700 13px "Nunito"',
          '800 13px "Nunito"',
          '700 27px "Caveat"',
        ].map(async (font) => (await document.fonts.load(font)).length),
      ),
    );
    expect(faces.every((n) => n >= 1)).toBe(true);
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
    const page = await openShell(app);
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
    await openAlbumCard(page, /Album de test/);
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

test('the panel and the inspector fold away and open again, and stay so after a restart', async () => {
  const userData = join(work, 'user data');
  let app = await launchApp(userData);
  try {
    let page = await openShell(app);
    const panel = page.getByRole('region', { name: 'Panneau Photos' });
    const inspector = page.getByRole('complementary', { name: 'Inspecteur' });
    const canvas = page.getByRole('main', { name: 'Plan de travail' });
    const before = (await canvas.boundingBox())!.width;

    // The panel's own button folds it; the canvas takes the room.
    await panel.getByRole('button', { name: 'Réduire le panneau' }).click();
    await expect(panel).toBeHidden();
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(before);
    // A click on the tool unfolds it; a second click leaves it open (only the button folds).
    const rail = page.getByRole('navigation', { name: 'Outils' });
    await rail.getByRole('button', { name: 'Photos' }).click();
    await expect(panel).toBeVisible();
    await rail.getByRole('button', { name: 'Photos' }).click();
    await expect(panel).toBeVisible();
    // Another tool opens its panel; folded, it stays folded across a restart.
    await rail.getByRole('button', { name: 'Texte' }).click();
    const text = page.getByRole('region', { name: 'Panneau Texte' });
    await expect(text).toBeVisible();
    await text.getByRole('button', { name: 'Réduire le panneau' }).click();
    await expect(text).toBeHidden();

    // The inspector folds to a strip with the button that opens it.
    await inspector.getByRole('button', { name: "Réduire l'inspecteur" }).click();
    await expect(inspector.getByRole('tablist')).toBeHidden();
    expect((await inspector.boundingBox())!.width).toBeLessThan(40);

    // Both stay folded after a restart.
    const exited = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await exited;
    app = await launchApp(userData);
    page = await app.firstWindow();
    await openAlbumCard(page, /Album de test/);
    await expect(page.getByRole('banner', { name: 'Barre du haut' })).toBeVisible();
    await expect(page.locator('#shell-panel')).toBeHidden();
    const strip = page.getByRole('complementary', { name: 'Inspecteur' });
    await strip.getByRole('button', { name: "Afficher l'inspecteur" }).click();
    await expect(strip.getByRole('tablist')).toBeVisible();
  } finally {
    await app.close().catch(() => {});
  }
});
