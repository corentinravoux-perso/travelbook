# Licences of the book fonts

Bundled into the renderer at build time (Vite `?url` imports), served from the app itself; the app
loads nothing from the network. These are the six fonts of the text tools until Task 6.4 brings the
full list. Each file is the unmodified latin subset published by Fontsource (npm 5.3.0), which
covers é è ê ç œ Œ « ».

| Font               | Source                                     | Author                        | Licence     | URL                                             |
| ------------------ | ------------------------------------------ | ----------------------------- | ----------- | ----------------------------------------------- |
| Inter              | npm `@fontsource/inter` 5.3.0              | The Inter Project Authors     | SIL OFL 1.1 | https://github.com/rsms/inter                   |
| Lora               | npm `@fontsource/lora` 5.3.0               | The Lora Project Authors      | SIL OFL 1.1 | https://github.com/cyrealtype/Lora-Cyrillic     |
| Playfair Display   | npm `@fontsource/playfair-display` 5.3.0   | The Playfair Project Authors  | SIL OFL 1.1 | https://github.com/clauseggers/Playfair-Display |
| Cormorant Garamond | npm `@fontsource/cormorant-garamond` 5.3.0 | The Cormorant Project Authors | SIL OFL 1.1 | https://github.com/CatharsisFonts/Cormorant     |
| Oswald             | npm `@fontsource/oswald` 5.3.0             | The Oswald Project Authors    | SIL OFL 1.1 | https://github.com/googlefonts/OswaldFont       |
| Caveat             | npm `@fontsource/caveat` 5.3.0             | The Caveat Project Authors    | SIL OFL 1.1 | https://github.com/googlefonts/caveat           |

The licence texts are in the packages (`node_modules/@fontsource/<name>/LICENSE`).
