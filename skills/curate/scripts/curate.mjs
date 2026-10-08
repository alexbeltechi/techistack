#!/usr/bin/env node
/**
 * A curation effort, on disk. Every /curate run opens a new
 * `_curate_YYYY-MM-DD[-n]` folder next to the work and keeps everything in it:
 * its contact sheets (each in its own contactsheet_… folder), the curator's
 * report (one .md) and the same as data (.json). Each export the user asks for becomes its own
 * `selection_YYYY-MM-DD[-n]` folder inside. Any later session or agent can pick
 * the effort up from the .json.
 *
 *   node curate.mjs open <folder> [--name <subject>]
 *     → then: contactsheet.mjs sheet <folder> --max all --out <_curate folder>
 *   node curate.mjs write <_curate folder> --report <draft.md> [--plan <plan.json>]
 *   node curate.mjs select <_curate folder> (<n|file>... | --set <key> [<n>...]) [--preset original|large|web|small]
 *   node curate.mjs pdf <_curate folder> [--paper a4|letter]
 *   node curate.mjs status <_curate folder>
 *
 * Never touches the originals: they're only read. Every folder it makes is
 * new, and it never writes outside its own `_curate_…` folder.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { renderArticle } from "./article.mjs";

const run = promisify(execFile);
const MARKER = "<!-- curate:report -->";
const CREDIT = "Made with [techistack](https://github.com/alexbeltechi/techistack)";
const CREDIT_BLOCK = `---\n\n<sub>${CREDIT}</sub>`;
const CURATE_DIR = /^_curate_\d{4}-\d{2}-\d{2}(-\d+)?$/;
const OURS = /^(_curate|contactsheet|selection)_\d{4}-\d{2}-\d{2}(-\d+)?$/;
const PHOTO = /\.(jpe?g|png|webp|tiff?|avif|gif|heic|heif|nef|cr2|cr3|arw|dng|raf|orf|rw2)$/i;

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

/** Folders holding photos, skipping our own output folders. */
async function photoDirs(dir, out = new Set()) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || OURS.test(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await photoDirs(full, out);
    else if (PHOTO.test(e.name)) out.add(dir);
  }
  return out;
}

/** Safe in a file name, still readable: "Ștefan & Ana — nuntă" → "Stefan-Ana-nunta". */
const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}.+_-]+/gu, "-")
    .replace(/^[-.]+|-+$/g, "") || "work";

/** "Aug" alone says little, "2025-Aug" does. */
function sourceLabel(folder) {
  const base = path.basename(folder);
  const vague = base.length <= 4 || /^\d+$/.test(base) || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*$/i.test(base);
  return vague ? `${path.basename(path.dirname(folder))}-${base}` : base;
}

/** The effort in a curate folder: refuses anything that isn't one of ours. Picks up its contact sheet. */
async function load(folder) {
  const dir = path.resolve(folder);
  if (!CURATE_DIR.test(path.basename(dir))) fail(`${dir} isn't a _curate_YYYY-MM-DD folder`);
  const names = await fs.readdir(dir);
  let effort;
  for (const f of names.filter((n) => n.endsWith(".json"))) {
    const data = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
    if (data.kind === "curation") effort = { dir, data, dataPath: path.join(dir, f), reportPath: path.join(dir, `${data.id}.md`) };
  }
  if (!effort) fail(`no curation data in ${dir}; start with \`open\``);
  if (!effort.data.frames.length) {
    // The newest contact sheet in the effort: its own contactsheet_… folders (or loose, from older runs).
    const sheetDirs = names.filter((n) => /^contactsheet_\d{4}-\d{2}-\d{2}(-\d+)?$/.test(n)).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
    let sheetFile = null;
    for (const d of sheetDirs.reverse()) {
      const json = (await fs.readdir(path.join(dir, d))).find((n) => n.endsWith(".json"));
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

async function open(args) {
  const folder = path.resolve(args[0] || fail("usage: open <folder> [--name subject]"));
  const dirs = [...(await photoDirs(folder).catch(() => fail(`can't read ${folder}`)))];
  if (!dirs.length) fail(`no photos in ${folder}`);
  const source = commonParent(dirs);
  const nameAt = args.indexOf("--name");
  const subject = slug((nameAt > -1 && args[nameAt + 1]) || sourceLabel(folder));
  const dir = await newDir(source, "_curate");
  const id = `${path.basename(dir)}_${subject}`;
  const data = {
    kind: "curation",
    id,
    subject,
    created: now(),
    status: "open", // open → proposed → selected
    source: { folder: source, asked: folder, sheet: null, frames: null },
    frames: [],
    curator: null,
    impression: null,
    story: null,
    brief: null,
    summary: null,
    sets: [],
    nearDuplicates: [],
    questions: [],
    selections: [],
    history: [{ at: now(), event: "opened" }],
  };
  const dataPath = path.join(dir, `${id}.json`);
  await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
  console.log(JSON.stringify({ folder: dir, id, report: path.join(dir, `${id}.md`), data: dataPath, next: `contactsheet.mjs sheet "${folder}" --max all --out "${dir}"` }, null, 2));
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
    for (const key of ["curator", "impression", "story", "brief", "summary", "sets", "nearDuplicates", "questions", "article"]) if (key in plan) effort.data[key] = plan[key];
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
  await save(effort);
  console.log(JSON.stringify({ report: effort.reportPath, data: effort.dataPath, status: effort.data.status }, null, 2));
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
        status: data.status,
        sheet: data.source.sheet,
        sets: data.sets.map((s) => ({ key: s.key, title: s.title, frames: s.frames })),
        questions: data.questions,
        selections: data.selections.map((s) => ({ folder: s.folder, set: s.set, frames: s.frames })),
      },
      null,
      2,
    ),
  );
}

const [cmd, ...rest] = process.argv.slice(2);
const commands = { open, write, select, pdf, status };
if (!commands[cmd]) fail("commands: open, write, select, pdf, status (see the header of this file)");
await commands[cmd](rest);
