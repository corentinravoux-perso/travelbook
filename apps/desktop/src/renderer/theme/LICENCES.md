# Licences of the UI font and icons

Bundled into the renderer at build time; the app loads nothing from the network.

| Asset                                                   | Source                                                  | Author                     | Licence     | URL                                    |
| ------------------------------------------------------- | ------------------------------------------------------- | -------------------------- | ----------- | -------------------------------------- |
| Nunito (latin 400, 600, 700, 800 normal)                | npm `@fontsource/nunito` 5.3.0                          | The Nunito Project Authors | SIL OFL 1.1 | https://github.com/googlefonts/nunito  |
| Caveat (latin 700 normal)                               | npm `@fontsource/caveat` 5.3.0                          | The Caveat Project Authors | SIL OFL 1.1 | https://github.com/googlefonts/caveat  |
| Tabler Icons (the names in `scripts/generate-icons.ts`) | npm `@iconify-json/tabler` 1.2.43 (Tabler Icons 3.50.0) | Paweł Kuna                 | MIT         | https://github.com/tabler/tabler-icons |

The font files (both faces) ship unmodified (OFL 1.1 allows bundling with software; the font is not sold on
its own). The icon SVG bodies are copied unmodified into `icons.ts`; the stroke width is set by
CSS (`--icon-stroke`). The licence texts are in the packages: `node_modules/@fontsource/nunito/LICENSE`, `node_modules/@fontsource/caveat/LICENSE`
and https://github.com/tabler/tabler-icons/blob/master/LICENSE.
