import type { MenuItemConstructorOptions } from 'electron';
import type { MenuLanguage } from '../shared/api';

type Platform = NodeJS.Platform;

interface Labels {
  file: string;
  edit: string;
  view: string;
  window: string;
  quit: string;
  close: string;
  undo: string;
  redo: string;
  cut: string;
  copy: string;
  paste: string;
  selectAll: string;
  reload: string;
  forceReload: string;
  devTools: string;
  resetZoom: string;
  zoomIn: string;
  zoomOut: string;
  fullscreen: string;
  minimize: string;
  zoom: string;
}

/**
 * The menu bar is the only part of the app that has an English version: the interface stays
 * French. Electron's own role labels follow the system language, so each item carries its label.
 */
const LABELS: Record<MenuLanguage, Labels> = {
  fr: {
    file: 'Fichier',
    edit: 'Édition',
    view: 'Affichage',
    window: 'Fenêtre',
    quit: 'Quitter',
    close: 'Fermer',
    undo: 'Annuler',
    redo: 'Rétablir',
    cut: 'Couper',
    copy: 'Copier',
    paste: 'Coller',
    selectAll: 'Tout sélectionner',
    reload: 'Actualiser',
    forceReload: "Forcer l'actualisation",
    devTools: 'Outils de développement',
    resetZoom: 'Taille réelle',
    zoomIn: 'Zoom avant',
    zoomOut: 'Zoom arrière',
    fullscreen: 'Plein écran',
    minimize: 'Réduire',
    zoom: 'Zoom',
  },
  en: {
    file: 'File',
    edit: 'Edit',
    view: 'View',
    window: 'Window',
    quit: 'Quit',
    close: 'Close',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    reload: 'Reload',
    forceReload: 'Force Reload',
    devTools: 'Toggle Developer Tools',
    resetZoom: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    fullscreen: 'Toggle Full Screen',
    minimize: 'Minimize',
    zoom: 'Zoom',
  },
};

/**
 * The application menu, with the entries of Electron's default menu (nothing added, nothing
 * dropped but its "Learn more" link). macOS leads with the app menu; elsewhere there is none.
 */
export function menuTemplate(
  language: MenuLanguage,
  platform: Platform,
  appName: string,
): MenuItemConstructorOptions[] {
  const t = LABELS[language];
  const mac = platform === 'darwin';
  return [
    ...(mac ? [{ role: 'appMenu', label: appName } as const] : []),
    {
      label: t.file,
      submenu: [mac ? { role: 'close', label: t.close } : { role: 'quit', label: t.quit }],
    },
    {
      label: t.edit,
      submenu: [
        { role: 'undo', label: t.undo },
        { role: 'redo', label: t.redo },
        { type: 'separator' },
        { role: 'cut', label: t.cut },
        { role: 'copy', label: t.copy },
        { role: 'paste', label: t.paste },
        { role: 'selectAll', label: t.selectAll },
      ],
    },
    {
      label: t.view,
      submenu: [
        { role: 'reload', label: t.reload },
        { role: 'forceReload', label: t.forceReload },
        { role: 'toggleDevTools', label: t.devTools },
        { type: 'separator' },
        { role: 'resetZoom', label: t.resetZoom },
        { role: 'zoomIn', label: t.zoomIn },
        { role: 'zoomOut', label: t.zoomOut },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t.fullscreen },
      ],
    },
    {
      label: t.window,
      submenu: [
        { role: 'minimize', label: t.minimize },
        { role: 'zoom', label: t.zoom },
        ...(mac ? [] : [{ role: 'close', label: t.close } as const]),
      ],
    },
  ];
}
