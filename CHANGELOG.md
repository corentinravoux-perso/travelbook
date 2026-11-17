# Changelog

All notable changes to travelbook. Versions follow [Semantic Versioning](https://semver.org/);
the format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.2.0] - 2026-11-17

### Added

- Cartes: a map maker ("Créer une carte…" in the Cartes panel, "Modifier la carte…" on a
  placed map). Vector maps of 272 countries and regions from bundled Overture Maps data
  (ODbL), drawn offline: cities and sights, places added by a click, labels to drag, a
  numbered itinerary with six travel modes (voiture, bus, train, avion, bateau, à pied),
  straight or curved legs with their vehicle, photo medallions, six styles (Carnet, Ardoise,
  Safran, Encre, Crayon, Pastel) and templates of one's own. Detailed regional outlines are
  downloaded on first use; the map works offline with the country outline. The map dialog
  has its own undo (Ctrl+Z, Ctrl+Maj+Z, Ctrl+Y), a stop can go without a number, and the
  space between the words of a label can be set. The ODbL credit is listed in "Crédits des
  images".
- Home: "Supprimer" under each album moves its folder to the system trash, after a
  confirmation; the album leaves the recent list. A copy in progress shows "Duplication…".

- Affiches: Machu Picchu, a new Peru poster (Géant): Huayna Picchu over the citadel, its
  terraces, a woolly llama in a woven blanket and an Inca wall, modelled in volume with ink
  linework; and "Machu Picchu simple", the same site in flat colours and ink lines: the
  twin peaks, the ruins, terraces with llamas.
- Cover: "Avec tranche / Sans tranche" on the cover toolbar and in "Créer une affiche…", with
  the spine width in mm (a first guess from the page count). The dialog previews the choice and
  applies it with the poster, in one undo step; the volume view of a book without spine shows
  only a thin edge.
- Aperçu: "Zones rognées" (on by default) draws the bleed and hatches what the cut removes, the
  folds and the spine dashed, so the part of a photo the print trims off is visible.
- Déco: 122 new labels ("Étiquettes") in 41 new shapes, simple and elaborate: oval, pill,
  round badge, pennant, swallowtail flag, heart, cloud, shield, hexagon, apothecary,
  diamond, star, arch, scroll, curved ribbon, rosette, wax seal, sunburst, price tag, gift
  tag, jam-jar label, school label, cartouche, index tab, flower, raffle ticket, pinned
  note, paper clip, taped sheet, torn paper, wooden signpost, stitched leather tag,
  chalkboard, envelope, beaded medallion, brace banner, airport luggage tag, bow, scroll
  ornaments and two hand-drawn sketch labels. The set grows from 175 to 297 stickers.
- Déco: 66 torn-paper labels: plain rectangles torn on one side (right or bottom), two sides
  (left and right, top and bottom), a corner or all four, in five tear styles (fine, chunky,
  teeth, soft wave, fibre with a pale paper fringe), plus notebook pages torn from a pad
  (Seyès, squared, lined) in white and yellow. The set grows to 363 stickers.
- Photos: each day of the tray folds away under its header (the chevron left of the date),
  and unfolds again.

### Changed

- Stickers: the "Mes stickers" tab is gone, as it repeated "Récents" and "Favoris". Images are
  now imported (button, drop or paste) and removed in "Récents", which lists the stickers
  placed or imported most recently.

### Fixed

- Affiches: a large accented title (PÉROU, ÉCOSSE in Géant) no longer pushes its accent past
  the trim: the title moves down until the accent is inside the safe margin.
- Removing the spine removes the spine title, which would otherwise straddle the fold.

## [1.1.0] - 2026-11-16

### Added

- Affiches: a sixth layout, **Géant**: the title set word by word, as large as the front
  allows, the year at almost twice its usual size, the drawing edge to edge and standing on
  the foot of the page (a wide drawing is centred under the title instead).
- Affiches: "Voir le livre en volume" shows the preview and the preset gallery as a closed
  hard-cover book seen from the left (CSS 3D), the flat view one click away.
