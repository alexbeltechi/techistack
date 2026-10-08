---
name: scan
description: Index an archive of creative work, however large, and keep the index up to date, so an agent knows what's where, what's promising, what's been curated and what changed since last time, without looking at every file again. One _scan folder at the archive's root, updated in place. Use when the user says "scan", "index", "what's in my archive", "what changed", "what haven't I curated", "find my photos of …" (search curated frames by keyword), before /curate or /contactsheet on a big or unfamiliar folder, and at the start of any work on an archive that may already have a scan. Never opens or changes a photo.
---

# Scan

An archive is years of folders. Looking at all of it every time is slow, and
on a large one impossible. A scan is the map: every folder with its counts,
sizes, file dates, exports, raws and what techistack already made there,
plus notes on what each folder is. The next agent reads the map first and
only looks where it matters.

The script is `scripts/scan.mjs` (Node 20+, no dependencies). Call it by its
path inside this skill folder.

## Rules

- **Never delete, move or change anything in the archive.** The scan only
  lists folders and reads file sizes and dates; it never opens a photo.
- The **one thing** it adds is a `_scan_YYYY-MM-DD` folder at the root of
  what was scanned. It's the only folder techistack updates in place: a
  rescan renames it to the new date and replaces the two index files
  inside it. Nothing else in it is touched.
- **For a /curate review it's a snapshot instead:** `update --out
  "<_curate folder>"` writes the scan inside that review, as part of it.
  The archive itself stays clean, and every review keeps the scan it was
  made from. `status` and the next update find the newest scan wherever it
  is, the archive's own or a review's, and compare with that.
- One scan per archive. A scan covers every folder below it, so scanning a
  subfolder of a scanned archive updates the archive's scan.
- The index lives with the archive, on the user's own disk. It holds their
  folder names and notes. Don't copy it anywhere else.

## 1. Check first

At the start of any work on an archive, before scanning or looking:

```bash
node <skill>/scripts/scan.mjs status "<folder>"
```

It finds the scan in that folder or the nearest one above it, and checks
it against the disk. This only reads folder listings, so it's quick even on a
large archive. It returns when the scan was made (`ageDays`), whether it's
`fresh`, and what's `changed` (counts per kind), `added` and `gone` under
that folder, plus how many changes are `elsewhere` in the archive.

Tell the user in a line or two: *"Scanned 12 days ago. Since then: 40 new
exports in 2024/studio-visit/export, a new folder 2025/road-trip. Everything
else is as it was."* Then update (step 2) when anything changed, or go straight
to reading the map (step 3) when it's fresh.

`"scan": null` means there isn't one yet: offer to make it. On a big
archive, say it'll take a while the first time (every file's size and date
is read once) and that later updates only read what changed.

## 2. Scan, or update

```bash
node <skill>/scripts/scan.mjs update "<folder>" [--name <subject>]
```

The first run reads everything. Later runs read only folders whose listing
or date changed and keep every other folder's record as it was, so an update
of a large archive takes seconds. `--fresh` reads everything again (e.g.
when files were replaced in place under the same names). Progress goes to
stderr every few seconds on long runs.

Skipped and listed, never walked: hidden files, techistack's own folders
(`_curate_…`, `contactsheet_…`, `selection_…`, `_scan_…`) and app libraries
such as Lightroom previews (`.lrdata`) or a Photos library: they hold copies,
not the work. Catalog files are listed so you know they're there.

Inside the scan folder:

```
Archive/_scan_2026-10-08/
  _scan_2026-10-08_Archive.md     the map, to read
  _scan_2026-10-08_Archive.json   every folder's facts, for agents and rescans
```

## 3. Read the map

Read the `.md`. It's sized to read whole on any archive:

- totals: files by kind (images, HEIC, raw, video, design files, sidecars,
  other), size, file dates;
- **since the last scan**: new, changed and gone folders;
- **where to look**: folders with photos of their own that haven't been
  curated, exports first, then the most images;
- **already curated**: every `_curate_…` effort, with its status and
  selections;
- **keywords**: what the curated frames show (`car`, `portrait`, `dusk`),
  the most frames first, and in which folders. They come from each
  curation's catalogue, so only curated work has them;
- **raw only**: folders with raws and nothing viewable yet;
- **folders**: the tree, as deep as fits, each folder in one line with the
  user's note;
- **not looked into**: catalogs, app libraries, unreadable folders.

File dates are when files were last written (often an export or a copy),
not when the photos were taken. Say so if you use them; the contact sheet's
manifest has capture dates.

For one folder in detail, without reading the whole `.json`:

```bash
node <skill>/scripts/scan.mjs show "<folder>" [--depth 2]
```

## 4. Notes: what a folder is

The counts say how much; only looking says what. When you or the user learn
what a folder is (from its contact sheet, a curation, or the user saying
so), write it down so the next agent doesn't have to look again:

```bash
node <skill>/scripts/scan.mjs note "<folder>" "2025 product campaign, studio, strong exports"
node <skill>/scripts/scan.mjs note "<folder>" ""     # removes it
```

Notes are kept across rescans. A note on a folder that's since gone stays,
marked as such. Write what helps choose: subject, client or occasion, year,
medium, quality, and anything the user said ("skip, bad shoot"; "not to
publish before March"). A note doesn't change the scan's date.

## 5. Find: search what's been curated

Like a phone's photo search, over everything /curate has looked at:

```bash
node <skill>/scripts/scan.mjs find "<folder>" car
node <skill>/scripts/scan.mjs find "<folder>" car dusk      # both
node <skill>/scripts/scan.mjs find "<folder>" "neon sign"
```

Each word (or phrase) must be in a frame's keywords, caption or readable
text, as a whole word; `cars` finds `car`. It lists every matching frame
with its file, folder, caption, keywords, the curation it's from and any
selection it was exported in, so an agent can pick frames for a post or an
upload straight from it. It reads the curations' own files, so new
keywords show up at once; a curation made since the last scan needs an
`update` first. Frames that were never curated have no keywords: curate
the folder to make them findable.

## 6. Hand over

Say what's there in a few lines, the way a studio manager would: how big,
how it's organised, what's promising, what's done, what changed. Then offer
the next step: `/contactsheet` on a folder to see it, or `/curate` on one
from "where to look".

`/curate` and `/contactsheet` check for a scan first and use it instead of
walking the folder again.

## Setup

Nothing to install: plain Node 20+.
