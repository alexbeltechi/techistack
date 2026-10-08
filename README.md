# techistack

i'm [alex beltechi](https://beltechi.com). a product designer who codes, and a photographer with years of work sitting in folders nobody sees, including me.

agents are good at moving files and bad at taste. hand one an archive and say "post my best work" and you get slop: the first twenty files, near-duplicates, someone else's shoot that happened to be in the folder.

**techistack is my solution to help agents curate my work.** they look before they choose, they tell you what they see and why it matters, and nothing moves forward until you've picked.

> **beta: run it on a copy.** techistack never deletes or changes your originals, and it only ever adds its own new, dated folders. still, it's young. point it at a backup or a copy of a folder, not your only one, until you trust it.

**it never deletes anything.** this is people's archive and backup work. sources are read-only. the only things it adds are new `contactsheet_…` and `_curate_…` folders next to your work, and one `_scan_…` folder at the root of an archive you scan.

**you choose the way photographers always have.** every contact sheet comes as a PDF and JPG, on white and on black. circle the frames you want on your phone (Files › Markup), cross out the rest, or print it and use a pen. or just write the numbers: "7, 12, 15". your picks go further, into publishing, print, retouching or production.

**the curator has a voice.** someone with art running through them, talking to us, the audience, the way a good Nowness film sounds. they observe, then deduce what the work says about the life around it ("one stool, one bowl, water hung from a tree so it stays cool: someone who makes ordinary life work simply, and enjoys it"). opinionated, unhurried, no superlatives. it's a file, [`curator.md`](./skills/curate/references/curator.md): swap in your own.

**it's built for agents as much as for you.** every contact sheet has a JSON manifest: each printed number mapped to its exact file, with size, orientation, capture date and where it sits on the page. every curation has a report in markdown and the same as JSON, with a catalogue of every frame (caption, people, objects, place, light, colour, mood, the words you would search it by) and an article draft any CMS can turn into a post. the next agent reads that instead of looking at your pictures all over again.

fork it. make it yours.

## install

in Claude Code:

```
/plugin marketplace add alexbeltechi/techistack
/plugin install techistack@techistack
```

the skills are plain `SKILL.md` folders, so other agents that read skills can use them too: copy `skills/*` into your agent's skills folder.

`/contactsheet` and `/curate` run `npm install` once in their own folder (Node 20+; sharp, and pdf-lib for the PDFs). `/scan` is plain Node. HEIC and raw previews use macOS `sips`.

## skills

| skill | use it when |
|---|---|
| [`/scan`](./skills/scan/SKILL.md) | you have an archive, however big, and want an agent to know what's in it without looking at everything again. it writes a map into one `_scan_…` folder at the root: what's where, what's promising, what's curated, your notes on each folder. next time it checks the map against the disk first and tells you what changed, then only rereads that. |
| [`/contactsheet`](./skills/contactsheet/SKILL.md) | you want to see a folder at a glance. it creates a contact sheet of the images, numbered like film proofs, as a PDF you can mark up and a JPG, plus a manifest that maps every number to its file, so you or an agent can pick frames by number. |
| [`/curate`](./skills/curate/SKILL.md) | you want a curator to go through a body of work. it opens a curation folder with a contact sheet, its report (first impression, the story as it reads it, what to show, in what order and for whom, a catalogue of every frame) and an article PDF, then exports the frames you choose, at the quality you choose, into a selection folder ready for anything. |

```
/scan ~/Pictures
/contactsheet ~/Pictures/2024/road-trip
/curate ~/Pictures/2024/studio-visit
```

## how /curate works

every run is a new curation, a folder next to your work:

```
studio-visit/_curate_2026-10-08/
  _curate_2026-10-08_studio-visit.md     the curator's report: one file, everything in it
  _curate_2026-10-08_studio-visit.json   the same as data, for agents
  _curate_2026-10-08_studio-visit.pdf    the article: presentable, printable
  contactsheet_2026-10-08/               the contact sheet: contactsheetwhite_… and contactsheetblack_… (pdf, jpg pages), manifest
  selection_2026-10-08/                  an export, when you ask for one
  selection_2026-10-08-2/                another one
```

1. **brief:** what's it for, and who's it for? given just a folder, it assumes your own site or portfolio and says so.
2. **see:** a contact sheet of everything, made inside the curation folder: justified rows that read left to right, like printed proofs. (a big archive is reviewed first, below.)
3. **report:** in this order:
   - a **first impression**, in the curator's voice;
   - **the story, as it reads it**: observations and deductions from the pictures, names and dates, with guesses marked as guesses;
   - a **summary** you can reuse as a description;
   - what's here, observations, recommended **sets** (frames in order, why, what's left out) and open questions;
   - an **article draft**: a post title and sections, each with the curator's observation, its frames and a plain caption, ready for any CMS;
   - a **catalogue** of every frame, for search and for the next agent.
4. **article PDF:** title, date, summary, then each section: the observation in a reading column, the frames across the full page width with contact-sheet edge text, a caption underneath. A4 or Letter, real text, good for printing or reading aloud.
5. **stop.** it asks what you'd like exported.
6. **select:** say a set ("A as it is"), numbers, circles on the sheet or file names, and a quality: **original** (the files as they are), **large** (full resolution), **web** (2560 px, the default) or **small** (1200 px). each export is its own `selection_…` folder, as many as you like.
7. **learn:** your corrections go into `lessons.md` and override the defaults next time.

## when the archive is big

nobody can really look at 4,000 pictures, and techistack doesn't pretend to. there's no fixed limit: `curate.mjs measure <folder>` reports how big a folder is (frames, shoots, pages) and offers both ways in, and the agent decides what it can honestly look at. as models see more, that number rises on its own.

when it's too much for one sitting, the curation becomes a **review**:

1. **scan snapshot:** `/scan` counts what's there (files, sizes, exports, raws, what's already curated), without opening a photo. the snapshot is kept inside the review's own folder, so every review keeps the scan it was made from.
2. **sampled sheet:** a few frames from every shoot, more from bigger ones (1 from a handful, up to about 5 from hundreds), from its exports when it has them, evenly spaced and the same every run.
3. **a report on the archive:** a verdict per folder, what runs across the work, what's done, and **three folders to curate next**.
4. **you say go,** and `curate.mjs next` opens a curation for each of the three.

`/scan` on its own keeps one `_scan_…` folder at the archive's root, updated in place. next time it checks the map against the disk first and tells you what changed, then rereads only that.

genre guidance lives in [`skills/curate/references`](./skills/curate/references): portrait in depth, plus starting points for fashion, fine art, travel, design case studies, architecture and events.

## make it yours

- **your taste:** copy `skills/curate/lessons.example.md` to `lessons.md`. every time you correct the curator ("too many frames", "never open on a detail"), it adds a line. your lessons stay yours and aren't part of this repo.
- **your curator:** edit or replace [`curator.md`](./skills/curate/references/curator.md) to change who's writing.

## license

MIT