- Affiches: 19 new drawings and their presets, all in the Géant layout but the koi (Soleil):
  13 modelled in volume (the new "relief" family, with gradients and highlights), one per
  destination, and 6 hand-drawn scenes with ink linework and hatching (Amalfi coast, Highland
  stag, scarlet macaw, rhinoceros, koi pond, Lake Titicaca reed boat).
- Affiches: 6 hand-drawn scenes added beside the cut-paper drawings of the same places,
  which stay: Golden Gate in the fog, Great Wall on the ridges, Fuji over a lake, Arenal over
  the rainforest, Etna above its vineyards, the rainbow mountain with hikers.
- Affiches: the Géant presets use Anton, a condensed title face; the others keep Lilita One.
- Photos: remove photos imported by mistake: the bin on a thumbnail, or tick photos and
  "Supprimer…" in the bar under the tray. The question says how many are placed; their frames
  become empty frames. One undo step brings everything back.
- Rulers in millimetres along the top and the left of the canvas (as in a word processor), in
  the inspector's coordinates: they mark the pointer with its position, the extent of the
  selection and the safe margins. A drag from a ruler lays a guide that elements snap to; guides
  are saved with the spread and never printed. "Règles et repères" in Affichage hides them.
- Photos: a click on a photo of the tray puts it on the page in view (in its first empty frame,
  or in a frame of its own) or takes it off; the photos on the double page in view are framed
  in lagoon. A double-click shows the photo large, with its date, size and use; the arrows go
  through the tray. Ticking photos is now Ctrl or Shift + click.
- The panel and the inspector fold away (the button at their top) to give the page the room; a
  click on a tool of the rail opens the panel again. They stay folded across sessions.
- Rulers come in three sizes (Petite, Moyenne, Grande) under Affichage; numbers and marks scale
  with them.
- Calques: a bin at the end of each row deletes its element, and the bin of a group's row the
  whole group, in one undo step.

### Changed

- Interface: new visual direction B, "Carnet de route" (`docs/design/visual-direction.md`). White
  panels round a sky-mist desk with a notebook dot grid, navy ink, one lagoon teal for the
  primary action and the selected choice, Nunito for the interface and Caveat for the app name
  and the home heading, in light and dark.
- Home: with no album yet, four Bohème drawings lie round an open blank book.
- Photos: "Importer des photos" is the panel's first, primary action; the days of the trip read
  as chapters; a used photo carries a lagoon count chip. Exporter gains an icon.

### Fixed

- Stickers: a tall drawing no longer stretches its tile over the next row of the grid.
- The photo tray and the sticker grid no longer re-lay themselves in a loop where the scrollbar
  takes room (classic scrollbars): the room of the scrollbar is always kept.

## [1.0.0] - 2026-11-16

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
- Cartes: "Créer une carte…" (Cartes panel) draws a vector map of a country or a region from
  bundled geodata (Overture Maps divisions, ODbL 1.0, credited in "Crédits des images"), with
  cities and sights, custom places, movable labels, an itinerary (voiture, bus, train, avion,
  bateau, pied; numbered stops, straight or curved legs) and optional photo medallions. Six
  styles (Carnet, Ardoise, Safran, Encre, Crayon, Pastel) with icon sizes, outline detail and
  your own saved templates. Pan and zoom in the preview; the map is reopened with a
  double-click or "Modifier la carte…". Context land around the subject comes from a shared
  Natural Earth layer. Finer outlines of some regions are downloaded when first needed, with a
  clear message when offline. A map's text stays vector text in the PDF.
- Cartes: an album with a map is saved as format 2; once its last map is deleted it is saved as
  format 1 again, so release 0.1 can open it.

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

[Unreleased]: https://github.com/corentinravoux-perso/travelbook/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/corentinravoux-perso/travelbook/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/corentinravoux-perso/travelbook/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/corentinravoux-perso/travelbook/releases/tag/v1.0.0
[0.1.0]: https://github.com/corentinravoux-perso/travelbook/releases/tag/v0.1.0
