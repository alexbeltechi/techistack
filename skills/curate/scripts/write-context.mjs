#!/usr/bin/env node
/**
 * Write <folder>/_context.md: the one file /curate may add to an archive.
 *
 *   node write-context.mjs <folder> <draft.md> [--update]
 *
 * - The draft must start with the `<!-- curate:context -->` marker.
 * - Refuses if _context.md exists, unless --update and the existing file also
 *   starts with the marker (so it only ever replaces its own file).
 * - Writes nothing else: no other file in the folder is opened for writing.
 */

import fs from "node:fs/promises";
import path from "node:path";

const MARKER = "<!-- curate:context -->";

const args = process.argv.slice(2);
const update = args.includes("--update");
const [folder, draft] = args.filter((a) => a !== "--update").map((a) => path.resolve(a));

function fail(msg) {
  console.error(`write-context: ${msg}`);
  process.exit(1);
}

if (!folder || !draft) fail("usage: write-context.mjs <folder> <draft.md> [--update]");

const stat = await fs.stat(folder).catch(() => null);
if (!stat?.isDirectory()) fail(`not a folder: ${folder}`);

const body = await fs.readFile(draft, "utf8").catch(() => fail(`can't read draft: ${draft}`));
if (!body.trimStart().startsWith(MARKER)) fail(`draft must start with ${MARKER}`);

const target = path.join(folder, "_context.md");
const existing = await fs.readFile(target, "utf8").catch(() => null);

if (existing !== null) {
  if (!update) fail(`${target} exists. Pass --update to replace a file this skill wrote.`);
  if (!existing.trimStart().startsWith(MARKER)) fail(`${target} wasn't written by /curate; leaving it alone.`);
}

// "wx" fails if the file appeared in the meantime; on --update we replace our own file.
await fs.writeFile(target, body, { flag: existing === null ? "wx" : "w" });
console.log(JSON.stringify({ wrote: target, updated: existing !== null }));
