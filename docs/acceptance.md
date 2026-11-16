# Acceptance

What "done" means for travelbook v1, and what proves it. The goals and anti-goals are those of
the design (§3). Each has the automated test or the manual check that shows it, and a box that is
ticked only when the check was run and passed. Run on 2026-11-15, branch `phase-8-release`, on the
PC described under [Measurements](#measurements).

A path without a folder is under `apps/desktop/`. `e2e/` specs run on the built app (`npm run e2e`),
`e2e/packaged/` specs on the installed layout (`npm run dist:linux && npm run e2e:packaged`), unit
tests with `npm test`.

## Goals

- [x] **G1. Compose a 25–100 page book, page by page, in a free-form editor that shows double
      pages.**
  - `e2e/spreads.spec.ts`: spreads are added, moved and deleted and the numbering follows; the
    page rule warns without blocking; the overview reorders spreads. `e2e/canvas.spec.ts`: drag,
    snap, resize, rotate, marquee, keys, one undo step per gesture. `packages/core/src/ops/*.test.ts`.
  - The stress book (100 pages, 400 photos of 24 MP) opens in 0.4 s and every spread draws in
    under 0.2 s ([Measurements](#measurements)).
- [x] **G2. Never degrade a photo: originals are stored untouched and every export starts from
      them.**
  - `src/main/photos/import.test.ts`: "stores byte-identical originals", "does not touch the
    source file". `src/main/export/derivatives.test.ts`: "leaves the original untouched".
  - `e2e/packaged/scenario.spec.ts`: each of the twelve stored originals equals its source,
    byte for byte, in the packaged app.
  - `e2e/export-pdf.spec.ts` and `e2e/export-images.spec.ts`: "a missing original rejects": an
    export reads `originals/`, so it cannot be built from a preview.
- [x] **G3. Export a print PDF (trim size, bleed, optional crop marks) and per-page images at a
      chosen resolution. The page on screen and the exported page match.**
  - `e2e/export-pdf.spec.ts`: 216 × 303 mm pages with a 210 × 297 mm TrimBox; crop marks grow the
    MediaBox to 230 × 317 mm and leave the TrimBox alone; the flat cover; "every page matches the
    image route, within 2 % mean absolute difference" (measured 0.02 % to 0.41 %).
    `e2e/export-images.spec.ts`: 300 dpi, bleed, sRGB JPEG with its dpi, PNG, a one-pixel line on
    its pixel. `e2e/render.spec.ts`: thumbnail, preview and export draw the same spread.
    `docs/decisions/0001-export-fidelity.md`.
  - `e2e/packaged/scenario.spec.ts`: both routes from the packaged app (24 images and a flat
    cover sheet; a 24-page PDF with the right boxes, and a one-page cover PDF).
  - Manual, 2026-11-15: pages 2 and 3 of the stress book exported with both routes at 150 dpi
    and looked at beside the editor. Photos, stickers (the medal, the "A") and the caption sit at
    the same places on the screen, in the image and in the PDF page (rendered with `pdftoppm`);
    `pdfinfo -box` gives a 595.28 × 841.89 pt TrimBox (210 × 297 mm) inside a 612.28 × 858.90 pt
    page (216 × 303 mm).
- [x] **G4. A template library covering 1 to 6 photos per page, covers, and opening and chapter
      pages; any page can be saved as a new template.**
  - `scripts/build-templates.test.ts`: at least 129 templates, with the minimum counts per photo
    count (1 to 16), 30 covers, 10 openings, 6 text pages, 8 spreads and 3 themes; every template
    applies and lands its frames. The app ships 273.
  - `e2e/templates.spec.ts`: a 3-photo template, filters, spacing sliders, "Mise en page
    aléatoire", a page saved as a model and applied to the other page; covers and the front of the
    cover. `e2e/ipc.spec.ts`: user templates are saved, listed and deleted.
- [x] **G5. A sticker library of tens of thousands of items: bundled packs that work offline,
      online search without an account, and personal imports.**
  - `src/main/library/stickers/offline.test.ts`: "holds more than 20 000 stickers" (the built
    packs hold 51 272 in 23 sets), with a licence each, searched by French or English name.
    `e2e/stickers.spec.ts`: search "avion", place, tint, import `alpha.png`, drag onto the page,
    credits. `src/main/library/stickers/sources.test.ts`: the online sources with no key.
  - Manual, 2026-11-15, on the packaged app with the network on and no key: a live search finds
    45 icons on Iconify, 20 PNG stickers on Openverse and 20 drawings on Wikimedia Commons, each
    with its licence (CC-BY-4.0, CC-BY-SA-3.0 and public domain on the first hit). This check
    found that the Openverse photo source listed nothing for "sea" (Openverse gives no `filetype`
    for Flickr photographs); fixed in `c63f4e9` with a test.
- [x] **G6. Backgrounds: colour, gradient, pattern, texture, photo, per page or across a double
      page.**
  - `e2e/backgrounds.spec.ts`: a gradient on the left page, a photo across the spread (page
    backgrounds replaced), 95 bundled patterns and textures copied into the album with their
    licence, an imported image, a colour taken from the palette of the photos, removal.
    `packages/render/src/Background.test.tsx`.
  - `e2e/packaged/scenario.spec.ts`: a pattern on the right page, back after quit and reopen.
- [x] **G7. Text blocks with rich formatting, a bundled font set, and fonts added on demand.**
  - `e2e/text.spec.ts`: title, French spacing, font and size, the text tool, undo, a box that
    grows. `e2e/render.spec.ts`: "TextView lays text out like a mounted, non-focused Tiptap
    editor". `src/main/library/fonts.test.ts`: 41 OFL or Apache families with the French glyphs,
    the Fontsource catalogue. `e2e/fonts.spec.ts`: a user font joins the album.
  - Manual, 2026-11-15, on the packaged app: a live search of the Fontsource catalogue for
    "lato" finds the family, and adding it downloads 4 faces under OFL-1.1.
- [ ] **G8. Install from a `.deb` on Ubuntu and from an `.exe` on Windows 10/11.**
  - [x] The `.deb` builds (`npm run dist:linux`), its control file and its desktop entry are
        valid (`dpkg-deb -I`, `desktop-file-validate`), and the files it ships (the unpacked
        layout, `dist/linux-unpacked/`) pass `e2e/packaged/packaged.spec.ts` and the whole
        scenario: bundled fonts, stickers and templates are found, sharp loads from outside the
        asar, a book is made, exported and reopened.
  - [ ] `apt install ./travelbook_1.0.0_amd64.deb` on a clean Ubuntu, and the launcher entry
        opens the app. **Not run**: this task must not install the package. To do by hand once.
  - [ ] The `.exe` installs on Windows 10/11. **Not run**: there is no Windows machine here, and
        the installer is built by `.github/workflows/release.yml` on a version tag, which is not
        pushed without Corentin's go-ahead. To check on the first release.

## Anti-goals

None of these may happen. Each line is ticked when the test that would catch it passes.

- [x] **A photo is recompressed, downscaled or stripped of its data on import, or a print export
      is built from a preview instead of the original.** Import copies bytes
      (`src/main/photos/import.test.ts`, the scenario's byte comparison) and checks the copy by
      SHA-256; the exports open the original (`derivatives.test.ts`, "a missing original rejects"
      in both export specs).
- [x] **The exported page differs from the page on screen (text reflow, shifted elements, lost
      effects).** `e2e/export-pdf.spec.ts` compares every PDF page with the image route
      (under 2 %), `e2e/derivatives.spec.ts` the baked photo with its CSS look, `e2e/render.spec.ts`
      the three render qualities; the manual check under G3 looked at it.
- [x] **Any flexilivre code, template file, sticker, background, font or icon ends up in the
      repository or in the app.** `CLEANROOM.md` states the rules. `git grep -il flexilivre`
      lists only `CLEANROOM.md`, `README.md` and files of `docs/` (this one and
      `docs/reference/flexilivre-behaviour.md`, which records behaviour in our own words). Every
      file of `apps/desktop/resources/` carries `{source, author, licence, url}`, and
      `scripts/resources-licences.test.ts` fails for one that does not: the sticker packs
      (`offline.test.ts`), the fonts (`fonts.test.ts`: OFL or Apache, author, page), the patterns
      and textures (`scripts/build-backgrounds.test.ts`), and `resources/LICENCES.json` for the
      icons, the templates (generated by our own script, `scripts/build-templates.test.ts`: "are
      the committed files") and the lists.
- [x] **A project is lost or corrupted by a crash during save.** `src/main/project/store.test.ts`:
      the previous `book.json` is kept when the final rename fails, the temporary file is
      fsynced first and removed at the next open, concurrent saves stay valid.
      `e2e/project.spec.ts`: closing the window right after an edit saves it, and a close never
      waits for the cover thumbnail; an export stages in a hidden folder
      (`src/main/export/staging.test.ts`). `e2e/packaged/scenario.spec.ts`: reopening gives the
      same `book.json`, byte for byte.

## The scenario

`e2e/packaged/scenario.spec.ts`, on the packaged app, through the interface only (the packaged app
has no test handle), about 35 s:

1. a new book;
2. twelve photos imported, each original equal to its source;
3. templates on three spreads (four photos each: a page template with a caption line, a spread
   template, a mosaic on the right page), three different layouts, all twelve photos used;
4. the caption typed into the text frame;
5. a sticker;
6. a pattern on the right page;
7. the cover: a cover template, a photo, a title;
8. both exports (24 images and a cover sheet, a PDF of 24 pages and a one-page cover PDF);
9. quit by closing the window;
10. launch again, open the book from the recent list: what was made is on screen, the book main
    reads equals `book.json`, and `book.json` is byte for byte the file saved before quitting
    (the file holds no save time: its only timestamps are the capture times of the photos, which
    never change, so nothing needed to be ignored). Opening and closing did not rewrite it.

- [x] Passes: `npm run e2e:packaged`, 4 tests.

## Measurements

`npm run e2e:stress` (`e2e/stress/stress.spec.ts`, about 12 minutes once the fixture exists; the
first run also makes the 400 photos, 4 minutes, and the project) on the packaged app, one fresh
user-data folder per session, nothing else running.

**Fixture** (`tests/fixtures/make-stress-book.ts`, git-ignored under `tests/fixtures/out/stress/`):
400 generated JPEGs of 6000 × 4000 px (a quarter upright), 4.9 to 7.8 MB each, 2.6 GB, different
content and capture time each; imported by the app; 100 pages (the first, 49 spreads, the last),
four photos a page in 23 different four-photo templates, a text on every page (101 with the cover),
200 stickers (40 offline stickers cycled), `book.json` 784 kB.
Generated pictures are smoother than camera files, so decoding is, if anything, a little faster
than for real photos.

**Machine:** AMD Ryzen 5 3600 (6 cores, 12 threads), 15 GB RAM, SATA SSD, RTX 3060, Ubuntu 26.04.
Electron 45.3.2 (Chromium 156), window 1280 × 763 px at device ratio 1, 60 Hz screen.

**Method.** Times are wall clock around the user action, from the test. Memory is read from `/proc`
for the whole tree of Electron processes (main, editor renderer, GPU, utility, and the hidden
windows of an export): PSS in total (shared pages are not counted once per process), RSS for one
process; peaks are sampled every 250 ms (500 ms for exports) except the main process's, which is
its exact `VmHWM`. Frames are `requestAnimationFrame` timestamps in the editor between the press
and the release of the pointer, while the test moves the pointer 120 times a second along a path
that drifts 120 px; each drag must have moved what it grabbed. Main-thread and script time come
from DevTools `Performance.getMetrics`, processor time from `/proc/<pid>/stat`. A session works on
a copy of the project made of hard links, so the fixture is never written.

| What                                                                                   | Result                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import of 400 photos of 24 MP, from the picker to "400 photos" in the tray             | **57 s** (0.14 s a photo); peak 637 MB in all, 449 MB in main                                                                                                                                   |
| Time to open the project (click on "Ouvrir" to the editor, then to its pictures drawn) | **0.2 s**, then 0.4 s                                                                                                                                                                           |
| Time to show a spread of eight photos (strip click to pictures drawn)                  | 0.1 s                                                                                                                                                                                           |
| Frames a second dragging on a 6-photo spread (one photo, then every element selected)  | **60 and 60** (the screen's rate); 95th-percentile frame 16.8 ms, worst 16.8 ms, none over 33 ms; at rest also 60                                                                               |
| Room under that                                                                        | main thread 52 % and 50 % busy (scripts 21 % and 16 %), 1 % at rest; editor process 82 % and 75 % of a core, GPU process 66 % and 69 %                                                          |
| Browsing all 52 spreads, one after the other                                           | 89 ms a spread on average, worst 178 ms                                                                                                                                                         |
| Memory                                                                                 | at home screen 366 MB; project open 520 MB; after 13, 26 and all 52 spreads 821, 749 and 801 MB; 767 MB once collected; peak 867 MB (main 301 MB, editor 477 MB); JavaScript heap 20 MB at most |
| Overview (52 spreads at once)                                                          | 0.1 s to open, 2.7 s to scroll through, 798 MB                                                                                                                                                  |
| Export, 101 images at 300 dpi (JPEG 98, bleed; 100 pages and the cover sheet)          | **400 s** (4 s a page), 269 MB; peak 1798 MB in all, 584 MB in main, 1053 MB in the renderers (the editor and the export windows)                                                               |
| Export, print PDF of 25 pages                                                          | **38.8 s**, 85 MB; peak 1247 MB in all, **449 MB in main**                                                                                                                                      |
| Export, print PDF of the whole book (100 pages and the cover sheet, crop marks)        | **153 s**, 345 MB; peak 1446 MB in all, **954 MB in main**, 1094 MB in the renderers                                                                                                            |

The goal "above 30 frames a second while dragging on a 6-photo spread" holds with room: the
frame rate is that of the screen.

### Findings

- **Nothing was clearly off at 100 pages, so no code was changed for the measurements.** The photo
  tray mounts only the thumbnails in view (`e2e/photos.spec.ts`, "the tray mounts only the
  thumbnails in view"); the strip and the overview draw a spread's thumbnail once it is near the
  viewport and keep it, which bounds them to the 400 small thumbnails. Memory does not climb
  with the spreads visited: it stays between 750 and 820 MB through all 52, and the editor's
  JavaScript heap is 20 MB at most, so previews are released.
- **PDF memory grows with the page count.** In the main process the peak is 449 MB for 25 pages
  and 954 MB for 100, against 241 MB with the project open: the growth is 2.4 times the PDF for
  25 pages and 2.1 times for 100 (7 to 8 MB a page). This is the merge confirmed by the Phase 7
  review: `pdf-lib` holds every page, then writes the whole file into one buffer. About 1 GB at
  the largest book (100 pages) is fine on this machine; a 300-page book would want about 2.5 GB. Left as
  it is: a fix means a streaming PDF writer, which is a redesign.
- **The image route is 2.6 times slower than the PDF route** (400 s against 153 s for the same
  101 pages): every page is captured as a lossless PNG at 300 dpi and then written as JPEG, which
  is what decision 0001 chose to keep the page on screen and the page exported identical.
- **While dragging, the editor uses half of its frame budget** (50 % of the main thread at
  120 pointer events a second on a 6-photo spread of a 100-page book). It would be the first place
  to look on a slower machine; where the time goes was not profiled.
- **Import is fast because the proxies are made from a reduced decode**; the 400 originals are
  copied and checked by SHA-256 (2.6 GB) in the same 57 s.
- One defect was found by the live search of the online sources, not by the measurements, and
  fixed: the Openverse photo source dropped every hit without a `filetype`
  ([G5](#goals), commit `c63f4e9`).

Results of the last run are written to `tests/fixtures/out/stress/results.json` (git-ignored).
