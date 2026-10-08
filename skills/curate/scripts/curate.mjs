#!/usr/bin/env node
/**
 * A curation effort, on disk. Every /curate run opens a new
 * `_curate_YYYY-MM-DD[-n]` folder next to the work and keeps everything in it:
 * its contact sheets (each in its own contactsheet_… folder), the curator's
 * report (one .md) and the same as data (.json). Each export the user asks for becomes its own
 * `selection_YYYY-MM-DD[-n]` folder inside. Any later session or agent can pick
 * the effort up from the .json.
 *
 *   node curate.mjs measure <folder>
 *     how big it is (frames, shoots, pages) and both ways in; writes nothing.
 *     Whoever curates decides whether they can really look at all of it.
 *   node curate.mjs open <folder> [--name <subject>] [--review]
 *     → then: contactsheet.mjs sheet <folder> --max all --out <_curate folder>
 *     --review when it's more than can be looked at frame by frame: a scan
 *     snapshot and a sampled sheet inside the effort, a report on the
 *     archive, and which folders to curate next.
 *   node curate.mjs next <review _curate folder> [<folder>...]
 *     "go": opens an effort for each folder the review proposed (or those given)
 *   node curate.mjs write <_curate folder> --report <draft.md> [--plan <plan.json>]
 *     a plan with an article also lays it out as the article PDF (A4)
 *   node curate.mjs select <_curate folder> (<n|file>... | --set <key> [<n>...]) [--preset original|large|web|small]
 *   node curate.mjs pdf <_curate folder> [--paper a4|letter]
 *     the article PDF again, e.g. on Letter
 *   node curate.mjs status <_curate folder>
 *   node curate.mjs leave-out <_curate folder> <n|file>... [--why "<reason>"] [--undo]
 *     leave frames out (another shoot, a test, a duplicate export): never
 *     deleted or moved, but off every later sheet, set and export of this
 *     folder, until --undo brings them back
 *
 * Never touches the originals: they're only read. Every folder it makes is
 * new, and it never writes outside its own `_curate_…` folder.
 */

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { renderArticle } from "./article.mjs";

const run = promisify(execFile);
const MARKER = "<!-- curate:report -->";
const CREDIT = "[/techistack](https://github.com/alexbeltechi/techistack)";
const CREDIT_BLOCK = `---\n\n<sub>${CREDIT}</sub>`;
const CURATE_DIR = /^_curate_\d{4}-\d{2}-\d{2}(-\d+)?$/;
const OURS = /^(_curate|_scan|contactsheet|selection)_\d{4}-\d{2}-\d{2}(-\d+)?$/;
const PHOTO = /\.(jpe?g|png|webp|tiff?|avif|gif|heic|heif|nef|cr2|cr3|arw|dng|raf|orf|rw2)$/i;
const VIEWABLE = /\.(jpe?g|png|webp|tiff?|avif|gif|heic|heif)$/i;
/** About as many frames as can really be looked at in one sitting (~15 contact-sheet pages). */
/** About how many frames a contact sheet page holds. */
const PER_PAGE = 16;

function fail(msg) {
  console.error(`curate: ${msg}`);
  process.exit(1);
}

const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};
const commonParent = (dirs) => {
  let base = dirs[0];
  while (!dirs.every((d) => inside(d, base))) base = path.dirname(base);
  return base;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const now = () => new Date().toISOString();
const readJson = async (file) => {
  const text = await fs.readFile(file, "utf8").catch(() => fail(`can't read ${file}`));
  try {
    return JSON.parse(text);
  } catch (err) {
    fail(`${file} isn't valid JSON: ${err.message}`);
  }
};

/** A fresh `<prefix>_YYYY-MM-DD` folder; never reuses one. */
async function newDir(parent, prefix) {
  for (let i = 1; ; i++) {
    const dir = path.join(parent, `${prefix}_${today()}${i > 1 ? `-${i}` : ""}`);
    try {
      await fs.mkdir(dir);
      return dir;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
  }
}

/** Folders holding photos, and how many viewable frames, skipping our own output folders (but noting curations). */
async function photoDirs(dir, out = new Set(), count = { frames: 0, curations: [] }) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory() && CURATE_DIR.test(e.name)) count.curations.push(path.join(dir, e.name));
    if (e.name.startsWith(".") || OURS.test(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await photoDirs(full, out, count);
    else if (PHOTO.test(e.name)) {
      out.add(dir);
      if (VIEWABLE.test(e.name)) count.frames++;
    }
  }
  return { dirs: out, frames: count.frames, curations: count.curations };
}

/** Safe in a file name, still readable: "Ștefan & Ana — nuntă" → "Stefan-Ana-nunta". */
const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}.+_-]+/gu, "-")
    .replace(/^[-.]+|-+$/g, "") || "work";

