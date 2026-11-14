# travelbook

Desktop application for composing printed travel photo albums: import photos, lay out spreads
from templates, add text and stickers, and export print-ready PDFs and images.

**Status: early development.** Nothing is usable yet; this repository holds the scaffold.

The UI is in French. Code, comments and documentation are in English.

## Layout

npm workspaces:

- `packages/core`: document schema and pure operations (`@travelbook/core`)
- `packages/render`: the single renderer that turns a document into pixels (`@travelbook/render`)
- `apps/desktop`: the Electron application (`@travelbook/desktop`)

## Development

Requires Node.js 24 or later and npm.

```sh
npm ci                 # install; also downloads the Electron binary
npm run dev            # start the app with hot reload
npm run build          # build all workspaces
npm test               # unit tests (Vitest, all workspaces)
npm run typecheck      # TypeScript, strict
npm run lint           # ESLint and Prettier check
npm run e2e            # Playwright against the built Electron app
npm run dist:linux     # .deb package
npm run dist:win       # Windows NSIS installer
```

`npm run e2e` needs a display; on a headless Linux machine run it under `xvfb-run`.

## Clean room

See [CLEANROOM.md](CLEANROOM.md).

## Licence

MIT, see [LICENSE](LICENSE).
