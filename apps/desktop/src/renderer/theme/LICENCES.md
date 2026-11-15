# Licences of the UI font and icons

Bundled into the renderer at build time; the app loads nothing from the network.

| Asset                                                   | Source                                                  | Author     | Licence     | URL                                    |
| ------------------------------------------------------- | ------------------------------------------------------- | ---------- | ----------- | -------------------------------------- |
| IBM Plex Sans (latin 400, 500, 600 normal)              | npm `@fontsource/ibm-plex-sans` 5.3.0                   | IBM Corp.  | SIL OFL 1.1 | https://github.com/IBM/plex            |
| Tabler Icons (the names in `scripts/generate-icons.ts`) | npm `@iconify-json/tabler` 1.2.43 (Tabler Icons 3.50.0) | Paweł Kuna | MIT         | https://github.com/tabler/tabler-icons |

The font files ship unmodified (OFL 1.1 allows bundling with software; the font is not sold on
its own). The icon SVG bodies are copied unmodified into `icons.ts`; the stroke width is set by
CSS (`--icon-stroke`). The licence texts are in the packages: `node_modules/@fontsource/ibm-plex-sans/LICENSE`
and https://github.com/tabler/tabler-icons/blob/master/LICENSE.
