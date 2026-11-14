# Fonts of the render visual spec

Test-only fonts, bundled only in the `e2e` build (`electron-vite build --mode e2e`), never in the
production build. Taken from the npm packages @fontsource/inter and @fontsource/lora 5.3.0.

| Font  | Files used                               | Author                    | Licence     | Source                                      |
| ----- | ---------------------------------------- | ------------------------- | ----------- | ------------------------------------------- |
| Inter | latin 400 normal, 700 normal             | The Inter Project Authors | SIL OFL 1.1 | https://github.com/rsms/inter               |
| Lora  | latin 400 normal, 400 italic, 700 normal | The Lora Project Authors  | SIL OFL 1.1 | https://github.com/cyrealtype/Lora-Cyrillic |

Package: https://fontsource.org/fonts/inter, https://fontsource.org/fonts/lora (OFL-1.1 in package.json).
