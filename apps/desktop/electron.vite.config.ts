import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Dev-only CSP: Vite's HMR needs an inline preamble script and a WebSocket.
// The production build keeps the strict policy of src/renderer/index.html.
const DEV_CSP =
  "default-src 'self' tb:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "connect-src 'self' ws://localhost:* http://localhost:*; img-src 'self' tb: data:";

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
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
});
