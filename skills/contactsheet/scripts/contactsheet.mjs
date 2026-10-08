#!/usr/bin/env node
/**
 * Contact sheets for folders of photos, laid out like film proofs: numbered
 * frames with the number and a shortened filename climbing up each frame's
 * edge. Outputs a PDF (selectable text, markup on a phone) and a JPG preview.
 *
 * Never deletes, moves or edits anything in the source.
 *
 * Read-only on the source: files are only opened for reading, and the output
 * directory may not sit inside any source folder. Conversions (HEIC, raw
 * previews) go to a temp directory, never next to the originals.
 *
 *   node contactsheet.mjs scan <folder>...              what's there, per folder
 *   node contactsheet.mjs sheet <folder>... [options]    build the sheets
 *   node contactsheet.mjs pick <manifest.json> 3 7 12    frame numbers → files
 *
 * Options (sheet):
 *   --out <dir>       write somewhere else: outside the source folders, or a
 *                     /curate effort's `_curate_…` folder. A new dated
 *                     contactsheet_ folder is made inside it, so a rerun
 *                     never overwrites an earlier sheet
 *
 * By default each run writes a new folder `contactsheet_YYYY-MM-DD` (ISO 8601;
 * `-2`, `-3`… for more runs that day) inside the folder given, or inside the
 * folders' common parent when there are several. That new folder is the only
 * thing ever created in a source; existing files are never touched.
 *   --name <name>     what the sheet shows, in the filenames (default: the folder
 *                     name, with its parent when it's short, e.g. "2025-Aug")
 *   --max <n|all>     frames to show (default 20, evenly spaced across the set)
 *   --sample          a snapshot of a big archive: frames from every shoot,
 *                     more from bigger ones (1 from a handful, ~5 from
 *                     hundreds), from its exports when it has them; --max caps
 *                     the total
 *   --list <file>     a sheet of exactly these files (one path per line, in
 *                     order), e.g. a sample an agent chose across an archive
 *                     or the picks of several curations; no folder needed
 *   --paper <p>       3x4 (default) | a4 | letter
 *   --cols <n>        about how many portrait frames fit a row (default 4); rows
 *                     read left to right, each scaled to fill the width
 *   --format <f>      pdf | jpg | both (default both)
 *   --exclude <names> leave these files out, e.g. "000049,000050" (by name, with
 *                     or without extension); listed in the manifest as excluded
 *   --raw             also preview raw files that have no export (macOS sips;
 *                     ignores Lightroom/XMP edits)
 *   --depth <n>       how deep to look (default: unlimited)
 *
 * Each file is named after its sheet folder, its colour and what it shows, so
 * it makes sense on its own: contactsheetwhite_2026-10-08-3_2025-Aug.pdf (all
 * pages) and …_p01.jpg per page, the same on black as contactsheetblack_…,
 * and contactsheet_2026-10-08-3_2025-Aug.json (frame number → source file).
 */

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { PDFDocument, PDFString, StandardFonts, rgb, degrees } from "pdf-lib";

const run = promisify(execFile);

const IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".avif", ".gif"]);
const HEIC = new Set([".heic", ".heif"]);
const RAW = new Set([".nef", ".cr2", ".cr3", ".arw", ".dng", ".raf", ".orf", ".rw2"]);
const VIDEO = new Set([".mp4", ".mov", ".m4v", ".webm"]);

function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (IMAGE.has(ext)) return "image";
  if (HEIC.has(ext)) return "heic";
  if (RAW.has(ext)) return "raw";
  if (VIDEO.has(ext)) return "video";
  return null;
}

async function walk(dir, depth, out = []) {
  if (depth < 0) return out;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || SHEET_DIR.test(e.name) || CURATE_DIR.test(e.name) || SCAN_DIR.test(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, depth - 1, out);
    else if (e.isFile()) {
      const kind = kindOf(full);
      if (kind) out.push({ path: full, kind });
    }
  }
  return out;
}

const stem = (f) => path.basename(f, path.extname(f)).toLowerCase();

/** Folders whose name says they hold the photographer's own picks. */
const looksExported = (dir) => /(^|[_\s-])(export|exports|selection|select|final|edit|edits)/i.test(path.basename(dir));

