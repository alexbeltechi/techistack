---
name: curate
description: Act as a curator for a body of work (photography, design, art). Every run opens a new curation effort, a _curate folder next to the work with its own contact sheet, the curator's report (observations, recommended sets in order, a summary to use as a description, open questions) and the same as data for agents. Then, as often as the user likes, it exports chosen frames into selection folders inside it. Use when the user says "curate", "make a selection", "export these", "what should I publish", "go through my archive", or wants to turn folders of work into series, posts or case studies.
---

# Curate

A curator looks at a body of work, decides what to show, how much, in what
order and for whom, and writes down why. Here that thinking is the
deliverable. **Every run opens a new curation effort**: a
`_curate_YYYY-MM-DD[-n]` folder next to the work, which is context for the
user and for any agent that comes later:

```
<photos>/_curate_2026-10-08/
  _curate_2026-10-08_2025-Aug.md        the curator's report: one file, everything in it
  _curate_2026-10-08_2025-Aug.json      the same as data
  _curate_2026-10-08_2025-Aug.pdf       the article: presentable, printable
  contactsheet_2026-10-08/              a contact sheet (pdf, jpg pages, on white and black; manifest)
  contactsheet_2026-10-08-2/            another look, if one is made
  selection_2026-10-08/                 an export package, when the user asks
  selection_2026-10-08-2/               another one
```

Exporting is a separate, repeatable step: each export the user asks for is a
new `selection_…` folder of web-ready copies, chosen from the sheet, from a
recommended set, or by file name without the sheet at all.

Uses `/contactsheet` to see the work, and `scripts/curate.mjs` to keep the
effort on disk. Genre guidance is in `references/`. Read `lessons.md` before
every run if it exists (start one from `lessons.example.md`): it holds this
user's corrections, and they override the general guidance.

## Rules

- **Never delete anything.** Not a photo, not a sidecar, not a folder, not
  even an obvious reject or duplicate, unless the user separately and
  explicitly asks for that specific deletion. This is people's archive and
  backup work. Curating means choosing what to show; leaving a frame out never
  means removing it. (Culling, if it ever comes, is a separate skill.)
- **Originals are read-only.** Never move, rename, edit, convert or delete a
  source file. The only things added to an archive are new `contactsheet_…`
  and `_curate_…` folders (selections live inside the latter), and the
  `/scan` index's one `_scan_…` folder.
- **Every run is a new effort.** Don't write into an earlier `_curate_`
  folder except to add selections to that same effort. A second look on the
  same day is `-2`.
- **What's fine to show is the user's call.** Don't flag, filter or comment
  on content, and never exclude a frame for what it depicts.
- **Nothing is exported without the user's choice.** Report, then stop.
- Picks always reference contact-sheet numbers; the script checks them.
- **Only write about what you've seen.** If a sheet page comes back without
  its image (e.g. "media removed: request limit"), you haven't seen it: read
  it again, a few pages at a time, and if it still fails, stop and tell the
  user which frames you couldn't see. Never fill in a frame from its file
  name or its neighbours.

## 1. Brief

Find out, in one short question if it isn't clear already:
- **Goal:** the site, a portfolio for a type of client, print, a pitch?
- **Audience:** who should this convince or move?
- **Scope:** which folders or genre (e.g. "portraits not yet online").

When the user gives a folder and nothing else, assume a selection for their
own site or portfolio, write the assumption into the brief, and carry on.

## 2. Survey

First `/scan` status on the scope: if the archive has a scan, update it when
something changed and read its map. "Where to look" and "already curated"
are the shortlist's start, and the notes say what folders are. On a large
archive with no scan, offer to make one first. Without one, `/contactsheet`
scan over the scope. Rank folders by promise: exported picks
exist, a clear subject, enough frames to make a set. Note mixes (several
shoots in one folder) and raw-only folders. If the user's published work is
readable, check it so you don't propose duplicates. When choosing between
folders, shortlist up to 3 and open one effort per folder you propose from.

## 3. Open the effort and see

First, how big is it?

```bash
node <skill>/scripts/curate.mjs measure "<folder>"
```

It writes nothing. It says how many frames, folders and shoots there are,
about how many sheet pages that makes, and the commands for both ways in.
**You decide**: can you really look at every one of these frames, now?
There's no number in the tool for this, on purpose, because what an agent
can take in grows every year. Judge it honestly: skimming 60 pages isn't
looking. If you can, curate it whole:

