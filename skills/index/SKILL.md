---
name: index
description: Recursively create portable _INDEX.md folder notes and a local JSON/Markdown location snapshot for files, documents, projects, and media. Use when indexing a folder or drive, refreshing an archive snapshot, or recording context that must travel with moved folders. Manual invocation; no scheduler or uploads.
---

# Index

Index the requested root **recursively**, creating `_INDEX.md` at every ordinary folder level. A root-only overview is not a completed drive index. Cover PDFs, office documents, source files, images, audio, video, and other ordinary files using names, extensions, sizes, and modification dates. Do not visually inspect media or infer document contents from extensions. Ask the user about useful ambiguous context; preserve the answer in the folder's `## Context` section.

The script is `scripts/index.mjs`, relative to this skill. It uses Node 20+ with no dependencies, network access, background service, or schedule. All commands below run only when requested.

## Run a manual indexing pass

```bash
node <skill>/scripts/index.mjs run "<folder>" --dry-run
node <skill>/scripts/index.mjs run "<folder>"
```

The default local snapshot store is `~/Documents/Index`. Override with `--store "<local folder>"`; use `--label "<human source name>"` to distinguish a source. Confirm the store choice before first use when privacy or cloud syncing matters: a folder under Documents can be cloud-synced even though the script itself never uploads anything. The store must be outside Git working trees. Do not publish personal notes or snapshots.

1. Confirm the root and the scope. A selected drive includes its nested folders, not only its immediate children. Start with a dry run to see coverage and errors.
2. Record confirmed descriptions in each relevant folder's `## Context` section. Example: a `Catalog` folder under `Bicycles` is a bicycle catalog only if confirmed or explicitly marked as inferred. Root context applies to all descendants, so put specific context in the narrowest correct folder.
3. Run the indexer. It preserves stable folder IDs and prose outside its marked generated block. It adds a tree before the editable Context section in new notes, direct file inventory, child-note links, and portable context. Existing notes retain their layout and get a managed section appended or refreshed. Existing v1 frontmatter inventory stays historical; the managed section and local JSON contain the newly measured facts and their date.
4. Review the generated overview and errors. Report full recursion separately from overview display depth. Trees are shortened for readability; the JSON holds all included folders and direct files. `complete-with-exclusions` means every traversable in-scope folder was read, subject to listed exclusions—not every byte on a drive. Errors make coverage `partial`.
5. If you add or correct human context after the pass, run again to refresh child context and snapshots. Keep scripts deterministic about facts; the agent supplies interpretation and user-confirmed meaning.

Hidden entries, dependencies, generated build/output folders, app libraries, symlinks, the local store, and nested Git working trees are excluded and recorded. Leading-underscore user folders such as `_Website`, `_export`, and `_audio` are included. A selected Git working tree is rejected to avoid accidentally committing personal notes; use a plain archive copy for this version. Inspect exclusions when relevant material might be inside them.

## Two outputs that communicate

**Beside the source folders:** `_INDEX.md` is portable context, with stable ID, creation/update dates, the observed original folder hierarchy, inherited recorded context, direct filenames/types/sizes, and child links. Context is copied into each descendant's generated section so a child can make sense after it moves. Only relative links are used inside folder notes. Stable IDs are identity; absolute paths are not.

User prose stays outside `<!-- techistack:index:start -->` and `<!-- techistack:index:end -->`. Do not edit the machine carry marker by hand. Edit `## Context` for confirmed meaning and `## Notes` for other user guidance. Keep inferred descriptions labelled. Existing hand-written summaries and keywords can be retained in frontmatter; the agent may search them too.

**In the local store:**

```text
Index/
  INDEX.md                 readable source list and latest snapshot links
  index.json               aggregate inventory across all recorded sources
  snapshots/
    <source-id>-<time>.md   one dated readable snapshot of a selected root
    <source-id>-<time>.json matching facts for that pass
```

A new pass updates the local overview and JSON while retaining dated snapshots. Sources not scanned remain available as last-known hints. A source is keyed by root folder ID plus observed root location; finding the same root at a new path records another location rather than guessing whether it was moved or copied. Individual folders absent from a rescan are retained as previously recorded/unobserved entries. Prior snapshots preserve earlier file-level observations. This is metadata, not a backup of file contents.

The JSON records schema, timestamps, source IDs, root location, coverage, errors, folder IDs, summaries, carried context, direct file names/types/sizes/dates, changes, and conflicts. It is readable without the script. A same-ID path change means a relocation or copy candidate, not a verified move. Reused folder IDs at several locations indicate possible copies and are reported; never silently merge them or declare backups complete.

## Search and manual moves

```bash
node <skill>/scripts/index.mjs find "client name" --store "<local folder>"
node <skill>/scripts/index.mjs review --store "<local folder>"
```

Searches cover all recorded sources, including disconnected drives. `find` matches all supplied terms against each folder record and its direct files; terms are literal, not semantic. The agent should try user terms, aliases, spelling variants, and existing summaries, then report **all** matching locations with verification dates and coverage. State whether each root was actually checked now; a stored verification date is not live proof. Any agent with file access can also read/search these notes without this skill.

When a folder moves, carry its note with it. Log date, source, destination, and verification in the user's task tool if they have authorized that logging. Refresh the source and destination roots manually. A lone file moved without its folder note will not carry folder context; the next inventory must discover it. No background detection is implied.

## Optional organization and duplicate review

After the pass, offer a review of candidate duplication and organization. Do not treat it as permission to move or delete anything.

`review` reports same-filename/same-size candidates across the recorded sources plus shared-folder-ID conflicts. These are leads only; stale source records may overlap. For an explicitly requested byte comparison, `run --hash` computes SHA-256 for same-size groups within that source. It can take substantial time on large media. Matching hashes prove identical file contents, not that one copy is unnecessary or that a folder backup is complete.

An agent may suggest clearer grouping or consolidation based on recorded context. Present source, proposed destination, reason, comparison evidence, possible broken references (editing projects, code, linked documents), backup intent, and reversal steps. Preserve unknowns. Only execute moves/deletions if the user separately authorizes those concrete changes. This script has no move/delete command.

## Brain entry and publication

The brain can hold a brief, reviewed pointer to the **local** master index plus the scope/date of the latest pass. Keep detailed locations, client names, filenames, and document context local by default. Do not automatically copy inventories into a Git-tracked brain or Linear. When authorized to log progress, record a minimal action summary and local snapshot pointer rather than the full inventory. The reusable skill and synthetic fixtures can be public; personal outputs cannot be bundled into its release.

`/curate` remains the opt-in visual review workflow. Legacy `/scan` retains its existing incremental inventory/curated-frame-search behavior; it is not required for Index's folder notes or local snapshots. Index does not have Scan's incremental performance optimization: it reads folder listings and file metadata afresh on each pass, and never treats that as verified file-content equality.