async function scan(folders, depth) {
  const report = [];
  for (const folder of folders) {
    const files = await walk(folder, depth);
    const byDir = new Map();
    for (const f of files) {
      const d = path.dirname(f.path);
      if (!byDir.has(d)) byDir.set(d, { image: 0, heic: 0, raw: 0, video: 0 });
      byDir.get(d)[f.kind]++;
    }
    const viewable = new Set(files.filter((f) => f.kind !== "raw" && f.kind !== "video").map((f) => stem(f.path)));
    report.push({
      folder,
      totals: files.reduce((t, f) => ((t[f.kind] = (t[f.kind] || 0) + 1), t), {}),
      rawWithoutExport: files.filter((f) => f.kind === "raw" && !viewable.has(stem(f.path))).length,
      subfolders: [...byDir.entries()]
        .map(([dir, counts]) => ({ dir: path.relative(folder, dir) || ".", exported: looksExported(dir), ...counts }))
        .sort((a, b) => a.dir.localeCompare(b.dir)),
    });
  }
  return report;
}

function parseArgs(argv) {
  const opts = { max: null, paper: "3x4", format: "both", raw: false, depth: Infinity, folders: [], exclude: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--out") opts.out = next();
    else if (a === "--name") opts.name = next();
    else if (a === "--max") {
      const v = next();
      opts.max = v === "all" ? Infinity : Number(v);
    } else if (a === "--paper") opts.paper = next();
    else if (a === "--cols") opts.cols = Number(next());
    else if (a === "--format") opts.format = next();
    else if (a === "--depth") opts.depth = Number(next());
    else if (a === "--exclude") opts.exclude.push(...next().split(/[,\s]+/).filter(Boolean).map((x) => x.toLowerCase()));
    else if (a === "--raw") opts.raw = true;
    else if (a === "--sample") opts.sample = true;
    else if (a === "--list") opts.list = path.resolve(next());
    else opts.folders.push(path.resolve(a));
  }
  const whole = (v) => Number.isInteger(v) && v > 0;
  if (opts.max !== null && opts.max !== Infinity && !whole(opts.max)) throw new Error("--max is a number above 0, or all.");
  opts.max ??= opts.sample || opts.list ? Infinity : 20;
  if (opts.cols !== undefined && !whole(opts.cols)) throw new Error("--cols is a number above 0.");
  if (opts.depth !== Infinity && !(Number.isInteger(opts.depth) && opts.depth >= 0)) throw new Error("--depth is 0 or more.");
  return opts;
}

const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** Our own output folders, skipped when scanning so sheets never land on sheets. */
const SHEET_DIR = /^contactsheet_\d{4}-\d{2}-\d{2}(-\d+)?$/;
/** /curate's folders hold prepared copies; never show them as originals. */
const CURATE_DIR = /^_curate_\d{4}-\d{2}-\d{2}(-\d+)?$/;
/** /scan's index of the archive. */
const SCAN_DIR = /^_scan_\d{4}-\d{2}-\d{2}(-\d+)?$/;

function commonParent(folders) {
  let base = folders[0];
  while (!folders.every((f) => inside(f, base))) base = path.dirname(base);
  return base;
}

/** A fresh `contactsheet_YYYY-MM-DD` folder; never reuses one, so nothing is overwritten. */
async function newSheetDir(parent) {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  for (let i = 1; ; i++) {
    const dir = path.join(parent, `contactsheet_${date}${i > 1 ? `-${i}` : ""}`);
    try {
      await fs.mkdir(dir); // fails if it exists
      return dir;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
  }
}

/**
 * What an agent needs to sort and group frames without opening them: size,
 * orientation and the capture date (EXIF DateTimeOriginal, else file mtime).
 */
async function facts(file, readable) {
  const out = {};
  try {
    const meta = await sharp(readable).metadata();
    const swap = (meta.orientation || 1) >= 5;
    out.width = swap ? meta.height : meta.width;
    out.height = swap ? meta.width : meta.height;
    // Within 2% counts as square (6×6 scans are a few pixels off).
    const ratio = out.width / out.height;
    out.orientation = ratio > 1.02 ? "landscape" : ratio < 0.98 ? "portrait" : "square";
    const match = meta.exif?.toString("latin1").match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const [, y, mo, d, h, mi, sec] = match;
      out.capturedAt = `${y}-${mo}-${d}T${h}:${mi}:${sec}`;
      out.dateSource = "exif";
    }
  } catch {
    // No readable metadata; fall back to the file date below.
  }
  if (readable !== file && process.platform === "darwin") {
    // A HEIC or raw preview: take the size from the original instead.
    try {
      const { stdout } = await run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]);
      const w = Number(stdout.match(/pixelWidth: (\d+)/)?.[1]);
      const h = Number(stdout.match(/pixelHeight: (\d+)/)?.[1]);
      if (w && h && out.orientation) [out.width, out.height] = out.orientation === "landscape" ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)];
    } catch {
      // Keep the preview's size.
    }
  }
  if (!out.capturedAt) {
    out.capturedAt = (await fs.stat(file)).mtime.toISOString().slice(0, 19);
    out.dateSource = "mtime";
  }
  return out;
}

