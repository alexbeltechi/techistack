---
name: index
description: Scan a selected archive root recursively, write one root _INDEX.md overview, and update a local per-source JSON inventory. Use for manual archive indexing, refreshed location snapshots, or finding recorded files across disconnected sources. No nested note creation, scheduler, or uploads.
---

# Index

Scan the entire selected root and its included descendants, but create or update **only `<selected root>/_INDEX.md`**. Never create notes at lower levels merely because those folders were traversed. Existing descendant notes can be read for context; they are not changed or automatically removed.

Cover all ordinary file types—PDFs, office documents, code, photos, audio, video, and other files—using names, extensions, sizes, and modification dates. Do not describe unseen file contents. The script is `scripts/index.mjs`, relative to this skill; it uses Node 20+ with no dependencies or network operations.

## Manual workflow

```bash
node <skill>/scripts/index.mjs run "<archive root>" --dry-run
node <skill>/scripts/index.mjs run "<archive root>"
node <skill>/scripts/index.mjs find "client name"
node <skill>/scripts/index.mjs review
```

The default local store is calculated as `os.homedir()/Documents/Index` on the computer executing the script. It is **not the maintainer's computer or a remote service**. Set `TECHISTACK_INDEX_STORE` or pass `--store "<local folder>"` to override it (`--store` takes precedence). Use `--label "<human source name>"` for a recognizable source label. Other agents can invoke the script by its actual installed skill path; no account, country, drive name, or personal absolute path belongs in this public skill.

Confirm the intended source and local store on first use. Documents may itself be cloud-synced; this script does not configure OS sync or upload anything. The store and selected root must be outside Git working trees. A Git project nested beneath a selected archive root is inventoried without writing into it; its hidden internals and dependencies are excluded.

1. Dry-run the selected root. Report coverage, exclusions, and errors; a shallow displayed tree is not the scan depth.
2. Record confirmed overall context in the root note's `## Context`. For scoped folder meaning, use `## Folder context` with `### <relative/path>` headings. Example: `### Catalog` followed by a confirmed description of that folder. Use narrower annotations for narrower meaning. Keep filename-based interpretation explicitly unconfirmed.
3. Run the scan. It preserves the root note's stable ID, creation date, and prose outside the marked generated block. The generated overview has a compact tree, linked folder directory, descriptions/direct file types, counts, and check date. The tree, directory, and direct-file list are bounded for readability; all included folder/file facts are in local JSON.
4. Review errors and exclusions. `complete-with-exclusions` means recursive coverage of the included scope, not a byte-for-byte audit of the drive. Errors produce `partial` coverage. Hidden entries, dependency/build folders, app libraries, generated TechiStack outputs, symlinks, and the local store are excluded and recorded. User folders such as `_Website`, `_export`, and `_audio` are included.
5. Offer optional duplicate/organization review after indexing. Do not execute proposed moves or deletions as part of this pass.

## Root note and local inventory

The root `_INDEX.md` is a human overview. Edit `## Context`, `## Folder context`, and `## Notes`; the agent can preserve other useful handwritten descriptions too. Do not edit between `<!-- techistack:index:start -->` and `<!-- techistack:index:end -->` unless repairing a malformed block. Existing layouts are preserved; a managed section is appended or refreshed. Legacy frontmatter inventories remain dated historical facts; the new measured facts are in the generated block and JSON.

Only the root note travels automatically when that whole root moves. Moving a child folder alone does not carry the root note or guarantee preservation of its local record ID. Log the move, retain its old location as last-known, and refresh the affected selected roots. Never infer a move or complete backup from a matching name. New root locations are recorded separately, rather than silently replacing a potentially disconnected copy.

The local store is:

```text
Index/
  index.json                       small registry, source summaries and references
  sources/
    <source-id>/
      <content-hash>.json           latest / previous source descriptors
      chunks/<content-hash>.json    folder/file inventory chunks
  migrations/                      one-time preserved pre-migration material
```

There is no generated `Index/INDEX.md`, and no endless dated Markdown/JSON snapshot series. Each source retains **latest + previous** inventory versions. After the manifest is committed, unreferenced, unmodified generated descriptors/chunks for that source are pruned. Other sources remain unchanged. User-modified and unknown files are not pruned. Old v1 snapshots are retained as a one-time local archive, not extended.

Large folder inventories are split into file parts; chunks target about 5 MiB. One unusually large folder metadata record may exceed the target. `find` reads chunks sequentially. A scan still holds the chosen source and previous inventory in memory; very large small-file archives should be scanned as narrower selected roots. Optional cross-source `review` is also memory-intensive. Partitioning the store prevents a single aggregate JSON from growing with every source; it is not a claim of unlimited-memory scanning.

The format supports future export without a fresh disk scan. See [references/schema.md](references/schema.md) when consuming the JSON, implementing an exporter, or changing storage. No Obsidian/database exporter is included yet.

## Search, context, and changes

`find` searches all recorded sources, including disconnected ones. Terms are literal; all supplied terms must match a folder record and its direct files. The agent should try aliases and spelling variants and report all plausible matches with verification dates and coverage. A search does not perform live availability verification. Agents can also read the manifest, follow its JSON references, and search source records without invoking the skill.

The root has a portable ID. Nested folder IDs persist by relative path in the local source inventory; they are not globally stable IDs for arbitrary file moves. Context comes from root annotations, existing notes, and previous local records. All observed folders have explicit parent IDs. Missing folders remain searchable as not-observed/last-known entries; prior file-level facts are also retained in the previous source version. Change summaries contain counts and up to 100 examples per category. A missing item is not proof of deletion.

After changes in human context, rescan to update the inventory. When the user has authorized task logging, record a minimal action trail (scope, date, coverage, local snapshot reference), not the full personal inventory. Log moves with source, destination, date, and verification when authorized; the log does not itself update the inventory.

## Optional review

`review` reports same-name/same-size candidate groups, recorded shared-ID conflicts, and identical-content groups where hashes exist. These are leads; recorded locations can be stale. `run --hash` is opt-in: it computes SHA-256 for same-size groups within the selected source and may be slow for large media. Matching hashes prove identical contents, not that one copy can safely be removed or that a project backup is complete.

An agent can propose more logical grouping after reviewing context. Present source, destination, rationale, comparison evidence, backup intent, possible broken references (editing projects, code, linked documents), and reversal steps. Execute only concrete changes the user authorizes. There are no source move/delete commands in this script.

## Migration and privacy

The first writing pass on a recognized v1 local store backs up its aggregate JSON, partitions its source data into v2, and backs up/removes its generated local `INDEX.md` only when that file has the known generated marker. Handwritten overviews remain untouched. Source notes are never deleted by automatic migration. If the user explicitly requests cleanup of earlier generated descendant notes, back them up, verify ownership/IDs and preserve their context in the root annotations/local data, then remove only the authorized notes. Do not delete arbitrary `_INDEX.md` files.

The brain may hold a reviewed pointer to the local `index.json` and a short pass summary. Detailed inventories, client names, filenames, and context stay local by default. Do not automatically upload them to a brain Git repository or task tool. Public TechiStack updates contain reusable code, schema, and synthetic fixtures only. `/curate` remains the separate opt-in visual workflow; legacy `/scan` is independent.
