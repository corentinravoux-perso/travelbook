import type { ElectronApplication, Page } from '@playwright/test';

/** Answer the folder dialogs of the app with `dir`, as if the user had picked it. */
export function pickFolders(app: ElectronApplication, dir: string): Promise<void> {
  return app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [folder] });
  }, dir);
}

/** Create an album from the home screen's dialog (`format` is part of a preset's name). */
export async function createFromHome(
  page: Page,
  title: string,
  format = 'A4 portrait',
): Promise<void> {
  await page.getByRole('button', { name: 'Nouveau livre' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau livre' });
  await dialog.getByLabel('Titre').fill(title);
  await dialog.getByRole('button', { name: 'Choisir…' }).click();
  await dialog.getByRole('radio', { name: new RegExp(format) }).check({ force: true });
  await dialog.getByRole('button', { name: 'Créer le livre' }).click();
}