/** Safe in a file name, still readable: "Ștefan & Ana — nuntă" → "Stefan-Ana-nunta". */
const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}.+_-]+/gu, "-")
    .replace(/^[-.]+|-+$/g, "") || "sheet";

/** A folder name that stands on its own: "Aug" alone says little, "2025-Aug" does. */
function sourceLabel(folder) {
  const base = path.basename(folder);
  const vague = base.length <= 4 || /^\d+$/.test(base) || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*$/i.test(base);
  return vague ? `${path.basename(path.dirname(folder))}-${base}` : base;
}

/** sharp can't read HEIC or raw on most builds; macOS sips can. Converts into tmp. */
async function toReadable(file, kind, tmp) {
  if (kind === "image") return file;
  if (process.platform !== "darwin") return null;
  const out = path.join(tmp, `${stem(file)}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  try {
    await run("sips", ["-s", "format", "jpeg", "-Z", "1200", file, "--out", out]);
    return out;
  } catch {
    return null;
  }
}

/** "DSC_0001_final_4588.jpg" → "DSC_…4588.jpg". Keeps the last 4+ characters, which identify a frame. */
/** Standard PDF fonts cover WinAnsi: keep what they can draw (é, ü, “ ”), simplify the rest (ș → s), then "?". */
const NOT_WINANSI = /[^\x20-\x7e -ÿ‘’“”–—…·•€]/g;
const latin1 = (s) =>
  String(s)
    .normalize("NFC")
    .replace(NOT_WINANSI, (ch) => ch.normalize("NFD").replace(/[̀-ͯ]/g, ""))
    .replace(NOT_WINANSI, "?");

const escapeXml = (s) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);

/** Folders that only describe a step (an export, a lab roll, a camera), not the shoot. */
const GENERIC = /^(_?exports?(_?\s?\w+)?|selections?|select|final(_?\w+)?|(further_)?edits?|_?(my )?picks|sel\s?\d*|batch \d+|untitled export|digi(tal)?( \d+)?|_?film|scans?|jpe?g|_?psd|_?raws?|iphone|bts|\d+(-\w+)?|\d{3}[A-Z0-9_]{4,5})$/i;

/** A folder named for a day or a month: 2024-09-16_Portraits, 2017_07-19_Studio, 03-17-2026-Hike, Feb 2026 Retreat. */
const DATED = /^(\d{4}[-_]\d{2}[-_]\d{2}|\d{2}[-_]\d{2}[-_]\d{4}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{4})/i;

/**
 * The shoot a frame belongs to. In an archive that names shoots by date, the
 * first dated folder below the root, whatever's inside it (`Digital/r1/black`,
 * `Photos/2026/2026-03-01`). Otherwise the frame's folder, skipping step
 * folders like `_export`, `Digital`, `004585` or a camera's `100NCD90`.
 */
function shootOf(file, roots) {
  const root = roots.find((r) => inside(file, r)) || path.dirname(file);
  const parts = path.relative(root, path.dirname(file)).split(path.sep).filter(Boolean);
  const dated = parts.findIndex((p) => DATED.test(p));
  if (dated > -1) return path.join(root, ...parts.slice(0, dated + 1));
  let dir = path.dirname(file);
  while (dir !== root && GENERIC.test(path.basename(dir))) dir = path.dirname(dir);
  return dir;
}
const folderLabel = (file, roots) => path.basename(shootOf(file, roots));

/** Cut the end: "Studio Vis…". */
function fitEnd(text, width, measure) {
  if (measure(text) <= width) return text;
  for (let n = text.length - 1; n > 0; n--) {
    const t = `${text.slice(0, n).trimEnd()}…`;
    if (measure(t) <= width) return t;
  }
  return "";
}

/** Cut the middle, keeping at least the last 4 characters, which identify a frame: "IMG_…4821". */
function fitMiddle(text, width, measure, keep = 4) {
  if (measure(text) <= width) return text;
  const tail = text.slice(-keep);
  for (let n = text.length - keep - 1; n > 0; n--) {
    const t = `${text.slice(0, n)}…${tail}`;
    if (measure(t) <= width) return t;
  }
  return measure(`…${tail}`) <= width ? `…${tail}` : "";
}

// Layout, in points. The JPG renders it at SCALE px per point.
// Default page is 3:4, close to US Letter; A4 and Letter are there for printing.
const PAPER = { "3x4": [600, 800], a4: [595.28, 841.89], letter: [612, 792] };
const L = {
  side: 24, // left and right page margin
  top: 48, // top and bottom page margin
  colGap: 12, // between frames in a row
  rowGap: 10, // between rows
  strip: 8, // edge text column, left of each image
  stripGap: 3,
  text: 6.5, // edge text size: folder, number and filename alike
  gutter: 4, // between the three pieces of edge text
  footerGap: 14, // between the images and the footer line
  scale: 3, // JPG pages: pixels per point
  print: 300 / 72, // PDF images: 300 ppi, print quality
};
/** The brand, at the right end of the footer line, as the user would type it. */
const BRAND = "/techistack";
const REPO_URL = "https://github.com/alexbeltechi/techistack";
const INK = { paper: [1, 1, 1], text: [0.1, 0.1, 0.1], dim: [0.45, 0.45, 0.45], edge: [0.82, 0.82, 0.82] };
/** The same sheet on black: white text, nothing else changes. */
const BLACK = { paper: [0, 0, 0], text: [1, 1, 1], dim: [0.6, 0.6, 0.6], edge: [0.25, 0.25, 0.25] };

/** Pages laid out in INK, redrawn in another ink (same layout, same places). */
const inInk = (pages, ink) => {
  const swap = new Map(Object.keys(INK).map((k) => [INK[k], ink[k]]));
  return pages.map((p) => ({ ...p, ink, ops: p.ops.map((op) => (op.fill ? { ...op, fill: swap.get(op.fill) ?? op.fill } : op)) }));
};
const css = ([r, g, b]) => `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;

function pageFor(paper, cols) {
  const [width, height] = PAPER[paper];
  const contentW = width - L.side * 2;
  const colW = (contentW - (cols - 1) * L.colGap) / cols;
  const imgW = colW - L.strip - L.stripGap;
  const contentH = height - L.top * 2 - L.footerGap - L.text;
  return { width, height, cols, contentW, contentH, colW, imgW };
}

/** Width over height, kept sane: a missing frame is square, panoramas and slivers are capped. */
const aspect = (f) => (f.image ? Math.min(4, Math.max(0.4, f.image.w / f.image.h)) : 1);

/**
 * Frames in reading order, left to right, in justified rows like printed
 * proofs: each row scaled to fill the width, near the target height. A short
 * last row keeps the target height instead of being blown up.
 */
function rowsOf(frames, page) {
  const target = page.imgW * 1.25;
  const fixed = (k) => k * (L.strip + L.stripGap) + (k - 1) * L.colGap;
  const fit = (row) => (page.contentW - fixed(row.length)) / row.reduce((s, f) => s + aspect(f), 0);
  const rows = [];
  let row = [];
  for (const f of frames) {
    const next = [...row, f];
    if (row.length && fit(next) < target) {
      // Close the row with or without this frame, whichever lands nearer the target height.
      if (Math.abs(fit(next) - target) < Math.abs(fit(row) - target)) {
        rows.push(next);
        row = [];
        continue;
      }
      rows.push(row);
      row = [f];
    } else row = next;
  }
  if (row.length) rows.push(row);
  return rows.map((r, i) => {
    const last = i === rows.length - 1;
    const h = Math.min(page.contentH, last ? Math.min(target, fit(r)) : fit(r));
    for (const f of r) f.size = { w: aspect(f) * h, h };
    return { frames: r, h };
  });
}

/** Rows onto pages, as many as fit each page. */
function paginate(rows, page) {
  const pages = [];
  let current = [], used = 0;
  for (const r of rows) {
    const need = (used ? L.rowGap : 0) + r.h;
    if (current.length && used + need > page.contentH) {
      pages.push(current);
      current = [];
      used = 0;
    }
    used += (used ? L.rowGap : 0) + r.h;
    current.push(r);
  }
  if (current.length) pages.push(current);
  return pages;
}

const rowsHeight = (rows) => rows.reduce((sum, r, i) => sum + r.h + (i ? L.rowGap : 0), 0);

/** Edge text, climbing the image's left side: folder (fill) · number (hug) · filename.ext (fill). */
function edgeText(ops, f, baseX, bottom, h, measure) {
  const T = L.text;
  const m = (s) => measure(s, T);
  const put = (text, at) => text && ops.push({ t: "vtext", x: baseX, y: bottom - at, size: T, text, fill: INK.text });
  const num = String(f.n);
  const numW = m(num);
  const fileFit = (room) => {
    const stemPart = fitMiddle(f.stem, room - m(f.ext), m);
    return stemPart ? stemPart + f.ext : "";
  };
  // Folder and filename fill the space either side of the number. Each gets
  // half; whatever one doesn't use goes to the other. When both fit in their
  // halves the number sits in the middle.
  const fullFile = f.stem + f.ext;
  const room = h - numW - 2 * L.gutter;
  const half = room / 2;
  const fileW = Math.min(m(fullFile), half);
  const folderRoom = fileW < half ? room - fileW : Math.min(m(f.folder), half);
  let folder = fitEnd(f.folder, folderRoom, m);
  let numAt = m(f.folder) <= half && m(fullFile) <= half ? (h - numW) / 2 : m(folder) + L.gutter;
  let file = fileFit(h - numAt - numW - L.gutter);
  if (!file) {
    // Too short for all three (a panorama): number and filename identify the frame, the folder gives way.
    folder = "";
    numAt = 0;
    file = fileFit(h - numW - L.gutter);
  }
  put(folder, 0);
  put(num, numAt);
  put(file, h - m(file));
}

/**
 * One page as drawing instructions, top-left origin. Both renderers read this,
 * so the PDF and the JPG always match. Rows read left to right, each centred,
 * the block centred on the page. Under it one footer line: where the work is
 * on the left, /techistack (a link to the repo) on the right, alike in size
 * and colour.
 */
function layoutPage({ rows, page, footer, measure, pageNumber }) {
  const { width, height, contentW, contentH } = page;
  const ops = [{ t: "rect", x: 0, y: 0, w: width, h: height, fill: INK.paper }];
  const blockH = rowsHeight(rows);
  let y = L.top + (contentH - blockH) / 2;
  for (const r of rows) {
    const rowW = r.frames.reduce((sum, f, i) => sum + L.strip + L.stripGap + f.size.w + (i ? L.colGap : 0), 0);
    let gx = L.side + (contentW - rowW) / 2;
    for (const f of r.frames) {
      const { w, h } = f.size;
      const ix = gx + L.strip + L.stripGap;
      if (f.image) ops.push({ t: "image", x: ix, y, w, h, image: f.image });
      f.place = { page: pageNumber, x: ix, y, w, h };
      edgeText(ops, f, gx + L.strip - 1, y + h, h, measure);
      gx = ix + w + L.colGap;
    }
    y += r.h + L.rowGap;
  }

  const footerY = L.top + (contentH - blockH) / 2 + blockH + L.footerGap + L.text;
  const brandW = measure(BRAND, L.text);
  ops.push({ t: "text", x: L.side, y: footerY, size: L.text, text: footer(contentW - brandW - L.colGap), fill: INK.text });
  ops.push({ t: "text", x: width - L.side - brandW, y: footerY, size: L.text, text: BRAND, fill: INK.text, link: REPO_URL, w: brandW });
  return { width, height, ops };
}

async function renderPdf(pages, file, title) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const embedded = new Map();
  for (const p of pages) {
    const page = doc.addPage([p.width, p.height]);
    const Y = (y) => p.height - y;
    for (const op of p.ops) {
      if (op.t === "rect") page.drawRectangle({ x: op.x, y: Y(op.y + op.h), width: op.w, height: op.h, color: rgb(...op.fill) });
      else if (op.t === "image") {
        if (!embedded.has(op.image)) embedded.set(op.image, await doc.embedJpg(op.image.jpeg));
        page.drawImage(embedded.get(op.image), { x: op.x, y: Y(op.y + op.h), width: op.w, height: op.h });
      } else {
        page.drawText(latin1(op.text), {
          x: op.x,
          y: Y(op.y),
          size: op.size,
          font: op.bold ? bold : regular,
          color: rgb(...op.fill),
          ...(op.t === "vtext" ? { rotate: degrees(90) } : {}),
        });
        if (op.link) {
          const annot = doc.context.obj({
            Type: "Annot",
            Subtype: "Link",
            Rect: [op.x, Y(op.y) - 2, op.x + op.w, Y(op.y) + op.size],
            Border: [0, 0, 0],
            A: { Type: "Action", S: "URI", URI: PDFString.of(op.link) },
          });
          page.node.addAnnot(doc.context.register(annot));
        }
      }
    }
  }
  doc.setTitle(title);
  await fs.writeFile(file, await doc.save());
}

async function renderJpg(p, file) {
  const s = L.scale;
  const W = Math.round(p.width * s), H = Math.round(p.height * s);
  const images = [];
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">`];
  for (const op of p.ops) {
    if (op.t === "rect") svg.push(`<rect x="${op.x * s}" y="${op.y * s}" width="${op.w * s}" height="${op.h * s}" fill="${css(op.fill)}"/>`);
    else if (op.t === "image") images.push(op);
    else {
      const weight = op.bold ? ' font-weight="bold"' : "";
      const rot = op.t === "vtext" ? ` transform="rotate(-90 ${op.x * s} ${op.y * s})"` : "";
      svg.push(`<text x="${op.x * s}" y="${op.y * s}" font-size="${op.size * s}"${weight} fill="${css(op.fill)}"${rot}>${escapeXml(latin1(op.text))}</text>`);
    }
  }
  // The paper's edge, so the page reads as a sheet on a white screen.
  svg.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${css((p.ink || INK).edge)}"/>`);
  svg.push("</svg>");
  const layers = await Promise.all(
    images.map(async (op) => ({
      input: await sharp(op.image.jpeg).resize(Math.round(op.w * s), Math.round(op.h * s)).toBuffer(),
      left: Math.round(op.x * s),
      top: Math.round(op.y * s),
    })),
  );
  await sharp(Buffer.from(svg.join("")))
    .composite(layers)
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 72, mozjpeg: true })
    .toFile(file);
}

