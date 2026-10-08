---
name: contactsheet
description: Make numbered contact sheets of a folder (or several) of photos, so the work can be seen at a glance and picked by number. Use when the user says "contact sheet", "show me what's in this folder", wants to look through a shoot, or when /curate needs to see the work. Never changes the source files.
---

# Contact sheet

See a body of work at a glance: a grid of numbered thumbnails, plus a manifest
mapping each number to its file, so the user can say "7, 12 and 15".

The script is `scripts/contactsheet.mjs` (Node + `sharp`). Call it by its path
inside this skill folder.

## Rules

- **Never delete anything.** Not a photo, not a sidecar, not a folder, not
  even a duplicate, unless the user separately and explicitly asks for that
  specific deletion. This is people's archive and backup work. There's no
  culling here: picks are made on the sheet, never by removing files.
- **Source files are read-only.** The script never writes next to them and
  refuses an output folder inside a source folder. Don't move, rename, convert
  or delete anything in the source yourself either.
- The **one thing** a run adds to a source is a new folder,
  `contactsheet_YYYY-MM-DD` (ISO 8601; `-2`, `-3`… for more runs that day),
  holding the sheets. It never reuses or overwrites an existing folder, and
  later scans skip these folders.

## 1. Scan

If the archive has a `/scan` index (`scan.mjs status "<folder>"` finds it),
read it first: it already says what's in the folder and what changed, and
`scan.mjs show "<folder>"` gives the detail. Otherwise, or for the exact
raw-vs-export count of one folder:

```bash
node <skill>/scripts/contactsheet.mjs scan "<folder>" ["<folder>"...]
```

Per folder: totals by kind (image, heic, raw, video), raws with no exported
image, and each subfolder with `exported: true` when its name says it holds
picks (`_export`, `selection`, `final`, `edits`).

Tell the user in two or three lines what's there. Then decide the pool:

- **Exports exist:** use them; they're the photographer's own edited picks.
  Say which subfolders you'll use.
- **Raw only** (or raws with no export): ask. The options are (a) the user
  exports from Lightroom or Capture One, which keeps their edits, or (b)
  `--raw` previews, which ignore the edits and are fine for looking but
  not for publishing.
- Formats read: JPG, PNG, WebP, TIFF, AVIF, GIF; HEIC and raw via macOS `sips`.
  Video is counted, not shown.

## 2. Sheet

```bash
node <skill>/scripts/contactsheet.mjs sheet "<folder>"..."
```

Laid out like printed proofs on a white 3:4 page (`--paper a4|letter` to
print): images in rows that read left to right, 1 2 3 4 then 5 6 7 8, each
at its own shape and each row scaled to fill the width, the whole block
centred on the page.
Along each image's left edge, climbing upward in one size and colour:

    <shoot folder>   <number>   <filename.ext>
    Studio Visit      16      IMG_…4821.jpg

- The **folder** is the shoot the frame belongs to, skipping step folders
  like `_export`, `selection` or a lab roll number. It's cut at the end.
- The **number** always shows in full.
- The **filename** keeps its extension and is cut in the middle, keeping at
  least the last 4 characters, which identify a frame.
- Folder and filename share the space either side of the number; on a very
  short frame (a panorama) the folder gives way.

One footer line, centred under the images: source, frame range, page, date.

The sheets land in a new `contactsheet_YYYY-MM-DD/` inside the folder that
holds the photos (the deepest folder containing all of them, so a lab order
folder inside `Aug/` gets it, not `Aug/`). `--out <dir>` puts that dated folder elsewhere,
e.g. the scratchpad for a quick look, but never inside a source folder.

- Rows hold about 4 portrait frames, fewer landscapes; `--cols` changes that.
- Overview: the default `--max 20` samples evenly across the set.
- A whole shoot or roll: `--max all`; pages follow from how the frames fit.
  There's no limit: you decide what you can really look at. Say the page
  count first when it's a lot (about 16 frames a page).
