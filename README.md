# techistack

i'm [alex beltechi](https://beltechi.com). a product designer who codes, and a photographer with years of work sitting in folders nobody sees, including me.

agents are good at moving files and bad at taste. hand one an archive and say "post my best work" and you get slop: the first twenty files, near-duplicates, someone else's shoot that happened to be in the folder.

**techistack is how i let agents curate my work without letting them ruin it.** they look before they choose, they show me what they see, and nothing moves forward until i've picked.

**it never deletes anything.** this is people's archive and backup work. sources are read-only. the only things it ever adds are a dated contact sheet folder and an optional `_context.md` next to your work.

**you choose the way photographers always have.** every contact sheet comes as a PDF and JPG. circle the frames you want on your phone (Files › Markup), cross out the rest, or print it and use a pen. or just write the numbers: "7, 12, 15". your picks are what go further, into publishing, print, retouching or production.

**it's built for agents as much as for you.** each sheet comes with a JSON manifest: every printed number mapped to its exact file, with size, orientation, capture date and where it sits on the page. an agent reads that instead of rescanning your archive or squinting at thumbnails, turns your marks into exact files without guessing names, and hands them to the next step. the curator writes a `_context.md` into each folder it works on, so the next agent, tool or person starts from what you already decided.

fork it. make it yours.

## install

in Claude Code:

```
/plugin marketplace add alexbeltechi/techistack
/plugin install techistack@techistack
```

the skills are plain `SKILL.md` folders, so other agents that read skills can use them too: copy `skills/*` into your agent's skills folder.

`/contactsheet` needs Node 18+ and runs `npm install` once in its folder (sharp and pdf-lib). HEIC and raw previews use macOS `sips`.

## skills

| skill | use it when |
|---|---|
| [`/contactsheet`](./skills/contactsheet/SKILL.md) | you want to see a folder (or several) at a glance: numbered proof sheets, PDF + JPG, plus the manifest. |
| [`/curate`](./skills/curate/SKILL.md) | you want an agent to go through your work and propose what to show, how many, in what order and for whom, and describe it, before anything is uploaded anywhere. |

```
/contactsheet ~/Pictures/2025/Colombia
/curate find me three portrait shoots that aren't on my site yet
```

## how /curate works

1. **brief:** what's the goal, and who is it for?
2. **survey:** what's in the archive, and what's already published?
3. **see:** contact sheets of the promising folders.
4. **propose:** three candidates. for each: why it's strong, for whom, the frames by number in order, how many and why, the layout, a title and a few plain sentences.
5. **stop.** you pick, cut and reorder, on the sheet or in words.
6. **record:** `_context.md` in the folder, so the knowledge lives with the work.
7. **publish (optional):** hand the picks to your CMS, print order or retoucher.
8. **learn:** your corrections go into `lessons.md` and override the defaults next time.

genre guidance lives in [`skills/curate/references`](./skills/curate/references): portrait in depth, plus starting points for fashion, fine art, travel, design case studies, architecture and events.

## make it yours

copy `skills/curate/lessons.example.md` to `lessons.md`. every time you correct the curator ("too many frames", "never open on a detail"), it adds a line. your taste stays yours and isn't part of this repo.

## license

MIT
