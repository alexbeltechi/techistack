#!/usr/bin/env node
/**
 * An index of an archive, so an agent knows what's there before it looks, and
 * what changed since it last did. On its own, one `_scan_YYYY-MM-DD` folder at
 * the root of what was scanned holds it, updated in place: a rescan renames
 * the folder to the new date and replaces the two files inside. For a /curate
 * review it's a snapshot instead, kept inside that `_curate_…` folder
 * (`--out`), so every review keeps the scan it was made from.
 *
 *   node scan.mjs status <folder>             the newest scan or snapshot, how old, what changed (reads only)
 *   node scan.mjs update <folder> [--fresh] [--name <subject>] [--out <_curate folder>]
 *                                             scan, or rescan only the folders that changed
 *   node scan.mjs show <folder> [--depth n]   one folder from the index: totals, subfolders, notes
 *   node scan.mjs note <folder> "<text>"      what a folder is, kept across rescans ("" removes it)
 *   node scan.mjs find <folder> <word>...     frames whose /curate keywords, caption or text match every word
 *
 * Inside `_scan_2026-10-08/`:
 *   _scan_2026-10-08_Archive.md     the map, to read
 *   _scan_2026-10-08_Archive.json   every folder's facts, for agents and rescans
 *
 * Keywords come from /curate: each curation's catalogue says what's in every
 * frame it looked at, and the map gathers them, so "car" finds the cars in
 * everything that's been curated, without looking again.
 *
 * Never opens a photo and never writes outside its own `_scan_…` folder. Skips
 * hidden files, techistack's own folders (but lists them: they say what has
 * been curated), and app libraries such as Lightroom previews (`.lrdata`),
 * which hold copies, not work.
 */

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const KINDS = {
  image: ["jpg", "jpeg", "png", "webp", "tif", "tiff", "avif", "gif"],
  heic: ["heic", "heif"],
  raw: ["nef", "cr2", "cr3", "arw", "dng", "raf", "orf", "rw2", "pef", "srw", "x3f", "3fr", "iiq"],
  video: ["mp4", "mov", "m4v", "webm", "avi", "mkv", "mts", "mxf", "braw", "r3d"],
  design: ["psd", "psb", "ai", "indd", "idml", "sketch", "fig", "xd", "afdesign", "afphoto", "svg", "eps", "pdf"],
  // Edits kept beside raws (Lightroom, Capture One, DxO, RawTherapee).
  sidecar: ["xmp", "cos", "dop", "pp3"],
};
const KIND_OF = new Map(Object.entries(KINDS).flatMap(([kind, exts]) => exts.map((e) => [e, kind])));
const LABEL = { image: "images", heic: "HEIC", raw: "raw", video: "video", design: "design", sidecar: "sidecars", other: "other" };

const SCAN_DIR = /^_scan_\d{4}-\d{2}-\d{2}(-\d+)?$/;
const CURATE_DIR = /^_curate_\d{4}-\d{2}-\d{2}(-\d+)?$/;
const SCAN_FILE = /^_scan_\d{4}-\d{2}-\d{2}(-\d+)?_.+\.(json|md)$/;
/** techistack's own folders: listed, never walked. */
const OURS = /^(_curate|_scan|contactsheet|selection)_\d{4}-\d{2}-\d{2}(-\d+)?$/;
/** App libraries: previews and caches, not the work. */
const PACKAGE = /\.(lrdata|lrlibrary|photoslibrary|aplibrary|cocatalog|cosessiondb|fcpbundle|imovielibrary|app|bundle|framework)$/i;
const CATALOG = /\.(lrcat|cocatalog)$/i;
const SYSTEM = new Set(["$RECYCLE.BIN", "System Volume Information", "node_modules", "Thumbs.db", "desktop.ini"]);
/** Folders whose name says they hold the photographer's own picks. */
const EXPORTED = /(^|[_\s-])(export|exports|selection|select|final|edit|edits)/i;
const CREDIT = "[/techistack](https://github.com/alexbeltechi/techistack)";

function fail(msg) {
  console.error(`scan: ${msg}`);
  process.exit(1);
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

/** Index keys are relative, with forward slashes; the root is ".". */
const join = (rel, name) => (rel === "." ? name : `${rel}/${name}`);
const toAbs = (root, rel) => (rel === "." ? root : path.join(root, ...rel.split("/")));
const toRel = (root, abs) => path.relative(root, abs).split(path.sep).join("/") || ".";
const within = (rel, top) => top === "." || rel === top || rel.startsWith(`${top}/`);
const parentOf = (rel) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ".");
const depthOf = (rel) => (rel === "." ? 0 : rel.split("/").length);
const nameOf = (rel) => rel.split("/").pop();

