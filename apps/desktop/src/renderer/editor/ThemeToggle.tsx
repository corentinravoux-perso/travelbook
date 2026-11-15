import { useSyncExternalStore } from 'react';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import { currentTheme, setTheme, subscribeTheme } from '../theme/theme';

/** Switches between the light and dark themes; the choice is kept by `theme.ts`. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme);
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? fr.shell.themeToDark : fr.shell.themeToLight;
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      <Icon name={next === 'dark' ? 'moon' : 'sun'} />
    </button>
  );
}
