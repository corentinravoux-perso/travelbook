import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { menuTemplate } from './app-menu';
import { menuLanguage, setMenuLanguage } from './app-settings';
import { setUserDataDir } from './user-data';

const labels = (language: 'fr' | 'en', platform: NodeJS.Platform = 'linux') =>
  menuTemplate(language, platform, 'travelbook').map((m) => m.label);

const submenuRoles = (language: 'fr' | 'en', platform: NodeJS.Platform, top: number) => {
  const sub = menuTemplate(language, platform, 'travelbook')[top]?.submenu;
  return (Array.isArray(sub) ? sub : []).map((i) => i.role ?? i.type);
};

describe('menuTemplate', () => {
  it('is French: Fichier, Édition, Affichage, Fenêtre', () => {
    expect(labels('fr')).toEqual(['Fichier', 'Édition', 'Affichage', 'Fenêtre']);
  });

  it('is English on request: File, Edit, View, Window', () => {
    expect(labels('en')).toEqual(['File', 'Edit', 'View', 'Window']);
  });

  it('labels the items in the chosen language, never with a bare role label', () => {
    const edit = menuTemplate('fr', 'linux', 'travelbook')[1]?.submenu;
    const items = (Array.isArray(edit) ? edit : []).filter((i) => i.type !== 'separator');
    expect(items.map((i) => i.label)).toEqual([
      'Annuler',
      'Rétablir',
      'Couper',
      'Copier',
      'Coller',
      'Tout sélectionner',
    ]);
    const editEn = menuTemplate('en', 'linux', 'travelbook')[1]?.submenu;
    expect(
      (Array.isArray(editEn) ? editEn : [])
        .filter((i) => i.type !== 'separator')
        .map((i) => i.label),
    ).toEqual(['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Select All']);
  });

  it('keeps the capabilities of the default menu', () => {
    expect(submenuRoles('fr', 'linux', 0)).toEqual(['quit']);
    expect(submenuRoles('fr', 'linux', 1)).toEqual([
      'undo',
      'redo',
      'separator',
      'cut',
      'copy',
      'paste',
      'selectAll',
    ]);
    expect(submenuRoles('fr', 'linux', 2)).toEqual([
      'reload',
      'forceReload',
      'toggleDevTools',
      'separator',
      'resetZoom',
      'zoomIn',
      'zoomOut',
      'separator',
      'togglefullscreen',
    ]);
    expect(submenuRoles('fr', 'linux', 3)).toEqual(['minimize', 'zoom', 'close']);
  });

  it('puts the app menu first on macOS only', () => {
    expect(labels('fr', 'darwin')).toEqual([
      'travelbook',
      'Fichier',
      'Édition',
      'Affichage',
      'Fenêtre',
    ]);
    expect(menuTemplate('fr', 'darwin', 'travelbook')[0]?.role).toBe('appMenu');
    expect(menuTemplate('fr', 'linux', 'travelbook').some((m) => m.role === 'appMenu')).toBe(false);
    expect(menuTemplate('fr', 'win32', 'travelbook').some((m) => m.role === 'appMenu')).toBe(false);
    // On macOS the quit entry lives in the app menu: File only closes.
    expect(submenuRoles('fr', 'darwin', 1)).toEqual(['close']);
  });
});

describe('menu language setting', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tb-menu-'));
    setUserDataDir(dir);
  });
  afterEach(async () => {
    setUserDataDir(null);
    await rm(dir, { recursive: true, force: true });
  });

  it('defaults to French', async () => {
    expect(await menuLanguage()).toBe('fr');
  });

  it('persists the choice', async () => {
    await setMenuLanguage('en');
    expect(await menuLanguage()).toBe('en');
    await setMenuLanguage('fr');
    expect(await menuLanguage()).toBe('fr');
  });

  it('reads a damaged or unknown value as French', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, 'app-settings.json'), '{nope');
    expect(await menuLanguage()).toBe('fr');
    await writeFile(join(dir, 'app-settings.json'), '{"menuLanguage":"de"}');
    expect(await menuLanguage()).toBe('fr');
  });
});