/** Safe in a file name, still readable: "Ștefan & Ana — nuntă" → "Stefan-Ana-nunta". */
const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}.+_-]+/gu, "-")
    .replace(/^[-.]+|-+$/g, "") || "archive";

/** "Aug" alone says little, "2025-Aug" does. */
function sourceLabel(folder) {
  const base = path.basename(folder);
  const vague = base.length <= 4 || /^\d+$/.test(base) || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*$/i.test(base);
  return vague ? `${path.basename(path.dirname(folder))}-${base}` : base;
}

/** Promise.all over items.map(fn), with at most `limit` running at once. */
async function mapLimit(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Works through a growing queue of folders, `limit` at a time. */
function drain(start, limit, fn) {
  const queue = [...start];
  let active = 0;
  return new Promise((resolve, reject) => {
    const pump = () => {
      if (!queue.length && !active) return resolve();
      while (active < limit && queue.length) {
        active++;
        fn(queue.shift()).then((more) => {
          queue.push(...more);
          active--;
          pump();
        }, reject);
      }
    };
    pump();
  });
}

/** What techistack made here: curation efforts (with their status), contact sheets, other scans. */
async function oursIn(abs, names) {
  return Promise.all(
    names.sort().map(async (name) => {
      const kind = name.startsWith("_curate_") ? "curation" : name.startsWith("contactsheet_") ? "sheet" : name.startsWith("_scan_") ? "scan" : "selection";
      const item = { name, kind };
      if (kind === "curation") {
        for (const f of (await fs.readdir(path.join(abs, name)).catch(() => [])).filter((n) => n.endsWith(".json"))) {
          try {
            const data = JSON.parse(await fs.readFile(path.join(abs, name, f), "utf8"));
            if (data.kind === "curation") {
              Object.assign(item, { status: data.status, subject: data.subject, selections: data.selections?.length ?? 0 });
              // How many frames carry each keyword (older efforts called them tags).
              const counts = {};
              for (const fr of data.frames || []) for (const k of new Set((fr.notes?.keywords ?? fr.notes?.tags ?? []).map((x) => String(x).toLowerCase().trim()).filter(Boolean))) counts[k] = (counts[k] || 0) + 1;
              if (Object.keys(counts).length) item.keywords = Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
            }
          } catch {
            // Not ours to judge; the folder is still listed.
          }
        }
      }
      return item;
    }),
  );
}

/** One folder's own facts (not its subfolders'). File sizes and dates only when `stats`. */
async function describe(abs, entries, st, sig, stats) {
  const rec = { mtimeMs: st.mtimeMs, sig, dirs: [], files: 0, exts: {} };
  const files = [];
  const ours = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      if (OURS.test(e.name)) ours.push(e.name);
      else if (PACKAGE.test(e.name)) (rec.packages ??= []).push(e.name);
      else rec.dirs.push(e.name);
      if (CATALOG.test(e.name)) (rec.catalogs ??= []).push(e.name);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).slice(1).toLowerCase() || "-";
      rec.exts[ext] = (rec.exts[ext] || 0) + 1;
      rec.files++;
      if (CATALOG.test(e.name)) (rec.catalogs ??= []).push(e.name);
      files.push(e.name);
    }
  }
  rec.dirs.sort((a, b) => a.localeCompare(b));
  if (ours.length) rec.ours = ours;
  if (stats && files.length) {
    let bytes = 0, oldest = Infinity, newest = 0;
    await mapLimit(files, 8, async (name) => {
      try {
        const s = await fs.stat(path.join(abs, name));
        bytes += s.size;
        oldest = Math.min(oldest, s.mtimeMs);
        newest = Math.max(newest, s.mtimeMs);
      } catch {
        // Gone or unreadable since the listing; leave it out of the sums.
      }
    });
    rec.bytes = bytes;
    if (newest) [rec.oldest, rec.newest] = [day(oldest), day(newest)];
  }
  return rec;
}

/**
 * Walks the tree under `root`. A folder whose entries and date match the old
 * index keeps its record (no file is touched); only changed folders are read
 * again. Returns every folder's record, keyed by relative path.
 */
