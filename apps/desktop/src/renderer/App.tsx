import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './theme/tokens.css';
import './theme/base.css';
import { Shell } from './editor/Shell';

export { initTheme } from './theme/theme';

export function App() {
  return <Shell />;
}
