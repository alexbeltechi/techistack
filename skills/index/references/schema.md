# Local Index JSON, version 2

This is a filesystem-based interchange format. Paths in manifest references are relative to the local store and use `/`. Resolve them locally; never as URLs. All data is ordinary JSON. Unknown fields should be preserved by future migrations/exporters. No file contents or media previews are embedded.

## Entry point: index.json

`schema: "techistack-local-index/v2"`, `updated_at`, and `sources`.
Each source summary has:

- `source_id`: observation of one selected root at one absolute location, derived from root folder ID and location. It is not a hardware serial or global drive ID.
- `root_folder_id`, human `label`, `last_known_location`, `last_location_verified_at`, `snapshot_at`, and `coverage`.
- Counts: `folder_count`, `file_count`, `unobserved_folder_count`, `error_count`.
- `latest`: path to the current source descriptor.
- `previous`: path to the prior descriptor, or null. Older unreferenced generated versions are pruned after a successful update.

The registry holds no recursive file arrays. Sources not refreshed retain their previous observation dates. Updating one source does not check other sources' availability.

## Source descriptor

`schema: "techistack-source-index/v2"`, source identity/location/timestamp fields, coverage/counts, `changes`, `errors`, `conflicts`, and `folder_chunks` (path and byte size for each chunk).
Change categories include counts and up to 100 examples, not unbounded arrays. Error examples are also limited to 100; `error_count` is the full count. A descriptor is named by SHA-256 of its serialized contents, making referenced versions immutable.

`folder_chunks` is an ordered list. Follow this order when reconstructing split folders.

## Inventory chunk

`schema: "techistack-folder-chunk/v2"`, `source_id`, and `folders` (an array of folder records or consecutive parts of a folder).
A folder record contains:

- `id`, `kind: "folder"`, `parent_id` (null for the selected root).
- `path`: root-relative POSIX path; `.` identifies the selected root. `name` is the observed folder name.
- `description`, `context`, and `carried_context`: recorded human context and original folder-name clues. A folder name is not proof of its subject. Confirmed context contains source ID/title and recorded text.
- `children`: immediate child folder names; `skipped`: excluded entry names and reasons.
- `files`: direct files, with `name`, `kind: "file"`, `extension`, `size_bytes`, `modified_at`, and optional `sha256`.
- `file_part` (zero-based) and `file_parts` (total). For very large folders, repeat the folder metadata and split its direct files into consecutive records. Merge `files` in part order when exporting; emit one logical folder row/note per `(source_id, id, path)`, not one per part.
- Optional `location_status` and `last_location_verified_at` on previously recorded folders not seen during the latest pass.
- Optional privacy and description fields:
  - `subject` and `place`: arrays of controlled-vocabulary tags when matched (local `vocab.json`), omitted otherwise.
  - `status`: one of `raw|reviewed|candidate|selected|published` (default `raw` unless set by frontmatter).
  - `signature`: `{ method: "file-sizes-hashes/v1", sha256 }` — a privacy-safe content signature (hash of sizes + known per-file hashes), used to spot identical folders across sources without copying sensitive names.
  - Sensitivity and consent: `sensitivity: "financial"|"identity"|"medical"|"credentials"` on folders/files, and `consent: "pending"|"include"|"exclude"`. Outputs must omit flagged items unless `include`. Raw secrets (IBANs, card numbers, balances, account numbers, CNP, passwords) never appear in notes/insights even after consent.
  - Per-file redaction by name is limited to strong patterns only (IBAN, Luhn-valid card number, valid CNP, explicit credentials files). Structured hints may appear under `observed_as` (e.g. `{ kind: "invoice", client, date, amount, currency, number }` or `{ kind: "bank_statement", bank, period }`), never account numbers or passwords.

A file's folder relationship comes from the containing folder record. Derive its root-relative path from folder `path` plus filename. No per-file persistent identity is promised. Nested folder IDs persist at known paths within a source; root-only notes cannot establish identity after arbitrary child moves. An explicit move mapping or future content-identity extension would be needed to guarantee that.

Use `(source_id, folder id, path)` as the location-record key. Shared IDs alone must not silently collapse copies. File content hashes and observed paths are separate facts. Timestamps are ISO 8601 strings; modification dates are not capture/event dates.

## Export behavior

Read the manifest, choose latest (or explicitly previous), follow source/chunk references, reassemble folder parts, and map the fields to Markdown properties, CSV rows, SQLite tables, or another consumer. Copy known context and verification dates with the data. No exporter or bidirectional editing is implemented yet. Exported data must retain its source IDs and snapshot date so it cannot be mistaken for a live filesystem view.

This version scans one selected source in memory. Chunked storage and search do not imply a fully streaming scan or duplicate review. About 5 MiB is a chunk target, not a hard bound on an unusually large unsplittable folder-metadata record.
