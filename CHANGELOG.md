# Changelog

All notable changes to travelbook. Versions follow [Semantic Versioning](https://semver.org/);
the format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Stickers: a new **travelbook** tab, first in the panel, with the sets drawn for travelbook
  (MIT): **Croquis** (83 bold black ink doodles with a white fill), **Bohème** (line art on
  colour blobs, flat flowers, sprigs, tropical plants and travel drawings), **Déco** (175
  generated stickers: washi tape, labels, travel and postage stamps, hand-drawn arrows, speech
  bubbles, photo corners, confetti, French lettering) and **Affiches**.
- Stickers: Bibliothèque opens on about 120 recommended stickers picked from the open packs.
- Stickers: the hand-drawn monochrome icon sets doodle-icons, Streamline Freehand and
  Pepicons Pencil.
- Affiches: "Créer une affiche…" (cover tools and the Modèles panel) composes a poster cover,
  front and spine: the place in large letters at the top, the year under it, and a drawing
  centred below, in five layouts (Classique, Empilé, Arche, Soleil, Horizon), with a live
  preview, applied in one undoable step as ordinary elements.
- 43 original flat drawings for 13 destinations, with one preset each; they are also the
  sticker set "Affiches", usable on any page. Recolourable drawings follow the title colour on
  request.
- Lilita One, the posters' title face, among the bundled fonts (42 families).

## [0.1.0] - 2026-11-15

First release. Every package of the repository (`travelbook`, `@travelbook/core`,
`@travelbook/render`, `@travelbook/desktop`) carries this version.

### Added

- Desktop application (Electron, TypeScript, French interface) for printed travel photo albums,
  as a Linux `.deb` and a Windows installer, offline and without an account.
- Albums as `<title>.travelbook` folders, saved a second after every change, with a version
  history (every ten minutes and on Ctrl+S) that can be restored, and undo and redo.
- Page formats A4 portrait and landscape, A5, 21 x 21, 30 x 30, 24 x 32 cm, or free from 50 to
  600 mm; a cover with its spine.
- Photo import by button or by drag and drop, grouped by EXIF day, originals never modified;
  a missing original is put back when the photo is imported again.
- 273 templates for 1 to 16 photos, covers, chapter openings, text pages and whole spreads,
  "Mise en page aléatoire", and pages saved as your own templates.
- Photo editing in the inspector: crop, rotation, masks, borders, shadows and look adjustments,
  with a resolution badge per photo.
- Text with five ready styles, 41 bundled font families, your own font files and a search of
  the Fontsource catalogue; 51 000 bundled stickers, online sources and your own images; shapes;
  colour, gradient, pattern, texture and photo backgrounds.
- Spreads strip and overview with reordering, a full-window preview, and the export dialog:
  print PDF (vector, adjustments baked into the photos) or one image per page, presets, and
  checks before export.

### Changed

- Interface refinement of visual direction A, "Gris neutre" (`docs/design/visual-direction.md`).
  The chrome still has no hue and the page keeps its neutral grey surround. Source Serif 4 now
  sets the titles (app name, book title, home heading, dialogs, panels). The page, the preview
  and the album covers sit as paper with a soft shadow, and the home screen shows albums as bound
  books. Hairlines are lighter. Segmented controls and tab grids are a sunken track with an
  inverted chip. Buttons step on hover and press on click, and dialogs settle in once on open.

### Fixed

- Online stickers from Openverse showed as blank tiles. Openverse's thumbnail proxy answers 424
  for every Wikimedia image, so those now take Wikimedia's own 250 px thumbnail. Online requests
  go through Electron's network stack, since Wikimedia throttled Node's `fetch` inside Electron;
  a thumbnail is downloaded once, not twice, and a short "Retry-After" is waited out.
- Scrolling the sticker grid or the photo tray no longer blanks the window; a render error now
  shows a message with a reload button instead of a white window.

[0.1.0]: https://github.com/corentinravoux/travelbook/releases/tag/v0.1.0