/** "Aug" alone says little, "2025-Aug" does; "_export" says nothing, its shoot folder does. */
function sourceLabel(folder) {
  const base = path.basename(folder);
  const parent = path.basename(path.dirname(folder));
  if (/^[_\s-]*(exports?|selects?|selection|finals?|edits?|jpe?gs?|web|out)$/i.test(base)) return parent;
  const vague = base.length <= 4 || /^\d+$/.test(base) || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*$/i.test(base);
  return vague ? `${parent}-${base}` : base;
}

/** The effort in a curate folder: refuses anything that isn't one of ours. Picks up its contact sheet. */
async function load(folder) {
  const dir = path.resolve(folder);
  if (!CURATE_DIR.test(path.basename(dir))) fail(`${dir} isn't a _curate_YYYY-MM-DD folder`);
  const names = await fs.readdir(dir);
  let effort;
  // Hidden files are skipped: external drives add `._name.json` shadow copies (macOS AppleDouble).
  for (const f of names.filter((n) => n.endsWith(".json") && !n.startsWith("."))) {
    let data;
    try {
      data = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
    } catch {
      continue; // not ours
    }
    if (data.kind === "curation") effort = { dir, data, dataPath: path.join(dir, f), reportPath: path.join(dir, `${data.id}.md`) };
  }
  if (!effort) fail(`no curation data in ${dir}; start with \`open\``);
  if (!effort.data.frames.length) {
    // The newest contact sheet in the effort: its own contactsheet_… folders (or loose, from older runs).
    const sheetDirs = names.filter((n) => /^contactsheet_\d{4}-\d{2}-\d{2}(-\d+)?$/.test(n)).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
    let sheetFile = null;
    for (const d of sheetDirs.reverse()) {
      const json = (await fs.readdir(path.join(dir, d))).find((n) => n.endsWith(".json") && !n.startsWith("."));
      if (json) {
        sheetFile = path.join(d, json);
        break;
      }
    }
    sheetFile ??= names.find((n) => n.startsWith("contactsheet_") && n.endsWith(".json"));
    if (sheetFile) {
      const sheet = JSON.parse(await fs.readFile(path.join(dir, sheetFile), "utf8"));
      effort.data.source.sheet = sheet.id ?? sheetFile.replace(/\.json$/, "");
      effort.data.source.frames = sheet.total;
      effort.data.frames = sheet.frames.map((f) => ({ n: f.n, file: path.relative(effort.data.source.folder, f.path), orientation: f.orientation ?? null, capturedAt: f.capturedAt ?? null }));
      effort.data.history.push({ at: now(), event: `contact sheet ${effort.data.source.sheet} attached` });
      await save(effort);
    }
  }
  return effort;
}

const save = (effort) => fs.writeFile(effort.dataPath, JSON.stringify(effort.data, null, 2));

function needFrames(effort) {
  if (!effort.data.frames.length) fail(`no contact sheet in ${effort.dir} yet: run contactsheet.mjs sheet <folder> --max all --out "${effort.dir}"`);
}

const isFrameFile = (effort, name) =>
  effort.data.frames.some((f) => [path.basename(f.file), path.basename(f.file, path.extname(f.file))].some((x) => x.toLowerCase() === name.toLowerCase()));

