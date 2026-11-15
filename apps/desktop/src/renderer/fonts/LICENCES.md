# Licences of the fonts

Every font the app ships is listed, with its licence and author, in
`apps/desktop/resources/fonts.json`, and its files and licence text are in
`apps/desktop/resources/fonts/<family>/` (written by `npm run fonts`, from the pinned
`@fontsource/*` packages). All are SIL OFL 1.1 or Apache 2.0, in the latin subset published by
Fontsource, which covers é è ê ç œ Œ « ». `The font test` (`src/main/library/fonts.test.ts`)
checks that every face has these glyphs.

The six fonts of the text presets (Inter, Lora, Playfair Display, Cormorant Garamond, Oswald,
Caveat) are served from the same files: `bookFonts.ts` points at `tb://resource/fonts/...`, so no
file exists twice. A font the user downloads from the Fontsource catalogue goes to the user
library with its licence and is copied into an album only when a text uses it.