async function walk(root, prev, { stats, fresh }) {
  const next = {};
  let folders = 0, files = 0, reread = 0;
  const started = Date.now();
  let told = started;
  await drain(["."], 16, async (rel) => {
    const abs = toAbs(root, rel);
    let st, entries;
    try {
      st = await fs.stat(abs);
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch (err) {
      next[rel] = { unreadable: err.code || "error", dirs: [], files: 0, exts: {} };
      return [];
    }
    entries = entries.filter((e) => !e.name.startsWith(".") && !SYSTEM.has(e.name));
    const sig = hash(entries.map((e) => (e.isDirectory() ? "/" : "") + e.name).sort().join("\n"));
    const old = prev[rel];
    const same = old && !fresh && !old.unreadable && old.sig === sig && old.mtimeMs === st.mtimeMs;
    const rec = same ? { ...old } : await describe(abs, entries, st, sig, stats);
    if (!same) reread++;
    // Efforts change inside their own folder, so their status is always read fresh.
    if (rec.ours) rec.ours = await oursIn(abs, rec.ours.map((o) => o.name ?? o));
    next[rel] = rec;
    folders++;
    files += rec.files;
    if (Date.now() - told > 5000) {
      told = Date.now();
      console.error(`scan: ${folders.toLocaleString("en")} folders, ${files.toLocaleString("en")} files…`);
    }
    return rec.dirs.map((d) => join(rel, d));
  });
  return { dirs: next, reread, tookMs: Date.now() - started };
}

const kindsOf = (exts = {}) => {
  const k = { image: 0, heic: 0, raw: 0, video: 0, design: 0, sidecar: 0, other: 0 };
  for (const [ext, n] of Object.entries(exts)) k[KIND_OF.get(ext) || "other"] += n;
  return k;
};

/** Totals for a folder and everything under it, memoised. */
function totals(dirs) {
  const memo = new Map();
  const agg = (rel) => {
    if (memo.has(rel)) return memo.get(rel);
    const r = dirs[rel] || {};
    const t = {
      folders: 1,
      files: r.files || 0,
      bytes: r.bytes || 0,
      kinds: kindsOf(r.exts),
      oldest: r.oldest,
      newest: r.newest,
      exported: EXPORTED.test(nameOf(rel)) && r.files > 0,
      curations: (r.ours || []).filter((o) => o.kind === "curation").length,
      sheets: (r.ours || []).filter((o) => o.kind === "sheet").length,
    };
    for (const c of r.dirs || []) {
      const s = agg(join(rel, c));
      t.folders += s.folders;
      t.files += s.files;
      t.bytes += s.bytes;
      for (const k in t.kinds) t.kinds[k] += s.kinds[k];
      if (s.oldest && (!t.oldest || s.oldest < t.oldest)) t.oldest = s.oldest;
      if (s.newest && (!t.newest || s.newest > t.newest)) t.newest = s.newest;
      t.exported ||= s.exported;
      t.curations += s.curations;
      t.sheets += s.sheets;
    }
    memo.set(rel, t);
    return t;
  };
  return agg;
}

/** What changed between two indexes, under `top`: folders with other counts, new folders, gone ones. */
function diff(prev, next, top = ".") {
  const aggNext = totals(next);
  const aggPrev = totals(prev);
  const changed = [], added = [], gone = [];
  for (const [rel, rec] of Object.entries(next)) {
    if (!within(rel, top)) continue;
    const old = prev[rel];
    if (!old) {
      if (rel === "." || prev[parentOf(rel)]) added.push({ folder: rel, files: aggNext(rel).files, ...nonZero(aggNext(rel).kinds) });
      continue;
    }
    const a = kindsOf(old.exts), b = kindsOf(rec.exts);
    const delta = {};
    for (const k in a) if (b[k] !== a[k]) delta[k] = b[k] - a[k];
    if (Object.keys(delta).length) changed.push({ folder: rel, ...delta });
  }
  for (const rel of Object.keys(prev)) {
    if (within(rel, top) && !next[rel] && next[parentOf(rel)]) gone.push({ folder: rel, files: aggPrev(rel).files });
  }
  const by = (a, b) => a.folder.localeCompare(b.folder);
  return { changed: changed.sort(by), added: added.sort(by), gone: gone.sort(by) };
}

const nonZero = (kinds) => Object.fromEntries(Object.entries(kinds).filter(([, n]) => n));

/** A scan index in a scan folder, or null. */
async function readScan(scanDir) {
  const file = (await fs.readdir(scanDir).catch(() => [])).find((n) => SCAN_FILE.test(n) && n.endsWith(".json"));
  if (!file) return null;
  try {
    const index = JSON.parse(await fs.readFile(path.join(scanDir, file), "utf8"));
    return index.kind === "scan" ? index : null;
  } catch {
    return null;
  }
}

/**
 * The newest scan that covers `folder`: in it or the nearest folder above it,
 * either the archive's own `_scan_…` or a snapshot inside one of its
 * `_curate_…` reviews.
 */
async function findScan(folder) {
  for (let dir = folder; ; dir = path.dirname(dir)) {
    const names = await fs.readdir(dir).catch(() => []);
    const candidates = names.filter((n) => SCAN_DIR.test(n)).map((n) => path.join(dir, n));
    for (const c of names.filter((n) => CURATE_DIR.test(n))) {
      for (const n of (await fs.readdir(path.join(dir, c)).catch(() => [])).filter((x) => SCAN_DIR.test(x))) candidates.push(path.join(dir, c, n));
    }
    const found = [];
    for (const scanDir of candidates) {
      const index = await readScan(scanDir);
      if (index) found.push({ scanDir, index });
    }
    if (found.length) {
      found.sort((a, b) => a.index.scannedAt.localeCompare(b.index.scannedAt));
      const { scanDir, index } = found.at(-1);
      // Found by where it sits, so a moved archive (another drive name) still works.
      const snapshot = path.dirname(scanDir) !== dir;
      index.root = path.resolve(scanDir, index.rootFromScan ?? (snapshot ? "../.." : ".."));
      const own = found.filter((f) => path.dirname(f.scanDir) === dir).map((f) => path.basename(f.scanDir));
      return { root: index.root, scanDir, index, snapshot, others: own.filter((n) => n !== path.basename(scanDir)) };
    }
    if (path.dirname(dir) === dir) return null;
  }
}

/** An index's folders and notes seen from another root: a part of it, or it inside a bigger one. */
function rebase(index, from, to) {
  if (from === to) return index;
  const move = (obj) => {
    const out = {};
    for (const [rel, v] of Object.entries(obj || {})) {
      const abs = toAbs(from, rel);
      const r = path.relative(to, abs);
      if (r.startsWith("..") || path.isAbsolute(r)) continue;
      out[toRel(to, abs)] = v;
    }
    return out;
  };
  return { ...index, root: to, dirs: move(index.dirs), notes: move(index.notes) };
}

const home = os.homedir();
const shown = (p) => (p === home || p.startsWith(home + path.sep) ? path.join("~", path.relative(home, p)) : p);
const num = (n) => n.toLocaleString("en");
function size(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) [bytes, i] = [bytes / 1024, i + 1];
  return `${bytes >= 10 || i === 0 ? Math.round(bytes) : bytes.toFixed(1)} ${units[i]}`;
}
const years = (t) => (t.oldest ? (t.oldest.slice(0, 4) === t.newest.slice(0, 4) ? t.oldest.slice(0, 4) : `${t.oldest.slice(0, 4)}–${t.newest.slice(0, 4)}`) : null);
const kindsText = (kinds) =>
  Object.entries(kinds)
    .filter(([, n]) => n)
    .map(([k, n]) => `${num(n)} ${LABEL[k]}`)
    .join(", ");
