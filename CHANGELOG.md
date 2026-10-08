# Changelog

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