/** Frame numbers, or file names ("000058", "000058.JPG"), → sheet numbers. */
function resolve(effort, list) {
  needFrames(effort);
  const byN = new Map(effort.data.frames.map((f) => [f.n, f]));
  const byName = new Map();
  for (const f of effort.data.frames) {
    const base = path.basename(f.file).toLowerCase();
    byName.set(base, f.n);
    byName.set(base.replace(/\.[^.]+$/, ""), f.n);
  }
  return list.map((x) => {
    const v = typeof x === "object" ? x.n : x;
    const n = /^\d+$/.test(String(v)) && byN.has(Number(v)) ? Number(v) : byName.get(String(v).toLowerCase());
    if (!n) fail(`"${v}" is neither a frame number (1–${effort.data.frames.length}) nor a file on sheet ${effort.data.source.sheet}`);
    return n;
  });
}

/** Frames left out of this effort, by sheet number (a left-out frame inherited from before isn't on the sheet at all). */
function leftOutNumbers(effort) {
  const out = new Map();
  for (const o of effort.data.leftOut || []) {
    const frame = effort.data.frames.find((f) => f.file === o.file);
    if (frame) out.set(frame.n, o);
  }
  return out;
}

function refuseLeftOut(effort, numbers, where) {
  const left = leftOutNumbers(effort);
  const hit = numbers.filter((n) => left.has(n));
  if (hit.length) fail(`${where}: frame${hit.length > 1 ? "s" : ""} ${hit.join(", ")} ${hit.length > 1 ? "are" : "is"} left out (${hit.map((n) => left.get(n).why || "no reason given").join("; ")}); bring back with leave-out --undo`);
}

/**
 * What earlier curations left out inside `folder`: every `_curate_…` in a
 * folder above it, in it, or below it (`below`, found on the walk), oldest
 * first, so a later --undo wins. Absolute path → entry.
 */
async function inheritedLeftOut(folder, below = []) {
  const dirs = [...below];
  for (let dir = path.dirname(folder); ; dir = path.dirname(dir)) {
    for (const name of (await fs.readdir(dir).catch(() => [])).filter((n) => CURATE_DIR.test(n))) dirs.push(path.join(dir, name));
    if (path.dirname(dir) === dir) break;
  }
  const efforts = [];
  for (const d of new Set(dirs)) {
    for (const f of (await fs.readdir(d).catch(() => [])).filter((n) => n.endsWith(".json") && !n.startsWith("."))) {
      try {
        const data = JSON.parse(await fs.readFile(path.join(d, f), "utf8"));
        if (data.kind === "curation" && (data.leftOut?.length || data.broughtBack?.length)) efforts.push(data);
      } catch {
        // not ours
      }
    }
  }
  const found = new Map();
  const events = efforts.flatMap((d) => [
    ...(d.leftOut || []).map((o) => ({ at: o.at, abs: path.join(d.source.folder, o.file), entry: { ...o, from: o.from ?? d.id } })),
    ...(d.broughtBack || []).map((o) => ({ at: o.at, abs: path.join(d.source.folder, o.file), back: true })),
  ]);
  for (const e of events.sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
    if (!inside(e.abs, folder)) continue;
    if (e.back) found.delete(e.abs);
    else found.set(e.abs, e.entry);
  }
  return found;
}

async function open(args) {
  const result = await openEffort(path.resolve(args[0] || fail("usage: open <folder> [--name subject] [--review]")), args);
  console.log(JSON.stringify(result, null, 2));
}

/** How big a folder is, and the two ways in. Writes nothing; the decision is whoever curates. */
async function measure(args) {
  const folder = path.resolve(args[0] || fail("usage: measure <folder>"));
  const found = await photoDirs(folder).catch(() => fail(`can't read ${folder}`));
  if (!found.dirs.size) fail(`no photos in ${folder}`);
  const shoots = new Set([...found.dirs].map((d) => shootOf(d, folder))).size;
  console.log(
    JSON.stringify(
      {
        folder,
        frames: found.frames,
        folders: found.dirs.size,
        shoots,
        pages: Math.ceil(found.frames / PER_PAGE),
        decide: "Can you really look at every one of these frames? Then curate it whole. If not, review it: a snapshot of every shoot, then which folders to curate.",
        curate: [`curate.mjs open "${folder}"`, `contactsheet.mjs sheet "${folder}" --max all --out <_curate folder>`],
        review: [`curate.mjs open "${folder}" --review`, `scan.mjs update "${folder}" --out <_curate folder>`, `contactsheet.mjs sheet "${folder}" --sample --out <_curate folder>`],
      },
      null,
      2,
    ),
  );
}