const deltaText = (c) =>
  Object.entries(c)
    .filter(([k]) => k !== "folder")
    .map(([k, n]) => `${n > 0 ? "+" : ""}${num(n)} ${LABEL[k]}`)
    .join(", ");

/** A folder in one line: files, kinds, size, years, what techistack knows about it. */
function line(t) {
  const bits = [`${num(t.files)} files${t.files ? `: ${kindsText(t.kinds)}` : ""}`];
  if (t.bytes) bits.push(size(t.bytes));
  if (years(t)) bits.push(years(t));
  if (t.kinds.raw && !t.kinds.image && !t.kinds.heic) bits.push("raw only");
  else if (t.exported) bits.push("exports");
  if (t.curations) bits.push(`curated ×${t.curations}`);
  else if (t.sheets) bits.push("contact sheet");
  return bits.join(" · ");
}

/** The map: what's where, what's promising, what's been curated, what changed. */
function render(index) {
  const { dirs, notes = {} } = index;
  const agg = totals(dirs);
  const all = agg(".");
  const rels = Object.keys(dirs).filter((r) => r !== ".");
  const out = [];
  out.push(`# Scan: ${index.subject}`, "");
  out.push(
    `\`${shown(index.root)}\` · scanned ${index.scannedAt.slice(0, 10)}${index.previousScan ? ` (before: ${index.previousScan.slice(0, 10)})` : " (first scan)"} · ${index.mode}, ${Math.max(1, Math.round(index.tookMs / 1000))} s`,
    "",
  );
  out.push(`**${num(all.files)} files** in ${num(all.folders)} folders${all.files ? `: ${kindsText(all.kinds)}` : ""}${all.bytes ? ` · ${size(all.bytes)}` : ""}${years(all) ? ` · file dates ${years(all)}` : ""}`, "");
  out.push("File dates are when files were last written (an export or a copy), not when a photo was taken.", "");

  const c = index.changes;
  if (index.previousScan && c) {
    out.push("## Since the last scan", "");
    if (!c.changed.length && !c.added.length && !c.gone.length) out.push("Nothing changed.");
    for (const x of c.added) out.push(`- new: \`${x.folder}\` (${num(x.files)} files)`);
    for (const x of c.changed) out.push(`- \`${x.folder}\`: ${deltaText(x)}`);
    for (const x of c.gone) out.push(`- gone: \`${x.folder}\` (had ${num(x.files)} files)`);
    out.push("");
  }

  // Folders with photos of their own, not yet curated: exports first, then the biggest.
  const curatedNear = (rel) => [rel, parentOf(rel)].some((r) => (dirs[r]?.ours || []).some((o) => o.kind === "curation"));
  const look = rels
    .map((rel) => ({ rel, k: kindsOf(dirs[rel].exts) }))
    .filter(({ rel, k }) => k.image + k.heic >= 10 && !curatedNear(rel))
    .sort((a, b) => EXPORTED.test(nameOf(b.rel)) - EXPORTED.test(nameOf(a.rel)) || b.k.image + b.k.heic - (a.k.image + a.k.heic))
    .slice(0, 20);
  if (look.length) {
    out.push("## Where to look", "", "Folders with photos of their own, not curated yet: exports first, then the most images.", "");
    for (const { rel, k } of look) out.push(`- \`${rel}\`: ${num(k.image + k.heic)} images${EXPORTED.test(nameOf(rel)) ? " (exports)" : ""}${k.raw ? `, ${num(k.raw)} raw` : ""}`);
    out.push("");
  }

  const efforts = Object.entries(dirs).flatMap(([rel, r]) => (r.ours || []).filter((o) => o.kind === "curation").map((o) => ({ rel, ...o })));
  if (efforts.length) {
    out.push("## Already curated", "");
    for (const e of efforts) out.push(`- \`${join(e.rel, e.name)}\`${e.status ? ` · ${e.status}` : ""}${e.selections ? ` · ${e.selections} selection${e.selections > 1 ? "s" : ""}` : ""}`);
    out.push("");
  }

  // What's in the curated work, by keyword: the most frames first.
  const byKeyword = new Map();
  for (const e of efforts) {
    for (const [k, n] of Object.entries(e.keywords || {})) {
      const entry = byKeyword.get(k) ?? { frames: 0, folders: new Map() };
      entry.frames += n;
      entry.folders.set(e.rel, (entry.folders.get(e.rel) || 0) + n);
      byKeyword.set(k, entry);
    }
  }
  if (byKeyword.size) {
    const top = [...byKeyword].sort((a, b) => b[1].frames - a[1].frames || a[0].localeCompare(b[0]));
    out.push("## Keywords", "", "What the curated frames show, from each curation's catalogue. `scan.mjs find <folder> <word>` lists the frames.", "");
    for (const [k, { frames, folders }] of top.slice(0, 60)) {
      const where = [...folders].sort((a, b) => b[1] - a[1]).map(([rel, n]) => `\`${rel}\` (${n})`);
      out.push(`- **${k}** · ${num(frames)} frame${frames > 1 ? "s" : ""}: ${where.slice(0, 5).join(", ")}${where.length > 5 ? `, +${where.length - 5} more` : ""}`);
    }
    if (top.length > 60) out.push(`- …and ${num(top.length - 60)} more keywords (see the .json, or \`find\`)`);
    out.push("");
  }

  const rawOnly = rels.filter((rel) => {
    const t = agg(rel);
    if (!t.kinds.raw || t.kinds.image || t.kinds.heic) return false;
    const p = agg(parentOf(rel));
    return parentOf(rel) === "." || p.kinds.image || p.kinds.heic; // the top-most raw-only folder
  });
  if (rawOnly.length) {
    out.push("## Raw only", "", "No exported images here yet: export from Lightroom or Capture One, or use `--raw` previews to look.", "");
    for (const rel of rawOnly.slice(0, 30)) out.push(`- \`${rel}\`: ${num(agg(rel).kinds.raw)} raw`);
    if (rawOnly.length > 30) out.push(`- …and ${rawOnly.length - 30} more (see the .json)`);
    out.push("");
  }

  // The tree, as deep as fits in about 300 lines; the .json has every folder.
  const withFiles = rels.filter((rel) => agg(rel).files);
  let depth = 1;
  while (depth < 8 && withFiles.filter((r) => depthOf(r) <= depth + 1).length <= 300 && withFiles.some((r) => depthOf(r) > depth)) depth++;
  out.push("## Folders", "");
  if (depth < Math.max(0, ...withFiles.map(depthOf))) out.push(`${depth} level${depth > 1 ? "s" : ""} deep; \`scan.mjs show <folder>\` or the .json for the rest.`, "");
  const tree = (rel) => {
    for (const child of dirs[rel]?.dirs || []) {
      const r = join(rel, child);
      const t = agg(r);
      if (!t.files) continue;
      out.push(`${"  ".repeat(depthOf(r) - 1)}- **${child}/** · ${line(t)}${notes[r] ? ` — *${notes[r].text}*` : ""}`);
      if (depthOf(r) < depth) tree(r);
    }
  };
  const ownFiles = dirs["."]?.files;
  if (ownFiles) out.push(`- *(loose at the top)* · ${num(ownFiles)} files: ${kindsText(kindsOf(dirs["."].exts))}`);
  tree(".");
  out.push("");

  const gone = Object.keys(notes).filter((rel) => !dirs[rel]);
  const kept = Object.entries(notes).filter(([rel]) => dirs[rel]);
  if (kept.length || gone.length) {
    out.push("## Notes", "");
    for (const [rel, n] of kept) out.push(`- \`${rel}\`: ${n.text}`);
    for (const rel of gone) out.push(`- \`${rel}\` (no longer there): ${notes[rel].text}`);
    out.push("");
  }

  const skipped = Object.entries(dirs).flatMap(([rel, r]) => [...(r.packages || []), ...(r.catalogs || [])].map((p) => join(rel, p)));
  const unreadable = Object.entries(dirs).filter(([, r]) => r.unreadable).map(([rel, r]) => `${rel} (${r.unreadable})`);
  const scans = Object.entries(dirs).flatMap(([rel, r]) => (r.ours || []).filter((o) => o.kind === "scan" && rel !== ".").map((o) => join(rel, o.name)));
  if (skipped.length || unreadable.length || scans.length) {
    out.push("## Not looked into", "");
    for (const p of [...new Set(skipped)]) out.push(`- \`${p}\`: catalog or app library`);
    for (const p of unreadable) out.push(`- \`${p}\`: couldn't be read`);
    for (const p of scans) out.push(`- \`${p}\`: an older scan of a folder inside; this one covers it`);
    out.push("");
  }
  out.push("---", "", `<sub>${CREDIT}</sub>`, "");
  return out.join("\n");
}