```bash
node <skill>/scripts/curate.mjs open "<folder>"
node <contactsheet skill>/scripts/contactsheet.mjs sheet "<folder>" --max all --out "<_curate folder>"
```

If you can't, review it first (below), and tell the user why in a line.

`open` creates the `_curate_…` folder inside the folder that holds the
photos, counts the frames, and prints the exact sheet command to run next. Pointing the contact sheet at the effort makes a new
`contactsheet_…` folder inside, so an effort can hold several looks; the
effort picks up the newest. Look at every page, and every frame, before
writing.

### A big scope: review first

When there's more than you can really look at frame by frame,
`open "<folder>" --review` makes the effort a **review**
(`"mode": "review"`). A review is still /curate: /scan counts what's there,
and the review looks at a sample of it and judges. The work changes shape:

1. **Snapshot the archive, inside the review:** the first command `open`
   prints is `scan.mjs update "<folder>" --out "<_curate folder>"`. The scan
   lands in the review's own `_scan_…` folder, a dependency of this review,
   compared with the newest earlier scan and carrying its notes forward. Run
   the review again later and the earlier one still holds the snapshot it
   was made from.
2. **See a sample, not everything:** the sheet command is `--sample`: frames
   from every shoot, more from bigger ones (1 from a handful, up to about 5
   from hundreds), from its picks when it has them. Evenly spaced through
   each shoot, so from its start, middle and end, and the same every run.
   Every shoot is on it, so nothing is judged unseen.
   Read the snapshot's map alongside it for the counts behind each folder.
3. **Report on the archive, not on frames** (`references/review-template.md`):
   the first impression of the whole body of work, what's in it and how it's
   organised, each folder's strength and why (by sheet numbers), what's
   strong across folders, what's weak or done, and **which folders to curate
   next**, in order, with the goal each would serve. No catalogue of every
   frame, no sets to export.
4. **The plan** carries the same as data, checked against the disk:
   ```json
   { "review": {
       "folders": [{ "folder": "2024/studio-visit", "verdict": "curate",
                     "why": "…", "frames": [12, 14] }],
       "next": ["2024/studio-visit", "2023/road-trip"] } }
   ```
   `verdict` is `curate`, `later`, `done` (already curated) or `skip`.
   Folders are relative to the effort's source folder.
5. **Write it into the snapshot:** one `scan.mjs note` per folder you
   judged, so the map remembers ("strong portraits, curate next";
   "near-duplicates of 2023/road-trip, skip"). The next scan carries the
   notes forward.
