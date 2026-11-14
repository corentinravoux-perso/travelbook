import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Dev-only CSP: the policy of src/renderer/index.html plus what Vite's HMR needs (an inline
// preamble script and a WebSocket). The production build keeps the strict policy.
const DEV_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' tb: data:; " +
  "font-src 'self' tb:; style-src 'self' 'unsafe-inline'; " +
  "connect-src 'self' tb: ws://localhost:* http://localhost:*";

export default defineConfig(({ mode }) => ({
  main: {
    // Dependencies of this package stay external (sharp and exifr must load from node_modules),
    // except @travelbook/core: its `main` is TypeScript source, which Node cannot load.
    build: { externalizeDeps: { exclude: ['@travelbook/core'] } },
  },
  preload: {
    // Sandboxed preloads cannot be ES modules: emit CommonJS.
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    // The render fixture page (and its test fonts) exists only in the `e2e` build.
    define: { __RENDER_FIXTURE__: JSON.stringify(mode === 'e2e') },
    plugins: [
      react(),
      {
        name: 'travelbook-dev-csp',
        apply: 'serve',
        transformIndexHtml: (html) =>
          html.replace(
            /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/,
            `$1${DEV_CSP}$2`,
          ),
      },
    ],
    resolve: { alias: { '@renderer': resolve(import.meta.dirname, 'src/renderer') } },
  },
}));
