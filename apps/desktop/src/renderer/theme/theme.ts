/**
 * Light or dark chrome, set as `data-theme` on <html> (tokens.css reads it). The user's choice is
 * kept in renderer storage; until they make one, the theme follows the system setting.
 */
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'travelbook.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

const isTheme = (value: string | null): value is Theme => value === 'light' || value === 'dark';

/** The stored choice if there is a valid one, else the system's. */
export function pickTheme(stored: string | null, systemDark: boolean): Theme {
  if (isTheme(stored)) return stored;
  return systemDark ? 'dark' : 'light';
}

function stored(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function show(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  for (const listener of listeners) listener();
}

/** The theme on screen. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Show the theme before the first render, and follow the system while the user has no choice. */
export function initTheme(): void {
  const media = matchMedia(DARK_QUERY);
  show(pickTheme(stored(), media.matches));
  media.addEventListener('change', (e) => {
    if (isTheme(stored())) return;
    show(e.matches ? 'dark' : 'light');
  });
}

/** Show `theme` and remember it as the user's choice. */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage refused (quota, policy): the theme still changes for this session.
  }
  show(theme);
}

/** For `useSyncExternalStore`: `listener` runs whenever the theme on screen changes. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