- A big archive at a glance: `--sample` is a snapshot. It takes frames from
  every shoot, more from bigger ones: 1 from a handful, 2 around ten, 3 from
  a few dozen, 4–5 from hundreds, evenly spaced within it; `--max` caps the
  total, with every shoot giving up frames in proportion. A shoot is a folder minus its step folders (`_export`, `Digital`,
  lab rolls, `_my picks`). Its pool is its picks when it has export,
  selection, edits or picks folders. Otherwise it's its images, minus the
  camera JPEGs that sit next to their raws. The manifest records the
  `sampling`.
- `--list <file>`: exactly the files listed (one path per line), in that
  order, e.g. the picks of several curations side by side.
- `--depth 0` for one folder without its subfolders; `--name` to name it.
- `--exclude 000049,000050` leaves frames out (by file name, with or without
  extension): they aren't on the sheet or in the numbering, and the manifest
  lists them under `excluded`. The originals are untouched.

Output, about 350 KB per page each, in that folder:
Every file is named after its sheet folder, its colour and what it shows, so
each one makes sense on its own (emailed, printed, dropped in a chat). The id
is the folder plus the subject, e.g. `contactsheet_2026-10-08-3_2025-Aug`. The
subject is the folder's name, with its parent when the name is too short to
stand alone (`Aug` → `2025-Aug`); `--name` sets it.

- `contactsheetwhite_….pdf`: every page, with real (selectable) text. Best
  for marking up on a phone: Files › Markup, circle or cross out frames.
- `contactsheetwhite_…_p01.jpg…`: the same pages as images, for quick viewing.
- `contactsheetblack_….pdf`, `contactsheetblack_…_p01.jpg…`: the same sheet
  on black, with white text. Same layout, same numbers and places; nicer on a
  screen.
- `<id>.json`: the manifest (`frames[].n` → `path`).

`--format pdf|jpg` for only one of them (both colours either way).

## 3. Show

Look at each white JPG page yourself (Read the image; the black pages are the
same), then send the PDFs and the JPGs, white and black, to the user
(SendUserFile). Describe what you see in a few lines: the
shoots inside, the strongest frames by number, near-duplicates, anything that
looks mislabelled (another person's shoot in this folder). Don't comment on
or flag what the images depict; what's fine to show is the user's call.

## 4. Picks

The user chooses on the sheet itself, the way photographers always have:

- **Drawn on the sheet:** open the PDF on a phone or tablet (Files ›
  Markup), circle the keepers, cross out the rest, send back a screenshot
  or the marked-up PDF. Or print it and mark it with a pen.
- **Written:** "7, 12, 15", "not 3", or a handwritten list.

Read the marks, then **say which numbers you read as circled and crossed,
and confirm before acting.** For a marked-up page, match each mark to the
frame whose `place` box it overlaps (see the manifest) rather than reading
tiny rotated numbers.

Resolve numbers through the manifest, never by guessing filenames:

```bash
node <skill>/scripts/contactsheet.mjs pick "<id>.json" 7 12 15
```

The picks are what goes further: into `/curate`, a publishing tool, a print
order or a retouching list.

## The manifest

`<id>.json` is the sheet as data (with `id`, `subject` and `created`), for the next agent or step:

- `frames[]`: `n` (the printed number), `path` (the exact file), `kind`,
  `folder`, `ok` (rendered or not), `width`, `height`, `orientation`,
  `capturedAt` + `dateSource` (EXIF, else file date), and `place`: the page
  and box (x, y, w, h) where the frame sits.
- `units`, `scale`, `pageSize`: `place` is in points from the top-left; times
  `scale` gives JPG pixels.

Read it instead of rescanning a folder or looking at sheet images again: it's
cheaper and exact. Use it to sort or group frames (by date, orientation,
folder), to report failed frames, and to hand picked paths to the next step.

## Setup

`npm install` once in this skill's folder (needs Node 20+). HEIC and raw
previews use macOS `sips`; elsewhere they're skipped and reported.