/** Writes the index and the map into the scan folder, replacing earlier ones there. */
async function write(scanDir, index) {
  index.id = `${path.basename(scanDir)}_${index.subject}`;
  index.rootFromScan = path.relative(scanDir, index.root) || ".";
  const files = { json: `${index.id}.json`, md: `${index.id}.md` };
  const { root, ...data } = index;
  for (const [ext, body] of [["json", JSON.stringify({ ...data, root }, null, 1)], ["md", render(index)]]) {
    const tmp = path.join(scanDir, `.${files[ext]}.tmp`);
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, path.join(scanDir, files[ext]));
  }
  // Only our own index files from an earlier date, in our own folder.
  for (const f of await fs.readdir(scanDir)) if (SCAN_FILE.test(f) && !Object.values(files).includes(f)) await fs.unlink(path.join(scanDir, f));
  return { md: path.join(scanDir, files.md), json: path.join(scanDir, files.json) };
}

function parse(args) {
  const opts = { folder: null, fresh: false, depth: 1, name: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--fresh") opts.fresh = true;
    else if (a === "--depth") opts.depth = Number(args[++i]);
    else if (a === "--name") opts.name = args[++i];
    else if (a === "--out") opts.out = args[++i];
    else if (opts.folder === null) opts.folder = path.resolve(a);
    else opts.extra = a;
  }
  if (!opts.folder) fail("give a folder");
  if (!existsSync(opts.folder)) fail(`not found: ${opts.folder}`);
  if (!(Number.isInteger(opts.depth) && opts.depth >= 0)) fail("--depth is 0 or more");
  return opts;
}