/** A dated shoot folder below the root, else the folder itself (as contactsheet --sample groups them). */
const DATED = /^(\d{4}[-_]\d{2}[-_]\d{2}|\d{2}[-_]\d{2}[-_]\d{4}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{4})/i;
function shootOf(dir, root) {
  const parts = path.relative(root, dir).split(path.sep).filter(Boolean);
  const at = parts.findIndex((p) => DATED.test(p));
  return at > -1 ? parts.slice(0, at + 1).join("/") : parts.join("/");
}

/** A new effort for one folder: a curation, or with --review a review of a big archive. */
async function openEffort(folder, args = []) {
  const found = await photoDirs(folder).catch(() => fail(`can't read ${folder}`));
  const dirs = [...found.dirs];
  if (!dirs.length) fail(`no photos in ${folder}`);
  // Too much to look at frame by frame: review the archive first, then curate folder by folder.
  const mode = args.includes("--review") ? "review" : "curation";
  const source = commonParent(dirs);
  const nameAt = args.indexOf("--name");
  const subject = slug((nameAt > -1 && args[nameAt + 1]) || sourceLabel(folder));
  // Frames an earlier curation left out stay out: off the sheet, so off everything after it.
  const inherited = [...(await inheritedLeftOut(source, found.curations))]
    .filter(([abs]) => existsSync(abs))
    .map(([abs, o]) => ({ file: path.relative(source, abs), why: o.why ?? null, at: o.at, from: o.from }));
  const dir = await newDir(source, "_curate");
  const id = `${path.basename(dir)}_${subject}`;
  const data = {
    kind: "curation",
    id,
    subject,
    created: now(),
    mode, // curation: every frame; review: a sampled look at a big archive, ending in which folders to curate
    status: "open", // open → proposed → selected
    source: { folder: source, asked: folder, sheet: null, frames: null, viewable: found.frames, folders: dirs.length },
    frames: [],
    curator: null,
    impression: null,
    story: null,
    brief: null,
    summary: null,
    sets: [],
    nearDuplicates: [],
    questions: [],
    review: null,
    selections: [],
    leftOut: inherited,
    broughtBack: [],
    history: [{ at: now(), event: `opened (${mode}, ${found.frames} viewable frames in ${dirs.length} folders)${inherited.length ? `, ${inherited.length} left out from before` : ""}` }],
  };
  const dataPath = path.join(dir, `${id}.json`);
  await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
  // What's left to look at once the left-out frames are off the sheet.
  const frames = found.frames - inherited.filter((o) => VIEWABLE.test(o.file)).length;
  const exclude = inherited.length ? ` --exclude "${[...new Set(inherited.map((o) => path.basename(o.file)))].join(",")}"` : "";
  const sheet = (mode === "review" ? "--sample" : "--max all") + exclude;
  return {
    folder: dir,
    id,
    mode,
    frames,
    pages: mode === "review" ? null : Math.ceil(frames / PER_PAGE),
    folders: dirs.length,
    ...(inherited.length ? { leftOut: inherited.map((o) => ({ file: o.file, why: o.why })) } : {}),
    report: path.join(dir, `${id}.md`),
    data: dataPath,
    // A review keeps its own snapshot of the archive inside it, then looks at a sample.
    next: [...(mode === "review" ? [`scan.mjs update "${folder}" --out "${dir}"`] : []), `contactsheet.mjs sheet "${folder}" ${sheet} --out "${dir}"`],
  };
}

/** "Go": a curation for each folder a review proposed. Each one's size is in its output, to decide on. */
async function next(args) {
  const review = await load(args[0] || fail("usage: next <review _curate folder> [<folder>...]"));
  if (review.data.mode !== "review") fail(`${review.dir} is a curation, not a review`);
  const folders = args.slice(1).filter((a) => !a.startsWith("--")).length ? args.slice(1).filter((a) => !a.startsWith("--")) : review.data.review?.next || [];
  if (!folders.length) fail("the review proposes no folders yet: write its plan with review.next, or name the folders");
  const base = review.data.source.folder;
  const opened = [];
  for (const f of folders) {
    const folder = path.resolve(base, f);
    if (!existsSync(folder)) fail(`"${f}" isn't in ${base}`);
    opened.push({ asked: f, ...(await openEffort(folder)) });
  }
  const log = opened.map((o) => ({ folder: o.asked, effort: path.relative(base, o.folder), mode: o.mode, at: now() }));
  review.data.review = { ...review.data.review, opened: [...(review.data.review?.opened || []), ...log] };
  review.data.history.push({ at: now(), event: `opened ${opened.length} curation${opened.length > 1 ? "s" : ""}: ${folders.join(", ")}` });
  await save(review);
  console.log(JSON.stringify(opened, null, 2));
}

