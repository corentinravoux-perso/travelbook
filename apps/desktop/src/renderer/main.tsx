import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
if (__RENDER_FIXTURE__ && location.hash === '#render-fixture') {
  // Test-only page, which main loads only in an unpackaged app (see main/index.ts).
  void import('./render-fixture/RenderFixture').then((m) => m.installFixture(root));
} else {
  // Loaded on demand, so the app's global styles never reach the render fixture page.
  void import('./App').then(({ App, initTheme }) => {
    initTheme();
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
