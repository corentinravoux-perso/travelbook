import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './theme/tokens.css';
import './theme/base.css';
import './theme/controls.css';
import { useEffect } from 'react';
import { Shell } from './editor/Shell';
import { Home } from './home/Home';
import { answerCloseRequest } from './store/closeRequest';
import { editorStore } from './store/editor';
import { coverThumbs, projectStore, useProject } from './store/project';

export { initTheme } from './theme/theme';

// Test-only handle for the e2e specs, which have no editing UI to drive yet (never in a release).
if (__E2E__) (window as unknown as { __tbEditor: typeof editorStore }).__tbEditor = editorStore;

export function App() {
  const view = useProject((s) => s.view);

  useEffect(() => {
    // Main asks for a save before the window closes; a rejection makes it ask the user.
    const unregister = window.tb.app.onCloseRequest(() =>
      answerCloseRequest(editorStore, coverThumbs),
    );
    const stopSnapshots = projectStore.getState().startAutoSnapshots();
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void projectStore.getState().manualSnapshot();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stopSnapshots();
      unregister();
    };
  }, []);

  return view === 'editor' ? <Shell /> : <Home />;
}