async function write(args) {
  const effort = await load(args[0] || fail("usage: write <_curate folder> --report <draft.md> [--plan <plan.json>]"));
  const at = (flag) => (args.indexOf(flag) > -1 ? path.resolve(args[args.indexOf(flag) + 1]) : null);
  const reportDraft = at("--report");
  const planPath = at("--plan");
  if (!reportDraft && !planPath) fail("give --report, --plan or both");

  if (planPath) {
    const plan = await readJson(planPath);
    for (const set of plan.sets || []) {
      if (!set.key || !Array.isArray(set.frames)) fail("every set needs a key and frames");
      set.frames = resolve(effort, set.frames);
    }
    for (const group of plan.nearDuplicates || []) resolve(effort, group.frames || group);
    for (const section of plan.article?.sections || []) section.frames = resolve(effort, section.frames || []);
    for (const set of plan.sets || []) refuseLeftOut(effort, set.frames, `set ${set.key}`);
    for (const section of plan.article?.sections || []) refuseLeftOut(effort, section.frames, `article section "${section.heading ?? ""}"`);
    if (plan.review) {
      // Which folders are worth their own curation: each must exist under the source.
      for (const f of plan.review.folders || []) {
        if (!f.folder) fail("every review folder needs a folder (relative to the source)");
        if (!existsSync(path.join(effort.data.source.folder, f.folder))) fail(`review folder "${f.folder}" isn't in ${effort.data.source.folder}`);
        if (f.frames) f.frames = resolve(effort, f.frames);
      }
      for (const f of plan.review.next || []) if (!existsSync(path.join(effort.data.source.folder, f))) fail(`next folder "${f}" isn't in ${effort.data.source.folder}`);
    }
    for (const key of ["curator", "impression", "story", "brief", "summary", "sets", "nearDuplicates", "questions", "article", "review"]) if (key in plan) effort.data[key] = plan[key];
    // Per-frame notes: what the curator saw in each frame, kept for search and later context.
    for (const entry of plan.catalogue || []) {
      const [n] = resolve(effort, [entry.n ?? entry.file]);
      const frame = effort.data.frames.find((f) => f.n === n);
      const { n: _n, file: _file, ...notes } = entry;
      frame.notes = notes;
    }
    if (effort.data.status === "open") effort.data.status = "proposed";
    effort.data.history.push({ at: now(), event: "plan written" });
  }
  if (reportDraft) {
    const body = await fs.readFile(reportDraft, "utf8");
    if (!body.trimStart().startsWith(MARKER)) fail(`the report must start with ${MARKER}`);
    await fs.writeFile(effort.reportPath, body.includes(CREDIT) ? body : `${body.trimEnd()}\n\n${CREDIT_BLOCK}\n`);
    effort.data.history.push({ at: now(), event: "report written" });
  }
  // A curation's article becomes its PDF every time the plan is written, so it's never a step to forget.
  let article = null;
  if (planPath && effort.data.article?.sections?.length) {
    const result = await renderArticle(effort.data, path.join(effort.dir, `${effort.data.id}.pdf`)).catch((err) => fail(err.message));
    article = result.file;
    effort.data.history.push({ at: now(), event: "article pdf written (a4)" });
  }
  await save(effort);
  console.log(JSON.stringify({ report: effort.reportPath, data: effort.dataPath, ...(article ? { pdf: article } : {}), status: effort.data.status }, null, 2));
}