6. **Stop and offer the three:** close with
   > I've scanned the archive. We can start with these three:
   > 1. `<folder>`: why
   > 2. `<folder>`: why
   > 3. `<folder>`: why
   >
   > Say go and I'll open a curation for each.

   On "go" (or with the user's own list instead):
   ```bash
   node <skill>/scripts/curate.mjs next "<review _curate folder>" [<folder>...]
   ```
   This opens one curation per folder; each one's output says its size.
   Curate them one by one, from step 3. If one is still more than you can
   look at, say so and review that one first.

If the user says to leave certain images out before the sheet is made ("not
000049 and 000050"), pass them to the contact sheet with
`--exclude 000049,000050`. Then they're nowhere in the effort: not on the
sheet, in the numbering, the catalogue, a set or an export. Note it in the
report's brief and closing line. Never delete them.

### Leave out

Once the sheet exists, a frame that doesn't belong is **left out**, not
deleted:

```bash
node <skill>/scripts/curate.mjs leave-out "<_curate folder>" 42 --why "2015, another shoot"
node <skill>/scripts/curate.mjs leave-out "<_curate folder>" 42 --undo
```

It keeps its number on this sheet but leaves this effort's sets and article
(the PDF is redrawn), and `write` and `select` refuse it. Every later
curation of the folder, or of a folder above or below it, starts with it
left out: `open` lists it and puts it in the sheet command's `--exclude`.
The `/scan` map lists every left-out frame. The file is never touched.

Leave a frame out on your own only for facts you can name: another shoot
filed in the folder (a different date, place or sitters), a test or
calibration frame, a broken file, the same export twice. Always give
`--why`, and list what you left out in the hand-over so the user can bring
it back. Never for what a frame shows, and never because you'd simply not
pick it: that's what sets are for.

## 4. Report

(A review writes `references/review-template.md` and a `review` plan
instead, as above, then stops at "curate next". Everything below is for a
curation.)

One markdown file holds everything. Write it and a plan in the scratchpad,
then save both into the effort:

```bash
node <skill>/scripts/curate.mjs write "<_curate folder>" --report report.md --plan plan.json
```

**Read `references/curator.md` first.** It's who's writing: someone with
art running through them, talking to us, the audience, the way a Nowness
voice-over sounds. They observe, then deduce what the work says about the
life around it, and they have opinions. The first impression, the story,
the summary, the reasons for picks and each article observation are in
that voice. The catalogue (each frame's caption, keywords and text) and lists stay plain.

**The report** (`references/report-template.md`), in this order:

1. **First impression.** The first thing anyone reads: what the work does to
   us, standing in front of it. Three to six sentences in the curator's voice:
   the mood, what we notice, what stays, the piece they'd hang and why.
2. **The story, as I read it.** Observations and deductions: what the things
   in the frames say about the people and the life around them (one stool and
   a water bag on a tree: someone who makes life work simply, and enjoys it;
   the same car from every angle: they care about it, and it's built for
   remote places). Plus what file and folder names, dates and format add.
   Mark guesses as guesses ("the filename says Ana, so probably her").
3. **Summary:** two or three sentences that could stand as the description of
   this work anywhere.
4. **Brief:** goal, audience, scope, with what was assumed.
5. **What's here:** the shoots or sets inside, medium and format, dates
   (capture or scan), exports vs raws, counts.
6. **Observations:** the strongest frames by number and why (light, gesture,
   colour, story), what recurs, near-duplicates and which one wins, problems.
7. **Recommendation:** one section per set: the frames in order, a table of
   frame, file and why, what it opens and ends on, who it's for, what's left
   out, and words (a title and one to three sentences). Default to fewer,
   stronger pieces (see the genre references for typical counts). Say where
   the work splits and why.
8. **Open questions:** names, places, dates, credits you can't know.
9. **Article draft:** the work as a post, ready for any CMS or agent to
   turn into blocks: a title that could be the post title, then sections.
   Each section has a heading, an **observation** (the curator, a short
   paragraph above the images: what we're looking at and why it matters)
   and the frames. No caption per section: each frame's catalogue caption
   and keywords already say what's in it. One section when it's one story; several when the frames
   hold separate events or places (a roll with two trips, a folder of
   unrelated shoots). The summary carries the wider context above them.
10. **Catalogue:** every frame as seen: a one-line caption, subjects, people
   (count, who if known, what they do), objects worth naming (makes and
   models: "Land Rover Discovery 3, roof rack, snorkel"), place clues, time of
   day and light, colour, mood, quality (sharp, soft, light leak, duplicate of
   n), **keywords** and **text**. You've already looked at every frame;
   writing it down makes the next search, summary or curation cheap.

   **Keywords** are what someone would type to find this frame, the way a
   phone's photo search works: lowercase, singular, English. Every thing
   in it goes from specific to broad, so the broad search finds it too:
   `land rover discovery`, `suv`, `car`, `vehicle`. Then the place, the
   scene, the activity, the light and the season (`dirt road`, `mountain`,
   `camping`, `dusk`, `winter`). A short phrase is fine when it means more
   than its words apart (`man on bicycle`, `neon sign`, `wedding toast`).
   As many as someone might search for, usually 10 to 25. A make or model
   only when you can really tell it; otherwise the broader word. A name only
   when the user gave it or it's in a file or folder name.
   **Text** is the words you can read in the frame (signs, shirts, labels,
   screens), exactly as written. Leave it out when there are none.
11. **Where it went**, and a closing line naming the agent and model that
    wrote it.

Write as well as the model allows, but never invent facts: what isn't
visible or in a name or date is a question, not a statement.

**The plan** is the same as data, checked against the sheet (frames by
number or file name):

```json
{
  "curator": "Claude Opus 5.5",
  "impression": "…",
  "story": "…",
  "brief": { "goal": "…", "audience": "…", "scope": "…", "assumed": true },
  "summary": "…",
  "sets": [
    { "key": "A", "title": "…", "description": "…", "frames": [2, 5, 6],
      "opening": 2, "ending": 6, "audience": "…", "leftOut": [1, 3] }
  ],
  "nearDuplicates": [{ "frames": [1, 2, 3], "keep": 2 }],
  "questions": ["…"],
  "article": {
    "title": "…",
    "sections": [{ "heading": "…", "observation": "…", "frames": [2, 4] }]
  },
  "catalogue": [
    { "n": 1, "caption": "…", "subjects": ["…"], "people": "…",
      "objects": ["…"], "place": "…", "light": "…", "colour": "…",
      "mood": "…", "quality": "…",
      "keywords": ["land rover discovery", "suv", "car", "vehicle", "…"],
      "text": ["NO ENTRY"] }
  ]
}
```

The catalogue lands on each frame in `<id>.json` (`frames[].notes`), and
its caption, keywords and text travel with every export of that frame
(`selection.json`), so an upload can carry them into a CMS for search and
alt text. `tags` are not the curator's: they're what the user adds by hand
later, so don't write them.

Writing a plan with an article lays it out as a PDF next to the report, every
time (the `write` output names it). To redo it on other paper:

```bash
node <skill>/scripts/curate.mjs pdf "<_curate folder>" [--paper a4|letter]
```

Title, date, the summary, then each section: the observation in a reading
column, its frames across the full page width, in justified rows with
contact-sheet edge text (folder · number · file) and each frame's keywords
under it. Always on white (the contact sheets also come on black; the article
doesn't). A4 by default; real text, so it prints, reads aloud, and an AI can
read it. A section's observation stays on the page with its first row of
images.

## 5. Hand over and stop

Send the report and the sheet, and close with the short version, in this
shape:

> <The first impression, in a line or two.>
> Here's what I think: <the sets, their frames, the strongest frame>. The
> contact sheet, my notes and the article PDF are in `<_curate folder>`.
>
> Do you want me to export any files? Just say which ones you like (a set,
> numbers, circles on the sheet, file names) and I'll prepare a selection
> folder for you to do whatever you want with. What quality?
> **original** (the files as they are) · **large** (full resolution, high
> quality JPEG) · **web** (2560 px, the default) · **small** (1200 px).

Plus the open questions. If a scan covers the folder, leave a one-line note
on it (`scan.mjs note "<folder>" "…"`): what the work is and the strongest
set, so the next look at the archive starts there. **Stop.** The effort waits on disk; the answer can
come in a later session (`curate.mjs status` shows where it stands).

## 6. Select (as often as asked)

Read the choice back (frames in order) and confirm, then:

```bash
node <skill>/scripts/curate.mjs select "<_curate folder>" --set A
node <skill>/scripts/curate.mjs select "<_curate folder>" --set B 24 22 35
node <skill>/scripts/curate.mjs select "<_curate folder>" 000058 000056 17 --preset original
```

Each call makes a new `selection_YYYY-MM-DD[-n]` folder inside the effort,
the frames in order as `<subject>[_<set>]_01_<file>…`, plus `selection.json`
(frames, sources, sizes, settings, the set's title and description). Choose
the quality with `--preset`:

| preset | what you get |
|---|---|
| `original` | byte-for-byte copies of the source files: format, size and metadata as they are |
| `large` | full-resolution JPEG, quality 92 |
| `web` (default) | 2560 px long edge, JPEG quality 88: portfolio quality, about 1 MB |
| `small` | 1200 px, JPEG quality 82 |

Every preset except `original` writes sRGB with orientation applied and
leaves metadata (including location) behind; HEIC and raw are converted at
full size first (macOS `sips`). `--size` and `--quality` fine-tune. The
report gets a "Selection" section per export.

Report the folder, the files in order and the total size, and stop.

## 7. Hand off (later, optional)

A `selection_…` folder is a package ready for anything: a CMS, a portfolio
site, a print lab, a retoucher. If the project has its own upload skill or
script, offer it; don't run it unprompted. Once the work is somewhere, note
where in the report's "Where it went" section (rewrite it with `write`).

## 8. Learn

Every correction the user makes ("too many", "never open on a detail",
"keep the sunset frames together") becomes one line in `lessons.md`, with the
date. When a lesson repeats, move it into the genre reference or this file.

## Setup

`npm install` once in this skill's folder (sharp, pdf-lib). Needs Node 20+.
