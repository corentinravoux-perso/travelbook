# Visual-direction sketches (task 5.0)

Three static sketches of the full editor (spec §8) at 1440 × 900, for choosing a direction before
`tokens.css` and the shell are built. Each file is self-contained: inline CSS and SVG, no network
request, no image file (the photos are CSS gradients). Each one has a light/dark toggle (moon icon,
sets `data-theme` on `<html>`) and a notes panel (ⓘ icon) with its type scale, spacing scale,
colour roles, icon set, motion rules and trade-offs. The same details are in a comment at the top
of each file. The fonts named there are meant to be bundled later; the sketches fall back to
system fonts, so the type will look close to the intended faces but not identical.

```sh
xdg-open a-gris-neutre.html
xdg-open b-feuilles.html
xdg-open c-planche-contact.html
```

Add `#dark`, `#light` or `#notes` to the URL to open a sketch in that state.

**A. Gris neutre.** The workspace works like a booth for judging colour. The page sits on a
neutral mid-grey, as in ISO 3664 viewing conditions, and the chrome has no hue at all. Active
states invert contrast, the selection is a white-and-black double outline that shows on any photo,
and the guides use difference blending. The only colours in the interface are the three
resolution states. Panels are docked and separated by hairlines, the type is IBM Plex Sans at a
13 px base with tabular figures, and the icons are Tabler (outline, stroke 1.5). Mood: a
professional photo tool, quiet and exact. Trade-offs: it gives the page the most room and judges
colour most faithfully, but it is the most austere of the three. It can feel like work software
for what is a holiday album, and the black active states are heavy in the light theme.

**B. Feuilles.** A calm desk. The tools are loose sheets with rounded corners: rail and panel on
one, inspector on another, spreads on a third, laid around the book, which sits on the desk with
a soft shadow and a hint of a fold. There are two voices: Source Serif 4 for everything that
belongs to the book (its title, page numbers, captions) and Source Sans 3 for the tool. A single
ink-blue accent marks the selection and Exporter. The inspector speaks in words and sliders
("Qualité d'impression acceptable", with what to do about it) and folds the mm values away. The
photo panel keeps each photo's aspect ratio. Icons are Phosphor Light. Mood: welcoming, a little
literary. Trade-offs: it is the friendliest and makes the book look most like a book. But the
gaps and sheets take space, so the page is the smallest of the three, and precise placement means
one more click to unfold the numbers.

**C. Planche contact.** The book is a sequence, so the sequence gets the stage. The spreads strip
is a tall contact sheet grouped by chapter (one per day), with large condensed page numbers. The
Photos panel is a drawer that slides over the canvas instead of squeezing it, and it shows where
each photo is used ("p. 5, 9"). The selection carries a floating action bar, so the inspector stays
slim; it also previews a row of looks ("Naturel", "Doux", "N&B"). The chrome is neutral, and the
one accent is taken from the photos of the spread in view. Its hue changes but its lightness and
chroma stay fixed (oklch), so contrast never changes. Click another spread in the strip to see
the accent change (in this sketch the canvas itself stays on pages 4–5). Type is Barlow Semi Condensed, icons are Solar Bold Duotone, and the active icon's second tone
takes the accent. Mood: an editor's light table, focused on the whole book. Trade-offs: it gives
the most overview and keeps a large page, but the open drawer covers part of the canvas. The
changing accent may distract some people, so it may need a setting to fix the hue. Condensed type
is also less comfortable for long reading.

All three show the same content: *Islande 2026*, pages 4–5. The selected photo has its handles
and a resolution badge (212 ppp, acceptable), the bleed, safe-margin and gutter guides are on, and
the Photos panel marks used and unused photos. The icons are hand-drawn approximations of each
named set; the app will load the real ones from `@iconify-json`.