/** sharp can't read HEIC or raw on most builds; macOS sips converts a full-size copy into tmp. */
async function readable(file, tmp) {
  if (/\.(jpe?g|png|webp|tiff?|avif|gif)$/i.test(file)) return file;
  if (process.platform !== "darwin") return null;
  const copy = path.join(tmp, `${path.basename(file, path.extname(file))}-${Math.random().toString(36).slice(2, 7)}.jpg`);
  await run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "100", file, "--out", copy]);
  return copy;
}

/** Export quality, by name. `original` copies the file as it is; the rest are fresh JPEGs. */
const PRESETS = {
  original: { label: "original files, untouched (format, size and metadata as they are)" },
  large: { size: null, quality: 92, label: "full resolution JPEG, quality 92" },
  web: { size: 2560, quality: 88, label: "2560 px JPEG, quality 88" },
  small: { size: 1200, quality: 82, label: "1200 px JPEG, quality 82" },
};

/** A frame's caption, keywords and readable text, from its catalogue entry (older efforts had `tags`). */
function searchable(notes) {
  if (!notes) return {};
  const keywords = notes.keywords ?? notes.tags;
  return {
    ...(notes.caption ? { caption: notes.caption } : {}),
    ...(keywords?.length ? { keywords } : {}),
    ...(notes.text?.length ? { text: notes.text } : {}),
  };
}

