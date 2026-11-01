---
name: index
description: Create and maintain portable, searchable folder notes in `_INDEX.md` files. Use when someone wants to index folders or add context that travels with moved folders. Record observable file and folder facts plus human-provided context; do not inspect every image or video to describe its visual contents.
---

# Index

Give each meaningful folder a short, readable `_INDEX.md` that travels with it. The note is both the human-facing description and the machine-searchable metadata. Per-folder notes are the portable source of truth; no database, Obsidian vault, or cloud service is required.

Searching does not require this skill: an agent that can read the notes can search them directly. Use this skill to create or refresh notes consistently. The notes are ordinary Markdown, so they can be used by any agent or tool that can access the relevant folders. A local agent can search mounted drives; a remote agent needs the notes or archive made accessible to it.

Use ordinary filesystem tools to inspect names, types, sizes, and dates. Read existing documentation and metadata files when relevant. Do not open or visually analyze photos, video, or audio to describe their contents; use filenames and folder names as clues, label guesses as unconfirmed, and ask the user when the meaning matters.

## Create or update an index

1. Identify the requested folder and inspect its immediate contents. If asked to index a whole archive, work through its meaningful subfolders and place an `_INDEX.md` in each one. Skip system folders, application libraries, generated caches, and folders the user has not included in scope. For a large archive, work in bounded roots or batches and report coverage so an incomplete pass is not mistaken for a complete index.
2. Reuse an existing `_INDEX.md`. Preserve its stable ID, creation date, and user-authored context. Refresh only facts that can be observed from the current folder. Set `index_updated_at` when the note changes; update the inventory measurement date only when you actually recheck those facts.
3. Ask one concise question when the folder's purpose, place, project, or backup status is unclear and useful. Continue with the known facts; don't turn guesses into confirmed metadata.
4. Write or update `_INDEX.md` at the folder's top level. The leading underscore makes it easy to spot and sorts it ahead of ordinary filenames in common file browsers.
5. When asked to search, search `_INDEX.md` files under the roots the user names or that are currently mounted. Search their titles, summaries, keywords, places, projects, and context first; use filenames and paths as additional clues. State which roots were searched so a disconnected drive is not mistaken for an empty result.

## Optional archive snapshot

When the user wants an overview across drives, maintain a dated, metadata-only snapshot in their second brain's archive area. Build it from the `_INDEX.md` files, not by inspecting each media item. This snapshot is a search aid and last-known-location hint; it is not a backup of the media and does not replace the notes beside the folders.

Record `snapshot_created_at` and `snapshot_updated_at` in the snapshot. For each copy, use `last_known_location`, `last_location_verified_at`, and `location_status` (`verified`, `unverified`, `stale`, or `unavailable`). A disconnected drive or old location is unknown, not proof that files are missing. When asked to refresh, search currently mounted roots and compare stable folder IDs. Preserve the previous last-known location with its check date if it cannot be verified; never silently present it as current.

Keep the snapshot plain Markdown and searchable. Do not introduce a database dependency unless the user later asks for one.

Keep each note brief enough to open and understand at a glance. Prefer useful words a person might search for—places, projects, people, dates, subjects, formats, and status. Use the user's wording where possible. Separate confirmed context from filename-based or otherwise inferred context.

## Portable note format

Use Markdown with YAML frontmatter so it reads well in Finder, Obsidian, GitHub, and other agents, while remaining easy to parse later for a CMS. Start from this shape and omit fields that do not apply:

```md
---
schema: techistack-index/v1
id: <stable UUID for this folder's collection>
index_created_at: <YYYY-MM-DD>
index_updated_at: <YYYY-MM-DD>
title: <short folder title>
summary: <one or two factual sentences>
keywords: [<search terms>]
content_types: [<video, photo, audio, documents, project files, etc.>]
date_range: <known range, or unknown>
people: [<known names, otherwise empty>]
places: [<confirmed places, otherwise empty>]
projects: [<known project or client names>]
credits: [<known creators, licenses, or rights notes>]
portfolio_status: <unknown | candidate | selected | published | not-portfolio>
inventory:
  media_files: <count, excluding this note and OS metadata files>
  folders: <count>
  size_bytes: <total, when practical>
  measured_at: <YYYY-MM-DD>
context_source: <user | folder-names | filenames | mixed>
backup_status: <unknown | not-checked | candidate | verified>
---

# <Short folder title>

## What's here
<Plain-language description and useful subfolder or file groups.>

## Context
<Confirmed project, place, date, people, or intended use. Mark any inference.>

## Copies and backup
<Only list copies that have actually been found. Say when a match is unverified.>

## Notes
<Handling, relationships, or workflow details that help the next person or agent.>
```

The stable `id` identifies the collection when the folder is moved or copied; keep it when updating the same collection. A copied folder keeps the same ID until the user says it is a separate collection. `index_created_at` stays fixed; `index_updated_at` changes when the note changes; `inventory.measured_at` changes only when inventory facts are rechecked. Do not store an absolute path as identity: paths change when folders move. Current and last-known locations belong in the brain snapshot, with the date each location was checked.

When a folder moves, its `_INDEX.md` moves with it and remains valid as context. Update any central snapshot's last-known location only after verifying the new location; preserve the prior location and its verification date if the collection cannot be found. Use stable IDs to recognize copies across roots. Do not claim two folders are backups based only on matching names, dates, or sizes.

Use `backup_status: verified` only after comparing the relevant copies. A matching name or size alone is a candidate, not proof. Never move or delete originals as part of indexing. Keep personal `_INDEX.md` files beside the user's files; publish reusable skill code and blank templates, never personal indexes or archive paths.

For future publishing, keep known names, places, dates, credits, and rights information in separate fields when available. Leave unknown fields empty or mark them unknown; never invent credits, rights, or identities.

Only set `portfolio_status` from the user's instruction or an existing, documented decision. Indexing does not visually judge whether work belongs in a portfolio.

## Boundaries

- This skill organizes and describes folders. It does not create image captions, judge visual quality, make selections, or write publication copy from unseen media.
- `/curate` remains the separate workflow for opening visual work, choosing pieces, and preparing publication materials.
- `/scan` is a separate legacy tool for an existing `_scan_…` snapshot: it provides incremental whole-tree counts and change reports, plus keyword search over frames already described by `/curate`. It is not required to create, search, or update `_INDEX.md` notes. For new portable folder context, use `/index`; avoid creating a new `_scan_…` snapshot for the same archive unless the user specifically wants its inventory/change-report features. If retiring an existing Scan archive, preserve its useful counts/change history and curated-frame search needs before removing its files or skill.
- Use no machine-specific paths, external services, or required packages in the note format.

## Search examples

Search the mounted or user-specified archive roots for the literal term `Colombia` in `_INDEX.md` files. Report the matching folder and the root or drive where it was found. If one or more drives are not mounted, say that the search covered only the available roots.