/** Promise.all over items.map(fn), with at most `limit` running at once. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** n items evenly spaced across a list, in order. */
const spread = (list, n) => Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]);

/** Folders below a shoot that hold its picks. */
const PICKS = /(^|[_\s-])(export|exports|selection|select|final|edit|edits|picks)/i;

/** How many frames a shoot of n gets: 1 for a handful, 2 around ten, 3 for dozens, 4–5 for hundreds. */
const share = (n) => Math.min(5, Math.max(1, Math.round(2 * Math.log10(n))));

/**
 * A snapshot of an archive: frames from every shoot, more from bigger ones,
 * evenly spaced within it, `max` in all. A shoot's pool is its picks (export,
 * selection, edits, picks folders) when it has any; otherwise its images,
 * leaving out camera JPEGs that sit next to their raws.
 */
function sampleShoots(pool, all, roots, max) {
  const rawNext = new Set(all.filter((f) => f.kind === "raw").map((f) => path.join(path.dirname(f.path), stem(f.path))));
  const shoots = new Map();
  for (const f of pool) {
    const s = shootOf(f.path, roots);
    if (!shoots.has(s)) shoots.set(s, []);
    shoots.get(s).push(f);
  }
  let groups = [...shoots.entries()].map(([dir, files]) => {
    const picks = files.filter((f) => path.relative(dir, path.dirname(f.path)).split(path.sep).some((d) => PICKS.test(d)));
    const plain = files.filter((f) => !rawNext.has(path.join(path.dirname(f.path), stem(f.path))));
    const use = picks.length ? picks : plain.length ? plain : files;
    return { dir, files: use, k: share(use.length) };
  });
  if (groups.length > max) groups = spread(groups, max).map((g) => ({ ...g, k: 1 }));
  const total = groups.reduce((s, g) => s + g.k, 0);
  if (total > max) {
    // Over --max: everyone gives up frames in proportion, never below one.
    const ratio = (max - groups.length) / (total - groups.length);
    for (const g of groups) g.k = 1 + Math.floor((g.k - 1) * ratio);
  }
  const picked = groups.flatMap((g) => spread(g.files, Math.min(g.k, g.files.length)));
  return { picked, shoots: groups.length, of: shoots.size };
}