async function select(args) {
  const effort = await load(args[0] || fail("usage: select <_curate folder> (<n|file>... | --set <key>) [--preset original|large|web|small]"));
  const opts = { preset: "web", picks: [] };
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--preset") opts.preset = args[++i];
    else if (a === "--size") opts.size = Number(args[++i]);
    else if (a === "--quality") opts.quality = Number(args[++i]);
    else if (a === "--set") opts.set = args[++i];
    // "7, 12 15" splits into numbers; a file name with spaces in it stays whole.
    else opts.picks.push(...(isFrameFile(effort, a) ? [a] : a.split(/[,\s]+/).filter(Boolean)));
  }
  const preset = PRESETS[opts.preset] || fail(`--preset is one of ${Object.keys(PRESETS).join(", ")}`);
  const copy = opts.preset === "original";
  const size = opts.size ?? preset.size;
  const quality = opts.quality ?? preset.quality;
  if (opts.size !== undefined && !(Number.isInteger(size) && size > 0)) fail("--size is a long edge in pixels, above 0");
  if (opts.quality !== undefined && !(Number.isInteger(quality) && quality >= 1 && quality <= 100)) fail("--quality is 1 to 100");

  let numbers;
  if (opts.set) {
    const set = effort.data.sets.find((s) => s.key === opts.set) || fail(`no set "${opts.set}" in the plan (${effort.data.sets.map((s) => s.key).join(", ") || "none yet"})`);
    numbers = resolve(effort, opts.picks.length ? opts.picks : set.frames);
  } else {
    if (!opts.picks.length) fail("give frame numbers, file names or --set <key>");
    numbers = resolve(effort, opts.picks);
  }
  if (new Set(numbers).size !== numbers.length) fail("a frame is picked twice");
  refuseLeftOut(effort, numbers, "select");

  const out = await newDir(effort.dir, "selection");
  const byN = new Map(effort.data.frames.map((f) => [f.n, f]));
  const label = opts.set ? `${effort.data.subject}_${opts.set}` : effort.data.subject;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "curate-"));
  const files = [];
  for (const [i, n] of numbers.entries()) {
    const frame = byN.get(n);
    const src = path.join(effort.data.source.folder, frame.file);
    const stem = path.basename(frame.file, path.extname(frame.file));
    const order = String(i + 1).padStart(2, "0");
    if (copy) {
      // A byte-for-byte copy; the original is only read.
      const name = `${label}_${order}_${stem}${path.extname(frame.file)}`;
      try {
        await fs.copyFile(src, path.join(out, name), fs.constants.COPYFILE_EXCL);
        files.push({ order: i + 1, n, source: frame.file, file: name, bytes: (await fs.stat(path.join(out, name))).size });
      } catch (err) {
        files.push({ order: i + 1, n, source: frame.file, file: null, error: `can't copy: ${err.code || err.message}` });
      }
      continue;
    }
    const name = `${label}_${order}_${stem}.jpg`;
    const input = await readable(src, tmp).catch(() => null);
    if (!input) {
      files.push({ order: i + 1, n, source: frame.file, file: null, error: "can't read this format here" });
      continue;
    }
    try {
      // Orientation applied, transparency on white, colour in sRGB, metadata (incl. location) left behind.
      let img = sharp(input).rotate();
      if (size) img = img.resize(size, size, { fit: "inside", withoutEnlargement: true });
      const info = await img
        .flatten({ background: "#ffffff" })
        .toColorspace("srgb")
        .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" })
        .toFile(path.join(out, name));
      files.push({ order: i + 1, n, source: frame.file, file: name, width: info.width, height: info.height, bytes: info.size });
    } catch {
      files.push({ order: i + 1, n, source: frame.file, file: null, error: "can't read this file (broken or unsupported)" });
    }
  }
  // Only our own temp folder; nothing in the source is ever removed.
  await fs.rm(tmp, { recursive: true, force: true });
  // What the curator saw travels with each file, so an upload can carry it into search and alt text.
  for (const f of files) Object.assign(f, searchable(byN.get(f.n).notes));

  const settings = copy
    ? { preset: "original", note: preset.label }
    : { preset: opts.preset, longEdge: size ?? "original", quality, format: "jpeg", colour: "sRGB", metadata: "stripped" };
  const set = opts.set ? effort.data.sets.find((s) => s.key === opts.set) : null;
  const selection = { folder: path.basename(out), at: now(), set: opts.set ?? null, title: set?.title ?? null, frames: numbers, settings, files };
  await fs.writeFile(
    path.join(out, "selection.json"),
    JSON.stringify({ id: `${path.basename(out)}_${label}`, curation: effort.data.id, description: set?.description ?? effort.data.summary ?? null, ...selection }, null, 2),
  );
  effort.data.selections.push(selection);
  effort.data.status = "selected";
  effort.data.history.push({ at: now(), event: `exported ${selection.folder} (${opts.preset})` });
  await save(effort);

  // The report gets the selection appended, so it still tells the whole story.
  const how = copy ? preset.label : `${size ? `${size} px` : "full resolution"} JPEG q${quality}, sRGB, metadata stripped`;
  const lines = [
    "",
    `## Selection: \`${selection.folder}\`${set ? ` (set ${set.key}, ${set.title})` : ""}`,
    "",
    `Frames ${numbers.join(" · ")}, as ${how}:`,
    "",
    ...files.map((f) => `${f.order}. \`${f.file ?? `(${f.error})`}\` ← frame ${f.n}, \`${f.source}\``),
    "",
  ];
  // Above the credit line, so that stays last.
  const report = await fs.readFile(effort.reportPath, "utf8").catch(() => "");
  const at = report.lastIndexOf(CREDIT_BLOCK);
  const body = at > -1 ? report.slice(0, at).trimEnd() : report.trimEnd();
  await fs.writeFile(effort.reportPath, `${body}\n${lines.join("\n")}${at > -1 ? `\n${CREDIT_BLOCK}\n` : ""}`);

  const total = files.reduce((s, f) => s + (f.bytes || 0), 0);
  console.log(JSON.stringify({ folder: out, preset: opts.preset, files: files.map((f) => f.file || `(${f.error}) ${f.source}`), totalKB: Math.round(total / 1024) }, null, 2));
}

async function pdf(args) {
  const effort = await load(args[0] || fail("usage: pdf <_curate folder> [--paper a4|letter]"));
  const at = args.indexOf("--paper");
  const paper = at > -1 ? args[at + 1] : "a4";
  if (!["a4", "letter"].includes(paper)) fail("--paper is a4 or letter");
  const file = path.join(effort.dir, `${effort.data.id}.pdf`);
  const result = await renderArticle(effort.data, file, { paper }).catch((err) => fail(err.message));
  effort.data.history.push({ at: now(), event: `article pdf written (${paper})` });
  await save(effort);
  console.log(JSON.stringify({ ...result, kb: Math.round(result.bytes / 1024) }, null, 2));
}

