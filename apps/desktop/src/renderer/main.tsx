import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
if (__RENDER_FIXTURE__ && location.hash === '#render-fixture') {
  // Test-only page, which main loads only in an unpackaged app (see main/index.ts).
  void import('./render-fixture/RenderFixture').then((m) => m.installFixture(root));
} else
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
