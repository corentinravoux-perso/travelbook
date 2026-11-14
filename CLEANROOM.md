# Clean-room rules

travelbook covers the same ground as the flexilivre online album editor, but it is an
independent work. This file states what may and may not be done when studying flexilivre.

## Purpose

A written inventory of what the flexilivre editor does, so that travelbook covers it and its
template set is at least as rich. The inventory lives in `docs/reference/flexilivre-behaviour.md`,
in our own words.

## Allowed

- Reading flexilivre's terms of use first, and recording the clauses that bear on this work.
- Using the editor as a normal user, in the owner's account, on a throwaway album.
- Screenshots and structure snapshots of the UI, kept outside the repository.
- Writing down behaviour in our own words: the tools, the panels, what each action does, how
  many templates exist per photo count and what kinds, the option lists (formats, fonts,
  categories of stickers and backgrounds).

## Not allowed

- Saving, reading, deobfuscating or reusing flexilivre JavaScript, CSS, fonts, icons, stickers,
  backgrounds or template files.
- Bulk or automated downloading, and any load beyond a person clicking through the editor.
- Ordering, paying, or touching the owner's real albums.
- Committing flexilivre screenshots or assets to the repository.

## Consequence for the code base

No flexilivre JavaScript, CSS, font, icon, sticker, background, template file or screenshot
enters the repository or the app. Every bundled or downloaded asset carries
`{source, author, licence, url}`.
