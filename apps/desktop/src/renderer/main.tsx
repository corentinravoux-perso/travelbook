import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
if (__RENDER_FIXTURE__ && location.hash === '#render-fixture') {
  // Test-only page, which main loads only in an unpackaged app (see main/index.ts).
  void import('./render-fixture/RenderFixture').then((m) => m.installFixture(root));
} else if (location.hash === '#export') {
  // The hidden window of the export (Task 7.2): main drives it, nothing of the app's shell loads.
  void import('./export/ExportPage').then((m) => m.installExportPage(root));
} else {
  // Loaded on demand, so the app's global styles never reach the render fixture page.
  void Promise.all([import('./App'), import('./ErrorBoundary')]).then(
    ([{ App, initTheme }, { ErrorBoundary }]) => {
      initTheme();
      createRoot(root).render(
        <StrictMode>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </StrictMode>,
      );
    },
  );
}
