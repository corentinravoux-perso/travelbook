# travelbook

A desktop application for composing printed travel photo albums. Import your photos, lay out
double pages from templates, add text, stickers and backgrounds, and export a print-ready PDF or
one image per page. It works offline, needs no account, and never changes your original photos.

**Version 1.3.1** ([CHANGELOG.md](CHANGELOG.md)). The Linux package is built and checked by the test suites
([docs/acceptance.md](docs/acceptance.md) lists what each goal rests on). The Windows installer is
built by CI but has not been run on a real machine yet.

The interface is in French. Code, comments and documentation are in English.

## Install

### Latest build of `main`

Every push to `main` rebuilds both installers and attaches them, under fixed names, to the
pre-release [`latest`](https://github.com/corentinravoux-perso/travelbook/releases/tag/latest):

| System        | File                    | Direct link                                                                                         |
| ------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| Windows (x64) | `travelbook-latest.exe` | <https://github.com/corentinravoux-perso/travelbook/releases/download/latest/travelbook-latest.exe> |
| Linux (x64)   | `travelbook-latest.deb` | <https://github.com/corentinravoux-perso/travelbook/releases/download/latest/travelbook-latest.deb> |

The repository is private: the links work only for a GitHub account with access to it, logged in.
From a terminal, the GitHub CLI fetches both files:

```sh
gh release download latest -R corentinravoux-perso/travelbook -D ~/Downloads/travelbook-latest
```

Versioned releases (tags `vX.Y.Z`) carry the version in the file names, as below.

### Linux (Ubuntu and other Debian systems, x64)

Download `travelbook-latest.deb` or `travelbook_<version>_amd64.deb`, then:

```sh
sudo apt install ./travelbook-latest.deb
sudo apt remove travelbook
```

Installing a newer package replaces the old one. The package installs under `/opt/travelbook` and
adds a "travelbook" entry (category Graphics) to the application menu.

### Windows (x64)

Download `travelbook-latest.exe` or `travelbook-setup-<version>-x64.exe` and run it. It installs for
the current user only (no administrator prompt), under `%LOCALAPPDATA%\Programs\travelbook`, with a
Start-menu shortcut. The installer is not signed, so SmartScreen asks for a confirmation:
"Informations complémentaires", then "Exécuter quand même". Running a newer installer updates the
app; the albums stay where they are.

Only one instance of the application runs at a time: starting it again brings the open window to
the front.

## Use

1. **Create an album.** On the home screen, "Nouveau livre": a title, a folder to keep it in, and a
   page format (A4 portrait or landscape, A5, 21 x 21, 30 x 30, 24 x 32 cm, or free from 50 to
   600 mm). The album is a folder `<title>.travelbook` inside the folder you chose.
2. **Import photos.** "Importer des photos" in the Photos panel, or drag files and folders from the
   file manager onto the window. Photos are grouped by day (from their EXIF date). Importing a
   photo the album already holds does nothing, except that a missing original is copied back.
   A photo imported by mistake goes with the bin on its thumbnail, or by ticking photos
   (Ctrl+click, or a day's checkbox) and "Supprimer…" in the bar under the tray. The frames that
   showed it become empty; Ctrl+Z brings it back. The files on your computer are not touched.
3. **Lay out the spreads.** Click a photo of the tray to put it on the page in view (a second
   click takes it off), double-click it to see it large, or drag it onto a page, or pick a layout in the Modèles panel
   (273 templates for 1 to 16 photos, covers, chapter openings, text pages and whole spreads;
   "Mise en page aléatoire" tries another layout with the same number of photos). Crop, rotate,
   mask, add borders and shadows, and adjust the look of a photo in the inspector. A page can be
   saved as your own template. Rulers in millimetres run along the top and the left of the page,
   in the inspector's coordinates; they mark the pointer and the selection. Drag from a ruler onto
   the page to lay a guide that elements snap to; drag it back onto its ruler, or double-click
   it, to remove it. Guides are kept with the album and never printed. "Affichage" hides them
   and sets the size of the rulers. The panel and the inspector fold away (the button at their
   top) to give the page the room; a click on a tool opens the panel again.
4. **Add text, stickers, shapes and backgrounds.** The Texte panel has five ready styles and the
   fonts (42 bundled families, your own TTF, OTF or WOFF2 files, and a search in the Fontsource
   catalogue). The Stickers panel searches 51 000 bundled stickers in French or English, online
   sources, and your own images. Fonds holds colours, gradients, patterns, textures and photos.
   For the cover, "Créer une affiche…" (in the cover tools and in Modèles) composes a poster:
   the place in large letters, the year, and a drawing, from 70 presets for 13 destinations,
   with a live preview; every colour, the layout and the text can be changed before it is
   applied, and the result is ordinary elements, undone in one step.
   The Cartes panel ("Créer une carte…") draws a map of a country or a region, offline: pick the
   place, then add cities and sights, an itinerary with a mode per leg (plane, car, bus, train,
   boat, on foot), photo medallions and one of six styles (Carnet, Ardoise, Safran, Encre, Crayon,
   Pastel) with sliders for icon size and outline detail. The map is vector (its text stays text
   in the PDF) and is reopened with a double-click. Finer outlines of some regions are downloaded
   once, when first chosen. An album with a map is saved in format 2; remove the maps and it opens
   again in release 0.1.
5. **Check and export.** "Aperçu" shows the book without the editing marks. "Exporter" opens the
   export dialog (see below), which also lists problems before it starts: a low-resolution photo,
   an empty photo frame, text outside the safe margin, a page count that breaks the printer's
   rule, a missing original (the only one that blocks the export).

The album saves itself a second after every change. The Historique tab keeps versions, one every
ten minutes while you work and one with Ctrl+S, so an earlier state can be restored. Undo and redo
cover the whole session. The overview (the grid button in the top bar) reorders the double pages. The Calques tab of the
inspector lists the elements of the double page: it hides, locks, renames, reorders and, with the
bin of a row, deletes them.
"Crédits des images" lists the licence of every sticker and background that needs one, and can
insert the credits as text on a page.

## Formats

| What                        | Accepted or produced                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| Photos in                   | JPEG, PNG and WebP (any letter case in the extension). EXIF orientation is applied.                |
| Stickers and backgrounds in | PNG, JPEG, WebP and SVG (an SVG is sanitised: no script, no external reference).                   |
| Fonts in                    | TTF, OTF, WOFF and WOFF2.                                                                          |
| Print PDF out               | One PDF, vector text with embedded fonts, TrimBox and BleedBox set, optional crop marks.           |
| Images out                  | JPEG (quality 1 to 100, 98 by default) or PNG, one file per page, with the resolution in the file. |
| Colour                      | sRGB. A printer that requires CMYK converts the file itself.                                       |

## Export routes

Both routes start from the original files in `originals/`, never from a preview, and the exported
page matches the page on screen (`docs/decisions/0001-export-fidelity.md`).

- **PDF d'impression.** Pages of the trim size plus 3 mm of bleed (an A4 page is 216 x 303 mm with a
  210 x 297 mm TrimBox), photos in a resolution from 150 to 600 dpi, free, or the photos' own pixels.
  "Traits de coupe" grows the page by the marks, placed outside the bleed. The cover is a separate
  one-page PDF, a flat sheet (back, spine and front).
- **Images.** One JPEG or PNG per page (or per double page) at the chosen resolution, with or
  without bleed, and the cover as one flat sheet or as separate panels (front, back and spine).

Export settings can be saved as named presets.

## Where the data is

An album is a folder you can copy, back up or send as a whole:

```
Islande-2026.travelbook/
  book.json     the album: pages, elements, asset list (written atomically)
  originals/    your photos, byte for byte, named by hash (a photo removed from the album
                keeps its file here, so an undo can show it again)
  assets/       stickers, backgrounds and fonts the album uses, with their licences
  cache/        thumbnails and previews, rebuilt when missing
  history/      the saved versions
```

The application keeps its own data, apart from any album, in `~/.config/travelbook` on Linux and
`%APPDATA%\travelbook` on Windows: the list of recent albums, your library of stickers, fonts and
templates, the export presets and a cache of online search results. Removing the application does
not remove either.

## Sources and licences

travelbook is released under the MIT licence ([LICENSE](LICENSE)). Everything the app bundles or
downloads carries `{source, author, licence, url}`, shown in "Crédits des images" where the licence
asks for it.

| Bundled                                            | Source and licence                                                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 42 font families (latin subset)                    | Fontsource packages of Google Fonts: SIL OFL 1.1 (40), Apache 2.0 (2). Each family folder carries its licence text.                                                         |
| 51 272 stickers in 23 sets (built at release time) | Iconify icon sets, each with its own licence: MIT, Apache 2.0, CC0, CC BY 4.0 and CC BY-SA 4.0. The last two require attribution.                                           |
| 70 poster drawings (set "Affiches") and presets    | Own work, MIT.                                                                                                                                                              |
| Map outlines and places (Cartes)                   | Overture Maps divisions and OpenStreetMap (ODbL 1.0, attribution required), Natural Earth (public domain), Wikidata (CC0), GeoNames (CC BY 4.0). Map styles: own work, MIT. |
| 71 patterns and 24 textures                        | Generated by this repository's scripts, CC0 1.0.                                                                                                                            |
| Templates, themes, app icon, keyword lists         | Own work, MIT.                                                                                                                                                              |
| Interface font and icons                           | Nunito and Caveat (SIL OFL 1.1) and Tabler Icons (MIT), see `apps/desktop/src/renderer/theme/LICENCES.md`.                                                                  |

The licence of every file under `apps/desktop/resources/` is in `fonts.json`, `backgrounds.json`,
the sticker manifest or `apps/desktop/resources/LICENCES.json`, and a test fails when one is missing.

Online sources are used only when you search them, with no account and no key, and send a
`travelbook/<version>` user agent: Iconify (icon sets), Openverse (PNG stickers) and Wikimedia
Commons (drawings), each result with its own licence, and the Fontsource catalogue for fonts.
GitHub Releases serve the fine map packs of the countries that are not bundled, downloaded only
when you choose a region of such a country. Nothing else leaves your machine. Permission requests such as camera or location are always refused.

## Clean room

The application covers the same ground as an existing online album editor, but it is an
independent work: no code, template, sticker, background, font, icon or screenshot of that editor is
in the repository or in the app. See [CLEANROOM.md](CLEANROOM.md).

## Development

npm workspaces:

- `packages/core`: document schema and pure operations (`@travelbook/core`)
- `packages/render`: the single renderer that turns a document into pixels (`@travelbook/render`)
- `apps/desktop`: the Electron application (`@travelbook/desktop`)

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
npm run e2e:stress     # 100-page book of 400 photos of 24 MP: measurements for docs/acceptance.md (~12 min, Linux)
```

`npm run e2e` needs a display; on a headless Linux machine run it under `xvfb-run`.

A tag `vX.Y.Z` (equal to the version in `apps/desktop/package.json`) builds both installers and
publishes them on a GitHub Release (`.github/workflows/release.yml`). The same workflow can be run
by hand from the Actions tab: it then builds and checks the installers and keeps them as workflow
artifacts, without creating a release. Every push to `main` runs it too and replaces the installers
of the pre-release `latest`.
