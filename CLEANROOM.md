# Clean-room rules

travelbook covers the same ground as existing online photo-book editors, but it is an
independent work. This file states what may and may not enter the code base.

## Allowed

- Using other editors as a normal user and writing down, in our own words, what they offer:
  tools, panels, what each action does, option lists. Such notes stay outside the repository.
- Drawing every sticker, background, template and illustration from scratch, and bundling or
  downloading third-party assets under an open licence.

## Not allowed

- Saving, reading, deobfuscating or reusing another editor's JavaScript, CSS, fonts, icons,
  stickers, backgrounds or template files.
- Tracing or copying another product's drawings or compositions.
- Committing another product's screenshots or assets to the repository.

## Consequence for the code base

No other editor's JavaScript, CSS, font, icon, sticker, background, template file or screenshot
enters the repository or the app. Every bundled or downloaded asset carries
`{source, author, licence, url}`.