async function status(args) {
  const { folder } = parse(args);
  const found = await findScan(folder);
  if (!found) {
    console.log(JSON.stringify({ scan: null, folder, next: `scan.mjs update "${folder}"` }, null, 2));
    return;
  }
  const { root, scanDir, index, others } = found;
  // Only folder dates and listings; no file is opened or measured.
  const { dirs, tookMs } = await walk(root, index.dirs, { stats: false });
  const top = toRel(root, folder);
  const changes = diff(index.dirs, dirs, top);
  const all = diff(index.dirs, dirs);
  const count = (c) => c.changed.length + c.added.length + c.gone.length;
  console.log(
    JSON.stringify(
      {
        scan: scanDir,
        root,
        folder: top,
        scannedAt: index.scannedAt,
        ageDays: Math.floor((Date.now() - Date.parse(index.scannedAt)) / 864e5),
        fresh: count(changes) === 0,
        ...changes,
        elsewhere: count(all) - count(changes),
        ...(others.length ? { olderScans: others } : {}),
        checkedMs: tookMs,
        map: path.join(scanDir, `${index.id}.md`),
        next: count(all) ? `scan.mjs update "${root}"` : null,
      },
      null,
      2,
    ),
  );
}

async function update(args) {
  const opts = parse(args);
  const found = await findScan(opts.folder);
  const name = `_scan_${today()}`;
  let root, scanDir, prev;
  if (opts.out) {
    // A snapshot for a /curate review, kept inside it; the newest earlier scan is what it's compared with.
    const effort = path.resolve(opts.out);
    if (!CURATE_DIR.test(path.basename(effort)) || !existsSync(effort)) fail(`--out is a /curate _curate_YYYY-MM-DD folder: ${effort}`);
    root = opts.folder;
    prev = found ? rebase(found.index, found.root, root) : null;
    const existing = (await fs.readdir(effort)).filter((n) => SCAN_DIR.test(n)).sort().at(-1);
    scanDir = path.join(effort, name);
    if (existing && existing !== name) await fs.rename(path.join(effort, existing), scanDir);
    else if (!existing) await fs.mkdir(scanDir);
  } else {
    // The archive's own scan: one folder at its root, renamed to today's date when it's from an earlier day.
    root = found?.root ?? opts.folder;
    prev = found?.index ?? null;
    // The archive's own scan folder, even when a review's snapshot is newer.
    const ownDir = found && !found.snapshot ? found.scanDir : found?.others.length ? path.join(root, found.others.at(-1)) : null;
    const own = ownDir ? { scanDir: ownDir } : null;
    scanDir = own?.scanDir ?? path.join(root, name);
    if (!own) await fs.mkdir(scanDir);
    else if (path.basename(scanDir) !== name) {
      const to = path.join(root, name);
      if (existsSync(to)) fail(`${to} already exists; leave one _scan_ folder in ${root}`);
      await fs.rename(scanDir, to);
      scanDir = to;
    }
  }
  const { dirs, reread, tookMs } = await walk(root, prev?.dirs ?? {}, { stats: true, fresh: opts.fresh });

  const index = {
    kind: "scan",
    version: 1,
    subject: slug(opts.name || prev?.subject || sourceLabel(root)),
    root,
    created: prev?.created ?? now(),
    scannedAt: now(),
    previousScan: prev?.scannedAt ?? null,
    mode: !prev ? "full" : opts.fresh ? "full, fresh" : `update, ${num(reread)} of ${num(Object.keys(dirs).length)} folders read again`,
    tookMs,
    totals: null,
    changes: prev ? diff(prev.dirs, dirs) : null,
    notes: prev?.notes ?? {},
    history: [...(prev?.history ?? [])].slice(-99),
    dirs,
  };
  const t = totals(dirs)(".");
  index.totals = { folders: t.folders, files: t.files, bytes: t.bytes, ...t.kinds, oldest: t.oldest ?? null, newest: t.newest ?? null };
  const c = index.changes;
  index.history.push({ at: index.scannedAt, mode: index.mode, folders: t.folders, files: t.files, ...(c ? { changed: c.changed.length, added: c.added.length, gone: c.gone.length } : {}) });
  const written = await write(scanDir, index);
  console.log(
    JSON.stringify(
      {
        scan: scanDir,
        ...written,
        mode: index.mode,
        tookMs,
        totals: index.totals,
        ...(c ? { changed: c.changed.length, added: c.added.length, gone: c.gone.length } : {}),
        ...(found?.others.length ? { olderScans: found.others } : {}),
      },
      null,
      2,
    ),
  );
}

