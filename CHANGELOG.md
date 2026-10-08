# Changelog

## 0.7.0 — 2026-10-08

- **Leave out, without deleting:** `curate.mjs leave-out <_curate folder>
  42 --why "2015, another shoot"` marks frames that don't belong (another
  shoot in the folder, a test, a broken file, a duplicate export). The file
  isn't touched; the frame leaves the effort's sets and article, `write` and
  `select` refuse it, and every later curation of that folder, or of a
  folder above or below it, starts with it left out (`open` lists it and
  puts it in the sheet's `--exclude`). `--undo` brings it back. The `/scan`
  map has a "Left out" section.
- **An `_export` folder is named after its shoot:** curations, sheets and
  scans of a folder called `_export`, `export`, `selects`, `final` and the
  like take the parent folder's name, so a curation reads
  `_curate_…_2019-05-04_studio-visit`, not `_curate_…__export`.
- `/contactsheet --exclude` takes file names with spaces in them.
- **No more section captions in the article:** each frame's catalogue
  caption and keywords already say what's in it, so the report's article
  draft, the plan and the PDF no longer have a plain caption per section.
  A caption in an older plan is ignored.
- Article PDF: the keywords under each image start where its edge text
  starts, not at the image, so the two line up.

## 0.6.0 — 2026-10-08

- **Keywords, for search like a phone's photos:** `/curate`'s catalogue now
  gives every frame `keywords` (lowercase, singular, English, specific to
  broad, so `land rover discovery` also says `suv`, `car`, `vehicle`) and
  `text` (the words you can read in the frame), in place of `tags`. Tags are
  left for the user to add by hand later. Older efforts' tags still count
  as keywords.
- **Exports carry them:** every file in `selection.json` has the frame's
  `caption`, `keywords` and `text`, ready for an upload to put into a CMS.
- **The article PDF is always made:** `write` with a plan that has an
  article now lays it out (A4) itself, so it's no longer a step that gets
  forgotten; `pdf` is for redoing it, e.g. on Letter. Each image has its
  keywords under it.
- **`/scan` finds what's been curated:** the map has a "Keywords" section
  (what the curated frames show, and where), and `scan.mjs find <folder>
  car [dusk]` lists every matching frame with its file, caption, curation
  and the selections it's in. It reads the curations' own files; it still
  never opens a photo.
- **Print quality:** contact sheet and article PDFs now embed images at 300
  ppi (JPEG quality 85), up from 216 ppi and 180 ppi (quality 80), so printed
  sheets aren't soft. PDFs are about twice the size; the JPG pages are
  unchanged.
- `/curate` and `/contactsheet`: an agent must confirm it actually sees each
  sheet page. A page that comes back without its image ("media removed") is
  read again or reported, never described.

## 0.5.0 — 2026-10-08

- **`/scan`**, a third skill: a map of an archive, however large, in one
  `_scan_YYYY-MM-DD` folder at its root (a `.md` to read, a `.json` for
  agents). Per folder: files by kind (images, HEIC, raw, video, design files,
  sidecars), size, file dates, exports, raw-only folders, catalogs, and the
  `_curate_…` efforts and contact sheets already there. The map shows where
  to look next and what's been curated. `status` checks it against the disk
  using only folder listings and says what changed; `update` rereads only
  changed folders and renames the folder to the new date; `note` keeps what a
  folder is across rescans; `show` gives one folder in detail. Never opens a
  photo. `/curate` and `/contactsheet` read it first when there is one.
- **Contact sheet file names say their colour:** `contactsheetwhite_…` and
  `contactsheetblack_…` (`.pdf`, `_p01.jpg…`). The folder and the manifest
  keep `contactsheet_…`.
- **Big folders can be reviewed instead of curated frame by frame.**
  `curate.mjs measure` reports a folder's size (frames, shoots, pages) and
  both ways in, writing nothing. The agent decides whether it can really
  look at everything; there's no fixed limit. If not, `open --review` opens a
  **review**. The review gets a scan snapshot inside its own folder and a
  sampled sheet. The report covers the archive: folder by folder, what's
  strong across it, what's done. It closes with three folders to curate next.
  `curate.mjs next` opens them on "go".
  New `references/review-template.md`.
- **One footer line on every sheet and article:** where the work is on the
  left, `/techistack` (a link to the repo) on the right, in the same size and
  colour. The report and scan map end with the same `/techistack` link.
- **Contact sheets read left to right:** justified rows, 1 2 3 4 then 5 6 7
  8, like printed proofs, instead of columns read top to bottom.
- `/contactsheet --sample`: a snapshot of a big archive. It takes frames
  from every shoot, more from bigger ones (1 from a handful, up to about 5
  from hundreds), from a shoot's picks when it has them. Evenly spaced
  within each shoot, not random, so a sheet can be made again.
- `/scan update --out <_curate folder>`: the scan as a snapshot inside a
  review. `status` finds the newest scan, the archive's own or a review's.
- `/contactsheet --list <file>`: a sheet of exactly the files listed, in
  order. A review uses it to sample a few frames per shoot across an archive.
- `/curate` no longer fails on an external drive's `._…` shadow files
  (macOS AppleDouble) next to its own `.json`.
- `/contactsheet` and `/curate` skip `_scan_…` folders.
- Docs and code comments use mock names only.

## 0.4.0 — 2026-10-08

- **Black contact sheets.** Every sheet now also comes on black, with white
  text: `<id>_black.pdf` and `<id>_black_p01.jpg…`, the same layout, numbers
  and places as the white one. The article PDF stays on white.
- `node test/smoke.mjs`: an end-to-end test of both skills on a generated
  archive, run by CI on macOS and Linux (Node 20 and 24).

Fixes from a wide test (formats, odd file names, broken files, 240 × 24 MP):

- Contact sheets: `--out` now always makes a new dated `contactsheet_…` folder
  inside the folder given. Before, a second run to the same `--out` folder
  overwrote the first sheet.
- Contact sheets: the footer shows the folder with your home as `~`, cut in
  the middle when it's long, instead of the full path (which ran off the page
  and showed your user name on shared sheets).
