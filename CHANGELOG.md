# Changelog

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