async function show(args) {
  const opts = parse(args);
  const found = (await findScan(opts.folder)) || fail(`no scan covers ${opts.folder}; run update first`);
  const { root, index } = found;
  const rel = toRel(root, opts.folder);
  if (!index.dirs[rel]) fail(`${rel} isn't in the scan from ${index.scannedAt.slice(0, 10)} (new since? run update)`);
  const agg = totals(index.dirs);
  const describeOne = (r) => {
    const t = agg(r);
    const rec = index.dirs[r];
    return {
      folder: r,
      files: t.files,
      ...nonZero(t.kinds),
      ...(t.bytes ? { size: size(t.bytes) } : {}),
      ...(years(t) ? { years: years(t) } : {}),
      ...(t.exported ? { exports: true } : {}),
      ...(rec.ours ? { techistack: rec.ours } : {}),
      ...(index.notes?.[r] ? { note: index.notes[r].text } : {}),
    };
  };
  const children = (r, d) =>
    d < 1
      ? undefined
      : (index.dirs[r].dirs || []).map((c) => {
          const cr = join(r, c);
          const sub = children(cr, d - 1);
          return { ...describeOne(cr), ...(sub?.length ? { subfolders: sub } : {}) };
        });
  console.log(JSON.stringify({ scannedAt: index.scannedAt, ...describeOne(rel), ownFiles: index.dirs[rel].exts, subfolders: children(rel, opts.depth) }, null, 2));
}

