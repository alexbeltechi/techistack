# Changelog

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
