# techistack

i'm [alex beltechi](https://beltechi.com). a product designer who codes, and a photographer with years of work sitting in folders nobody sees, including me.

agents are good at moving files and bad at taste. hand one an archive and say "post my best work" and you get slop: the first twenty files, near-duplicates, someone else's shoot that happened to be in the folder.

**techistack is my solution to help agents curate my work.** they look before they choose, they tell you what they see and why it matters, and nothing moves forward until you've picked.

> **beta: run it on a copy.** techistack never deletes or changes your originals, and it only ever adds its own new, dated folders. still, it's young. point it at a backup or a copy of a folder, not your only one, until you trust it.

**it never deletes anything.** this is people's archive and backup work. sources are read-only. the only things it adds are new `contactsheet_…` and `_curate_…` folders next to your work.

**you choose the way photographers always have.** every contact sheet comes as a PDF and JPG. circle the frames you want on your phone (Files › Markup), cross out the rest, or print it and use a pen. or just write the numbers: "7, 12, 15". your picks go further, into publishing, print, retouching or production.

**the curator has a voice.** someone with art running through them, talking to us, the audience, the way a good Nowness film sounds. they observe, then deduce what the work says about the life around it ("one stool, one bowl, water hung from a tree so it stays cool: someone who makes ordinary life work simply, and enjoys it"). opinionated, unhurried, no superlatives. it's a file, [`curator.md`](./skills/curate/references/curator.md): swap in your own.

**it's built for agents as much as for you.** every contact sheet has a JSON manifest: each printed number mapped to its exact file, with size, orientation, capture date and where it sits on the page. every curation has a report in markdown and the same as JSON, with a catalogue of every frame (caption, people, objects, place, light, colour, mood, tags) and an article draft any CMS can turn into a post. the next agent reads that instead of looking at your pictures all over again.

fork it. make it yours.

## install

in Claude Code:

```
/plugin marketplace add alexbeltechi/techistack
/plugin install techistack@techistack
```

the skills are plain `SKILL.md` folders, so other agents that read skills can use them too: copy `skills/*` into your agent's skills folder.

each skill runs `npm install` once in its own folder (Node 20+; sharp, and pdf-lib for the PDFs). HEIC and raw previews use macOS `sips`.

## skills

| skill | use it when |
|---|---|
| [`/contactsheet`](./skills/contactsheet/SKILL.md) | you want to see a folder at a glance. it creates a contact sheet of the images, numbered like film proofs, as a PDF you can mark up and a JPG, plus a manifest that maps every number to its file, so you or an agent can pick frames by number. |
| [`/curate`](./skills/curate/SKILL.md) | you want a curator to go through a body of work. it opens a curation folder with a contact sheet, its report (first impression, the story as it reads it, what to show, in what order and for whom, a catalogue of every frame) and an article PDF, then exports the frames you choose, at the quality you choose, into a selection folder ready for anything. |

```
/contactsheet ~/Pictures/2025/Colombia
/curate ~/Pictures/2025/kitra
```

## how /curate works

every run is a new curation, a folder next to your work:

```
kitra/_curate_2026-10-08/
  _curate_2026-10-08_kitra.md      the curator's report: one file, everything in it
  _curate_2026-10-08_kitra.json    the same as data, for agents
  _curate_2026-10-08_kitra.pdf     the article: presentable, printable
  contactsheet_2026-10-08/         the contact sheet (pdf, jpg pages, manifest)
  selection_2026-10-08/            an export, when you ask for one
  selection_2026-10-08-2/          another one
```

1. **brief:** what's it for, and who's it for? given just a folder, it assumes your own site or portfolio and says so.
2. **see:** a contact sheet of everything, made inside the curation folder.
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

genre guidance lives in [`skills/curate/references`](./skills/curate/references): portrait in depth, plus starting points for fashion, fine art, travel, design case studies, architecture and events.

## make it yours

- **your taste:** copy `skills/curate/lessons.example.md` to `lessons.md`. every time you correct the curator ("too many frames", "never open on a detail"), it adds a line. your lessons stay yours and aren't part of this repo.
- **your curator:** edit or replace [`curator.md`](./skills/curate/references/curator.md) to change who's writing.

## license

MIT