async function note(args) {
  const opts = parse(args);
  if (opts.extra === undefined) fail('usage: note <folder> "<text>"');
  const found = (await findScan(opts.folder)) || fail(`no scan covers ${opts.folder}; run update first`);
  const { scanDir, index } = found;
  const rel = toRel(found.root, opts.folder);
  if (!index.dirs[rel]) fail(`${rel} isn't in the scan yet; run update first`);
  index.notes ??= {};
  if (opts.extra.trim()) index.notes[rel] = { text: opts.extra.trim(), at: now() };
  else delete index.notes[rel];
  const written = await write(scanDir, index);
  console.log(JSON.stringify({ folder: rel, note: index.notes[rel]?.text ?? null, ...written }, null, 2));
}

/** A word or phrase as a whole word in `hay`; "cars" finds "car" and the other way round. */
function matches(hay, word) {
  const stem = word.length > 3 ? word.replace(/s$/, "") : word;
  const esc = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}s?($|[^\\p{L}\\p{N}])`, "iu").test(hay);
}

async function find(args) {
  const [folderArg, ...words] = args;
  if (!folderArg || !words.length) fail("usage: find <folder> <word>...");
  const folder = path.resolve(folderArg);
  const found = (await findScan(folder)) || fail(`no scan covers ${folder}; run update first`);
  const { root, index } = found;
  const under = toRel(root, folder);
  const terms = words.flatMap((w) => w.toLowerCase().split(/,/)).map((w) => w.trim()).filter(Boolean);
  const hits = new Map(); // by file, the newest curation's entry
  let curations = 0;
  for (const [rel, rec] of Object.entries(index.dirs)) {
    if (under !== "." && rel !== under && !rel.startsWith(`${under}/`)) continue;
    for (const o of (rec.ours || []).filter((x) => x.kind === "curation")) {
      const dir = path.join(toAbs(root, rel), o.name);
      for (const f of (await fs.readdir(dir).catch(() => [])).filter((n) => n.endsWith(".json") && !n.startsWith("."))) {
        let data;
        try {
          data = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
        } catch {
          continue;
        }
        if (data.kind !== "curation") continue;
        curations++;
        // Where the frames are: the source as written, or the folder the effort sits in (a moved drive).
        const base = existsSync(data.source?.folder ?? "") ? data.source.folder : path.dirname(dir);
        for (const fr of data.frames || []) {
          const keywords = fr.notes?.keywords ?? fr.notes?.tags ?? [];
          const hay = [...keywords, ...(fr.notes?.text ?? []), fr.notes?.caption ?? ""].join(" | ");
          if (!terms.every((t) => matches(hay, t))) continue;
          const file = path.join(base, fr.file);
          const prev = hits.get(file);
          if (prev && prev.created > data.created) continue;
          hits.set(file, {
            file,
            folder: toRel(root, path.dirname(file)),
            n: fr.n,
            ...(fr.notes?.caption ? { caption: fr.notes.caption } : {}),
            keywords,
            ...(fr.notes?.text?.length ? { text: fr.notes.text } : {}),
            curation: path.join(rel, o.name),
            exported: (data.selections || []).filter((sel) => sel.frames?.includes(fr.n)).map((sel) => path.join(rel, o.name, sel.folder)),
            created: data.created,
          });
        }
      }
    }
  }
  const frames = [...hits.values()].sort((a, b) => a.folder.localeCompare(b.folder) || a.n - b.n).map(({ created, ...h }) => h);
  console.log(
    JSON.stringify(
      {
        words: terms,
        scannedAt: index.scannedAt,
        curations,
        found: frames.length,
        ...(curations ? {} : { note: "nothing here has been curated yet: keywords come from /curate's catalogue" }),
        frames,
      },
      null,
      2,
    ),
  );
}

const [cmd, ...rest] = process.argv.slice(2);
const commands = { status, update, show, note, find };
if (!commands[cmd]) fail("commands: status, update, show, note, find (see the header of this file)");
await commands[cmd](rest);