async function status(args) {
  const { data, dir } = await load(args[0] || fail("usage: status <_curate folder>"));
  console.log(
    JSON.stringify(
      {
        folder: dir,
        id: data.id,
        mode: data.mode ?? "curation",
        status: data.status,
        sheet: data.source.sheet,
        ...(data.review?.next ? { curateNext: data.review.next } : {}),
        sets: data.sets.map((s) => ({ key: s.key, title: s.title, frames: s.frames })),
        questions: data.questions,
        selections: data.selections.map((s) => ({ folder: s.folder, set: s.set, frames: s.frames })),
        ...(data.leftOut?.length ? { leftOut: data.leftOut.map((o) => ({ file: o.file, why: o.why })) } : {}),
      },
      null,
      2,
    ),
  );
}

/**
 * Leave frames out without touching them: recorded in the effort, taken out of
 * its sets and article, and carried into every later curation of this folder
 * (and its sheet's --exclude). --undo brings them back.
 */
async function leaveOut(args) {
  const effort = await load(args[0] || fail('usage: leave-out <_curate folder> <n|file>... [--why "<reason>"] [--undo]'));
  needFrames(effort);
  const opts = { why: null, undo: false, picks: [] };
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--why") opts.why = args[++i] ?? fail("--why needs a reason");
    else if (a === "--undo") opts.undo = true;
    else opts.picks.push(...(isFrameFile(effort, a) ? [a] : a.split(/[,\s]+/).filter(Boolean)));
  }
  if (!opts.picks.length) fail("give frame numbers or file names");
  const numbers = [...new Set(resolve(effort, opts.picks))];
  const byN = new Map(effort.data.frames.map((f) => [f.n, f]));
  effort.data.leftOut ??= [];
  effort.data.broughtBack ??= [];
  const changed = [];
  for (const n of numbers) {
    const file = byN.get(n).file;
    effort.data.leftOut = effort.data.leftOut.filter((o) => o.file !== file);
    effort.data.broughtBack = effort.data.broughtBack.filter((o) => o.file !== file);
    if (opts.undo) effort.data.broughtBack.push({ file, at: now() });
    else effort.data.leftOut.push({ file, why: opts.why, at: now() });
    changed.push({ n, file });
  }
  // Out of this effort's plan too, so nothing already proposed still shows them.
  const removed = [];
  if (!opts.undo) {
    const gone = new Set(numbers);
    for (const set of effort.data.sets || []) {
      const hit = set.frames.filter((n) => gone.has(n));
      if (!hit.length) continue;
      set.frames = set.frames.filter((n) => !gone.has(n));
      if (gone.has(set.opening)) set.opening = set.frames[0] ?? null;
      if (gone.has(set.ending)) set.ending = set.frames.at(-1) ?? null;
      removed.push(`set ${set.key}: ${hit.join(", ")}`);
    }
    for (const section of effort.data.article?.sections || []) {
      const hit = section.frames.filter((n) => gone.has(n));
      if (!hit.length) continue;
      section.frames = section.frames.filter((n) => !gone.has(n));
      removed.push(`article "${section.heading ?? ""}": ${hit.join(", ")}`);
    }
  }
  const verb = opts.undo ? "brought back" : "left out";
  effort.data.history.push({ at: now(), event: `${verb} ${numbers.join(", ")}${opts.why ? ` (${opts.why})` : ""}` });
  await save(effort);
  let pdf = null;
  if (removed.some((r) => r.startsWith("article")) && effort.data.article?.sections?.some((s) => s.frames.length)) {
    pdf = (await renderArticle(effort.data, path.join(effort.dir, `${effort.data.id}.pdf`)).catch((err) => fail(err.message))).file;
  }
  console.log(
    JSON.stringify(
      {
        [opts.undo ? "broughtBack" : "leftOut"]: changed,
        ...(opts.why ? { why: opts.why } : {}),
        ...(removed.length ? { removedFrom: removed } : {}),
        ...(pdf ? { pdf } : {}),
        note: opts.undo
          ? "back in: later curations of this folder show them again"
          : "nothing deleted or moved; later curations of this folder leave them off the sheet",
      },
      null,
      2,
    ),
  );
}

const [cmd, ...rest] = process.argv.slice(2);
const commands = { measure, open, next, write, select, pdf, status, "leave-out": leaveOut };
if (!commands[cmd]) fail("commands: measure, open, next, write, select, pdf, status, leave-out (see the header of this file)");
await commands[cmd](rest);