- Sheets and the article keep curly quotes and accented letters the standard
  PDF fonts can draw; file names keep them readable (`Stefan-Ana-nunta`, not
  `-tefan-Ana-nunt-`).
- At most a few images are converted at once, so a folder of HEICs no longer
  starts one `sips` process per photo.
- `--max`, `--cols`, `--depth`, `--size`, `--quality` and `--paper` are
  checked up front, with a plain error.
- `/curate select`: a broken or unreadable frame is listed as such instead of
  stopping the export halfway; bad options no longer leave an empty
  `selection_…` folder; a file name with spaces can be picked by name;
  transparent images export on white.
- Article PDF: a frame that can't be read is left out instead of failing the
  whole PDF; a long observation no longer leaves a blank page before it; the
  PDF's title and keywords keep any script.
- The report's "Made with techistack" line stays at the end after exports.
- sharp 0.35.5, which fixes a high-severity advisory in its bundled libvips,
  libheif and librsvg.

## 0.3.0 — 2026-10-08

- Every document techistack makes now carries a small "Made with techistack"
  credit linking to the GitHub repo, so people can find the tool: contact
  sheets (PDF and JPG), the article PDF and the curator's report. In the PDFs
  it's a clickable link.

## 0.2.1 — 2026-10-08

- `/contactsheet --exclude`: leave named frames out of a sheet. They don't
  appear in the numbering, and the manifest records them under `excluded`.
  `/curate` uses it when you say "leave these images out".
- Article PDF: image rows are balanced (4 images become 2 + 2, not 3 + 1) so no
  frame is blown up to the full page width.

## 0.2.0 — 2026-10-08

Beta. **Run it on a copy or a backup of a folder, not your only one.** It
never deletes or changes originals and only adds its own dated folders, but
it's young.

- `/curate` is rebuilt around a **curation folder**. Every run opens a new
  `_curate_YYYY-MM-DD` folder next to the work, holding its own contact sheet,
  the curator's report (`.md`), the same as data (`.json`) and an article PDF.
- **A curator with a voice** (`references/curator.md`): art running through
  them, talking to the audience, observing and deducing, opinionated, no
  superlatives. Swap it for your own.
- **The report** opens with a first impression and the story as the curator
  reads it, then a summary, recommended sets, open questions, an **article
  draft** (post title, sections with an observation, frames and a caption)
  and a **catalogue** of every frame (caption, people, objects, place, light,
  colour, mood, quality, tags) for search and for agents.
- **Article PDF** (`curate.mjs pdf`): text in a reading column, frames across
  the full page in justified rows with contact-sheet edge text, captions
  underneath. A4 or Letter, real text.
- **Exports** are separate and repeatable: each becomes its own `selection_…`
  folder, chosen by set, sheet number or file name, at a quality preset:
  `original` (untouched copies), `large`, `web` (2560 px) or `small`.
- No more content flagging: what's fine to show is the user's call.
- `/contactsheet`: square formats (6×6) are recognised and laid out in four
  columns; sheets made into a curation folder get their own `contactsheet_…`
  subfolder; `_curate_` folders are skipped when scanning, so prepared copies
  never show up as originals.

## 0.1.1 — 2026-10-08

- `/contactsheet`: every file is named after its sheet folder and what it
  shows, so a PDF, JPG or JSON sent on its own still says what it is:
  `contactsheet_2026-10-08-3_2025-Aug.pdf`, `…_p01.jpg`, `….json`. Short
  folder names get their parent (`Aug` → `2025-Aug`); `--name` sets it. The
  manifest gains `id`, `subject` and `created`.

## 0.1.0 — 2026-10-08

First public version. Beta: the recipe is still changing.

- `/contactsheet`: numbered proof sheets as PDF (selectable text, for markup)
  and JPG. Balanced columns on a 3:4 page (A4 and Letter for print); edge text
  with shoot folder, number and filename. A JSON manifest maps each number to
  its file, with size, orientation, capture date and position on the page.
  Writes a new `contactsheet_YYYY-MM-DD` folder next to the photos; never
  deletes or changes a source file.
- `/curate`: brief → survey → see → propose → record → publish → learn, with a
  portrait reference, genre starting points, and a `_context.md` writer that
  only ever replaces its own file.
