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
npm run dist:linux     # .deb package: apps/desktop/dist/travelbook_<version>_amd64.deb
npm run dist:win       # Windows NSIS installer: apps/desktop/dist/travelbook-setup-<version>-x64.exe
npm run e2e:packaged   # Playwright against the app that dist:linux built (dist/linux-unpacked)
```

`npm run e2e` needs a display; on a headless Linux machine run it under `xvfb-run`.

## Install

The `.deb` installs under `/opt/travelbook` and adds a "travelbook" entry to the application menu:

```sh
sudo apt install ./travelbook_<version>_amd64.deb
sudo apt remove travelbook
```

The Windows installer is not signed, so SmartScreen asks for a confirmation: "Informations
complémentaires", then "Exécuter quand même". It installs for the current user only.

A tag `vX.Y.Z` (equal to the version in `apps/desktop/package.json`) builds both installers and
publishes them on a GitHub Release (`.github/workflows/release.yml`).

## Clean room

See [CLEANROOM.md](CLEANROOM.md).

## Licence

MIT, see [LICENSE](LICENSE).