async function sheet(opts) {
  let listed = null;
  if (opts.list) {
    // Exactly these files, in this order; the folders are where they live.
    const lines = (await fs.readFile(opts.list, "utf8")).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    listed = lines.map((l) => path.resolve(path.dirname(opts.list), l)).filter((f) => existsSync(f) && kindOf(f));
    if (!listed.length) throw new Error(`No readable photos listed in ${opts.list}.`);
    if (!opts.folders.length) opts.folders = [commonParent([...new Set(listed.map((f) => path.dirname(f)))])];
  }
  if (opts.folders.length === 0) throw new Error("Give at least one folder.");
  for (const f of opts.folders) if (!existsSync(f)) throw new Error(`Not found: ${f}`);
  if (!["pdf", "jpg", "both"].includes(opts.format)) throw new Error("--format is pdf, jpg or both.");
  if (!PAPER[opts.paper]) throw new Error("--paper is 3x4, a4 or letter.");

  const subject = slug(opts.name || opts.folders.map(sourceLabel).join("+"));

  const all = listed ? listed.map((f) => ({ path: f, kind: kindOf(f) })) : (await Promise.all(opts.folders.map((f) => walk(f, opts.depth)))).flat();
  const viewable = new Set(all.filter((f) => f.kind === "image" || f.kind === "heic").map((f) => stem(f.path)));
  // Left out at the user's request: matched by file name, with or without extension.
  const isExcluded = (f) => opts.exclude.includes(path.basename(f.path).toLowerCase()) || opts.exclude.includes(stem(f.path));
  const excluded = all.filter((f) => (f.kind === "image" || f.kind === "heic" || f.kind === "raw") && isExcluded(f)).map((f) => path.basename(f.path));
  const pool = all
    .filter((f) => !isExcluded(f))
    .filter((f) => f.kind === "image" || f.kind === "heic" || (opts.raw && f.kind === "raw" && !viewable.has(stem(f.path))));
  // A list keeps the order it was given in; folders are read in path order.
  if (!listed) pool.sort((a, b) => a.path.localeCompare(b.path));
  if (pool.length === 0) throw new Error("No viewable images. Try `scan`, or --raw for raw-only folders.");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "contactsheet-"));

  let out;
  if (opts.out) {
    out = path.resolve(opts.out);
    for (const f of opts.folders) {
      // A /curate effort folder is ours too: its sheet lives with its report.
      if (inside(out, f) && !CURATE_DIR.test(path.basename(out))) throw new Error(`--out ${out} is inside a source folder (${f}). Leave --out off to get a dated contactsheet folder there.`);
    }
    // Always a fresh dated folder inside --out (a /curate effort can hold several), so a rerun never overwrites a sheet.
    await fs.mkdir(out, { recursive: true });
    out = await newSheetDir(out);
  } else {
    // Next to the photos: the deepest folder that holds all of them.
    out = await newSheetDir(commonParent([...new Set(pool.map((f) => path.dirname(f.path)))]));
  }
  const sampled = opts.sample ? sampleShoots(pool, all, opts.folders, opts.max) : null;
  const picked = sampled ? sampled.picked : spread(pool, Math.min(opts.max, pool.length));
  const n = picked.length;

  const imagePx = 2400; // working size; each image is scaled to its frame below
  // A few at a time: HEIC and raw each start a sips process.
  const frames = await mapLimit(picked, Math.max(2, os.cpus().length), async (f, i) => {
    const frame = {
      n: i + 1,
      path: f.path,
      kind: f.kind,
      folder: folderLabel(f.path, opts.folders),
      stem: path.basename(f.path, path.extname(f.path)),
      ext: path.extname(f.path).toLowerCase(),
      image: null,
    };
    const src = await toReadable(f.path, f.kind, tmp);
    if (!src) return frame;
    Object.assign(frame, await facts(f.path, src));
    try {
      const { data, info } = await sharp(src)
        .rotate()
        .resize(imagePx, imagePx, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 90 })
        .toBuffer({ resolveWithObject: true });
      frame.image = { jpeg: data, w: info.width, h: info.height };
    } catch {
      // Unreadable file: the frame stays empty and is reported in the manifest.
    }
    return frame;
  });
  // Only our own temp folder (HEIC/raw previews); nothing in the source is ever removed.
  await fs.rm(tmp, { recursive: true, force: true });

  const loaded = frames.filter((f) => f.image);
  const page = pageFor(opts.paper, opts.cols || 4);
  const rows = rowsOf(frames, page);
  // Each image at its frame size at 300 ppi, so a printed sheet isn't soft; the JPG pages scale it down.
  await Promise.all(
    loaded.map(async (f) => {
      const { data, info } = await sharp(f.image.jpeg)
        .resize(Math.ceil(f.size.w * L.print), Math.ceil(f.size.h * L.print), { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      f.image = { ...f.image, jpeg: data };
    }),
  );

  const metrics = await PDFDocument.create();
  const font = await metrics.embedFont(StandardFonts.Helvetica);
  const measure = (text, size) => font.widthOfTextAtSize(latin1(text), size);

  const chunks = paginate(rows, page).map((pageRows) => ({ rows: pageRows, first: pageRows[0].frames[0].n, last: pageRows.at(-1).frames.at(-1).n }));
  // Where the work is, without the user's home path, cut in the middle when long.
  const home = os.homedir();
  const sources = opts.folders.map((f) => (inside(f, home) ? path.join("~", path.relative(home, f)) : f)).join(", ");
  const today = new Date().toISOString().slice(0, 10);
  const pages = chunks.map((chunk, i) =>
    layoutPage({
      rows: chunk.rows,
      page,
      measure,
      pageNumber: i + 1,
      // The location is cut in the middle to whatever room the rest of the line leaves.
      footer: (room) => {
        const rest = `  ·  ${chunk.first}–${chunk.last} of ${n}${n < pool.length ? ` (sampled from ${pool.length})` : ""}  ·  ${i + 1}/${chunks.length}  ·  ${today}`;
        return fitMiddle(sources, room - measure(rest, L.text), (t) => measure(t, L.text), 24) + rest;
      },
    }),
  );

  // Every file carries the sheet's full id and its colour, so one emailed on its
  // own still says what it is: contactsheetwhite_2026-10-08-3_2025-Aug_p01.jpg
  const sheetDir = path.basename(out);
  const id = `${SHEET_DIR.test(sheetDir) ? sheetDir : `contactsheet_${today}`}_${subject}`;
  // Every sheet twice: on white (to print and mark up) and on black (the same, white text).
  const written = [];
  for (const [ink, sheetPages] of [["white", pages], ["black", inInk(pages, BLACK)]]) {
    const name = id.replace(/^contactsheet/, `contactsheet${ink}`);
    if (opts.format !== "jpg") {
      const pdf = path.join(out, `${name}.pdf`);
      await renderPdf(sheetPages, pdf, name);
      written.push(pdf);
    }
    if (opts.format !== "pdf") {
      for (const [i, p] of sheetPages.entries()) {
        const jpg = path.join(out, `${name}_p${String(i + 1).padStart(2, "0")}.jpg`);
        await renderJpg(p, jpg);
        written.push(jpg);
      }
    }
  }

  const manifest = {
    id,
    subject,
    created: new Date().toISOString(),
    folders: opts.folders,
    excluded,
    total: pool.length,
    shown: n,
    ...(sampled ? { sampling: { by: "shoot", ...(opts.max !== Infinity ? { max: opts.max } : {}), shoots: sampled.shoots, of: sampled.of } } : {}),
    files: written,
    units: "points, top-left origin; multiply by scale for JPG pixels",
    scale: L.scale,
    pageSize: [page.width, page.height],
    frames: frames.map((f) => ({
      n: f.n,
      path: f.path,
      kind: f.kind,
      folder: f.folder,
      ok: Boolean(f.image),
      width: f.width ?? null,
      height: f.height ?? null,
      orientation: f.orientation ?? null,
      capturedAt: f.capturedAt ?? null,
      dateSource: f.dateSource ?? null,
      place: f.place ? { page: f.place.page, x: +f.place.x.toFixed(1), y: +f.place.y.toFixed(1), w: +f.place.w.toFixed(1), h: +f.place.h.toFixed(1) } : null,
    })),
  };
  const manifestPath = path.join(out, `${id}.json`);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const sizes = await Promise.all(written.map(async (f) => `${path.basename(f)} ${Math.round((await fs.stat(f)).size / 1024)} KB`));
  return { files: written, sizes, manifest: manifestPath, total: pool.length, shown: n, pages: pages.length, failed: manifest.frames.filter((f) => !f.ok).length };
}
async function pick(manifestPath, numbers) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const byN = new Map(manifest.frames.map((f) => [f.n, f]));
  return numbers.map((x) => {
    const f = byN.get(Number(x));
    if (!f) throw new Error(`No frame ${x} in ${manifestPath} (1–${manifest.shown}).`);
    return { n: f.n, folder: f.folder, path: f.path };
  });
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "scan") {
    const opts = parseArgs(rest);
    for (const f of opts.folders) if (!existsSync(f)) throw new Error(`Not found: ${f}`);
    console.log(JSON.stringify(await scan(opts.folders, opts.depth), null, 2));
  } else if (cmd === "sheet") {
    console.log(JSON.stringify(await sheet(parseArgs(rest)), null, 2));
  } else if (cmd === "pick") {
    const [manifestPath, ...numbers] = rest;
    if (!manifestPath || numbers.length === 0) throw new Error("Usage: pick <manifest.json> <n>...");
    console.log(JSON.stringify(await pick(manifestPath, numbers.flatMap((s) => s.split(/[,\s]+/)).filter(Boolean)), null, 2));
  } else {
    console.error("Usage: contactsheet.mjs scan <folder>... | sheet <folder>... [--out dir] [--max n|all] [--sample] [--format pdf|jpg|both] | pick <manifest.json> <n>...");
    process.exit(1);
  }
} catch (err) {
  console.error(`contactsheet: ${err.message}`);
  process.exit(1);
}
