---
name: curate
description: Act as a curator for a body of work (photography, design, art): survey an archive, see it on contact sheets, propose what to show, how many pieces, in what order, for whom, and describe it, before anything is uploaded. Use when the user says "curate", "what should I publish", "find me projects to post", "go through my archive", or wants to turn folders of work into series, posts or case studies.
---

# Curate

A curator decides what to show, how much, in what order and for whom, and
says why. Uploading is the last, optional step. Steps 1–5 work on any archive
and don't depend on a CMS.

Uses `/contactsheet` to see the work. Genre guidance is in `references/`.
Read `lessons.md` before every run if it exists (start one from
`lessons.example.md`): it holds this user's corrections, and they override
the general guidance.

## Rules

- **Never delete anything.** Not a photo, not a sidecar, not a folder, not
  even an obvious reject or duplicate, unless the user separately and
  explicitly asks for that specific deletion. This is people's archive and
  backup work. Curating means choosing what to show; leaving a frame out never
  means removing it. (Culling, if it ever comes, is a separate skill.)
- **Originals are read-only.** Never move, rename, edit, convert or delete a
  source file. The only file this skill writes in an archive is
  `_context.md`, through `scripts/write-context.mjs`, which refuses to
  overwrite anything it didn't write.
- **Sensitive work is the user's call:** nudity, minors, private people,
  client work under NDA. Flag it; never publish or exclude it on your own.
- Work in **batches** (default: 3 candidates), then stop and report.
- Picks always reference contact-sheet numbers resolved through the manifest.

## 1. Brief

Find out, in one short question if it isn't clear already:
- **Goal:** publish on the site, build a portfolio for a type of client, print,
  a pitch?
- **Audience:** who should this convince or move?
- **Scope:** which folders or genre (e.g. "portraits not yet online").

If the target already has published work (a site, a portfolio), list what's
there first so you don't propose duplicates.

## 2. Survey

`/contactsheet` scan over the scope. Rank folders by promise: exported picks
exist, a clear subject, enough frames to make a set, not already published.
Note mixes (several shoots in one folder) and raw-only folders.

## 3. See

One overview sheet per promising folder (`--max 20`). For the shortlist, a
full sheet (`--max all`) of the exports. Look at every sheet before saying
anything about it.

## 4. Propose

For each candidate (default 3), give:
- **What:** who/what, when, where, how many exports, which shoots inside.
- **Why it's strong:** in a sentence, concretely (light, styling, range,
  story), not adjectives.
- **For whom:** the audience it serves.
- **Selection:** the frame numbers in order, and the count with its reason.
  Default to fewer, stronger pieces (see the genre reference for typical
  ranges).
- **Shape:** layout or format, opening frame, how it ends.
- **Words:** a title and one to three plain sentences in the user's voice. No
  hype words.
- **Flags:** sensitive content, mislabelled frames, missing exports, rotation
  problems.

Send the sheets with the proposal. **Stop.** The user picks, cuts and
reorders.

## 5. Record

When the user settles a selection, write the folder's context so the
knowledge lives with the work, not only in a CMS:

```bash
node <skill>/scripts/write-context.mjs "<folder>" "<draft.md>"
```

Write the draft from `references/context-template.md` into the scratchpad
first. The script refuses if `_context.md` exists and wasn't written by this
skill; with `--update` it replaces only a file this skill wrote.

## 6. Publish (optional, target-specific)

Hand the picked paths (from the manifest) to wherever the work goes: a CMS,
a portfolio site, a print order, a folder for a retoucher. If the project has
its own publishing skill or script, use that; otherwise ask. Publish as a
**draft** where the target allows it, give the user the link, and stop. Add
where it went to `_context.md` with `--update`.

## 7. Learn

Every correction the user makes ("too many", "never open on a detail", "this
one's private") becomes one line in `lessons.md`, with the date. When a lesson
repeats, move it into the genre reference or this file.
