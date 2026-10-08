#!/usr/bin/env node
/**
 * End-to-end smoke test for all three skills, on a generated archive in a temp
 * folder (never on real work). Run after `npm install` in each skill:
 *
 *   node test/smoke.mjs
 *
 * Checks every command, the edge cases that once broke (broken files, odd
 * names, reruns, bad options), and that no original is changed or removed.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repo, "skills/curate/package.json"));
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const CS = path.join(repo, "skills/contactsheet/scripts/contactsheet.mjs");
const CU = path.join(repo, "skills/curate/scripts/curate.mjs");
const SC = path.join(repo, "skills/scan/scripts/scan.mjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "techistack-smoke-"));
const A = path.join(root, "Archive", "2024");
let failed = 0;

function node(script, ...args) {
  return execFileSync(process.execPath, [script, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
const json = (script, ...args) => JSON.parse(node(script, ...args));
const fails = (script, ...args) => {
  try {
    node(script, ...args);
    return false;
  } catch {
    return true;
  }
};
async function check(name, fn) {
  try {
    if ((await fn()) === false) throw new Error("returned false");
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}: ${String(err.message).split("\n")[0]}`);
  }
}

// A small archive with the cases that matter.
let hue = 0;
async function img(rel, w, h, fmt = "jpeg", extra = {}) {
  const file = path.join(A, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  hue += 47;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hue % 360},60%,50%)"/><circle cx="${w / 3}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="white"/></svg>`;
  let s = sharp(Buffer.from(svg));
  if (extra.alpha) s = sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  if (extra.meta) s = s.withMetadata(extra.meta);
  await s[fmt]().toFile(file);
}
for (let i = 1; i <= 30; i++) await img(`roll/${String(i).padStart(6, "0")}.jpg`, i % 5 ? 900 : 600, i % 5 ? 600 : 900);
await img("road trip/panorama.jpg", 6000, 500);
await img("road trip/tall.png", 400, 4000, "png");
await img("road trip/web.webp", 800, 600, "webp");
await img("road trip/scan.tiff", 800, 600, "tiff");
await img("road trip/clear.png", 600, 400, "png", { alpha: true });
await img("road trip/rotated.jpg", 1200, 800, "jpeg", { meta: { orientation: 6 } });
await img("road trip/a long name with spaces 0042.jpg", 800, 600);
await img("Ștefan & Ana — nuntă/Zoë’s “quote” 03.jpg", 800, 1200);
fs.writeFileSync(path.join(A, "road trip/broken.jpg"), "not a jpeg");
fs.writeFileSync(path.join(A, "road trip/zero.jpg"), "");
fs.writeFileSync(path.join(A, "road trip/clip.mov"), "not a video");

const snapshot = () => {
  const out = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else out.set(path.relative(root, f), crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex"));
    }
  };
  walk(root);
  return out;
};
const before = snapshot();

// Contact sheets
await check("scan", () => json(CS, "scan", A)[0].totals.image >= 38);
let sheet;
await check("sheet, white and black", () => {
  sheet = json(CS, "sheet", path.join(A, "road trip"), "--max", "all");
  const names = sheet.files.map((f) => path.basename(f));
  return (
    sheet.shown === 9 &&
    names.some((n) => /^contactsheetwhite_\d{4}-\d{2}-\d{2}_road-trip\.pdf$/.test(n)) &&
    names.some((n) => /^contactsheetwhite_.*_p01\.jpg$/.test(n)) &&
    names.some((n) => /^contactsheetblack_.*_road-trip\.pdf$/.test(n)) &&
    names.some((n) => /^contactsheetblack_.*_p01\.jpg$/.test(n)) &&
    /^contactsheet_\d{4}-\d{2}-\d{2}_road-trip\.json$/.test(path.basename(sheet.manifest))
  );
});
await check("broken frames reported", () => sheet.failed === 2);
await check("all pages, a4, exclude", () => json(CS, "sheet", path.join(A, "roll"), "--max", "all", "--paper", "a4", "--exclude", "000003,000004.jpg").shown === 28);
await check("readable slug", () => /Stefan-Ana-nunta/.test(json(CS, "sheet", path.join(A, "Ștefan & Ana — nuntă"), "--format", "pdf").manifest));
await check("--out twice, nothing overwritten", () => {
  const out = path.join(root, "out");
  const a = json(CS, "sheet", path.join(A, "roll"), "--out", out, "--format", "pdf").manifest;
  const b = json(CS, "sheet", path.join(A, "roll"), "--out", out, "--format", "pdf").manifest;
  return path.dirname(a) !== path.dirname(b) && fs.readdirSync(out).length === 2;
});
await check("--out inside a source refused", () => fails(CS, "sheet", path.join(A, "roll"), "--out", path.join(A, "roll", "x")));
await check("bad --max refused", () => fails(CS, "sheet", path.join(A, "roll"), "--max", "0"));
await check("pick", () => {
  const m = json(CS, "sheet", path.join(A, "roll"), "--max", "all", "--format", "pdf").manifest;
  return json(CS, "pick", m, "7")[0].path.endsWith("000007.jpg");
});
await check("PDF credit links to the repo", async () => {
  const doc = await PDFDocument.load(fs.readFileSync(sheet.files.find((f) => path.basename(f).startsWith("contactsheetblack_") && f.endsWith(".pdf"))));
  return doc.getPages().every((p) => String(p.node.Annots()?.lookup(0)).includes("github.com/alexbeltechi/techistack"));
});

// Big archives: no frame-by-frame look at more than can be seen
const BIG = path.join(root, "big-archive");
const tiny = await sharp({ create: { width: 60, height: 40, channels: 3, background: "#888" } }).jpeg().toBuffer();
for (let d = 1; d <= 8; d++) {
  fs.mkdirSync(path.join(BIG, `shoot-${d}`, "export"), { recursive: true });
  for (let i = 1; i <= 40; i++) fs.writeFileSync(path.join(BIG, `shoot-${d}`, "export", `IMG_${String(i).padStart(4, "0")}.jpg`), tiny);
}
await check("--sample: every shoot, more from bigger ones", () => {
  // roll 30 → 3, road trip 9 → 2, the wedding's one frame → 1
  const m = JSON.parse(fs.readFileSync(json(CS, "sheet", A, "--sample", "--format", "pdf").manifest, "utf8"));
  return m.shown === 6 && m.sampling.shoots === 3 && m.sampling.of === 3;
});
await check("--sample within --max, one per shoot at least", () => {
  const m = JSON.parse(fs.readFileSync(json(CS, "sheet", BIG, "--sample", "--max", "10", "--format", "pdf").manifest, "utf8"));
  return m.shown === 8 && m.sampling.shoots === 8;
});
await check("--sample takes a shoot's picks, else skips camera JPEGs next to raws", () => {
  const S = path.join(root, "sample-archive");
  for (const f of ["one/Digital/a1.jpg", "one/Digital/a1.NEF", "one/_export/e1.jpg", "two/Digital/b1.jpg", "two/Digital/b1.NEF", "two/Digital/b2.jpg"]) {
    fs.mkdirSync(path.dirname(path.join(S, f)), { recursive: true });
    fs.writeFileSync(path.join(S, f), f.endsWith(".NEF") ? "raw" : tiny);
  }
  const m = JSON.parse(fs.readFileSync(json(CS, "sheet", S, "--sample", "--format", "pdf", "--out", path.join(root, "out-sample")).manifest, "utf8"));
  return m.frames.map((f) => path.basename(f.path)).join() === "e1.jpg,b2.jpg";
});
await check("--sample: a dated folder is one shoot, however deep it goes", () => {
  const S = path.join(root, "sample-archive", "Client");
  for (const f of ["2024-05-01_Look/Digital/r1/black/1.jpg", "2024-05-01_Look/Digital/r2/white/2.jpg", "2024-05-01_Look/Digital/Select/3.jpg", "Feb 2026 Retreat/Photos/2026/2026-03-01/4.jpg"]) {
    fs.mkdirSync(path.dirname(path.join(S, f)), { recursive: true });
    fs.writeFileSync(path.join(S, f), tiny);
  }
  const m = JSON.parse(fs.readFileSync(json(CS, "sheet", S, "--sample", "--format", "pdf", "--out", path.join(root, "out-sample")).manifest, "utf8"));
  return m.sampling.shoots === 2 && m.frames.map((f) => path.basename(f.path)).join() === "3.jpg,4.jpg";
});
await check("rows read left to right", () => {
  const m = JSON.parse(fs.readFileSync(json(CS, "sheet", path.join(A, "roll"), "--max", "8", "--format", "pdf", "--out", path.join(root, "out-rows")).manifest, "utf8"));
  const [a, b] = m.frames;
  return a.place.page === b.place.page && Math.abs(a.place.y - b.place.y) < 1 && b.place.x > a.place.x;
});
await check("--list: exactly those files, in that order", () => {
  const list = path.join(root, "list.txt");
  fs.writeFileSync(list, [path.join(BIG, "shoot-2/export/IMG_0007.jpg"), path.join(BIG, "shoot-1/export/IMG_0001.jpg"), path.join(BIG, "missing.jpg"), ""].join("\n"));
  const m = JSON.parse(fs.readFileSync(json(CS, "sheet", "--list", list, "--format", "pdf", "--out", path.join(root, "out-list")).manifest, "utf8"));
  return m.shown === 2 && m.frames[0].path.endsWith("shoot-2/export/IMG_0007.jpg") && m.frames[1].folder === "shoot-1";
});
let review;
await check("curate: a big folder opens as a review, its scan a snapshot inside it", () => {
  review = json(CU, "open", BIG, "--review");
  if (review.mode !== "review" || review.frames !== 320 || !review.next[0].startsWith("scan.mjs update") || !review.next[1].includes("--sample")) return false;
  json(SC, "update", BIG, "--out", review.folder);
  json(CS, "sheet", BIG, "--sample", "--format", "pdf", "--out", review.folder);
  const plan = path.join(root, "review.json");
  fs.writeFileSync(plan, JSON.stringify({ review: { folders: [{ folder: "shoot-3", verdict: "curate", frames: [7] }], next: ["shoot-3", "shoot-5"] } }));
  json(CU, "write", review.folder, "--plan", plan);
  fs.writeFileSync(plan, JSON.stringify({ review: { folders: [{ folder: "nope", verdict: "skip" }] } }));
  const st = json(SC, "status", BIG);
  return (
    fails(CU, "write", review.folder, "--plan", plan) &&
    json(CU, "status", review.folder).curateNext[0] === "shoot-3" &&
    fs.readdirSync(review.folder).some((n) => /^_scan_\d{4}-\d{2}-\d{2}$/.test(n)) &&
    !fs.readdirSync(BIG).some((n) => n.startsWith("_scan_")) &&
    st.fresh === true && st.scan.startsWith(review.folder)
  );
});
await check("curate next: \"go\" opens the proposed folders", () => {
  const opened = json(CU, "next", review.folder);
  return opened.length === 2 && opened.every((o) => o.mode === "curation" && fs.existsSync(o.folder)) && json(CU, "status", review.folder).status === "proposed";
});
await check("curate measure: the size and both ways in, nothing written, no limit", () => {
  const before = fs.readdirSync(BIG).length;
  const m = json(CU, "measure", BIG);
  const whole = json(CU, "open", BIG);
  return m.frames === 320 && m.shoots === 8 && m.pages === 20 && m.review.length === 3 && whole.mode === "curation" && !whole.next[0].includes("--force") && before === fs.readdirSync(BIG).length - 1;
});

// Scan
await check("scan: none yet", () => json(SC, "status", A).scan === null);
let index;
await check("scan: first scan", () => {
  index = json(SC, "update", A);
  return index.totals.image >= 38 && index.totals.video === 1 && fs.existsSync(index.md) && /^_scan_\d{4}-\d{2}-\d{2}$/.test(path.basename(index.scan));
});
await check("scan: fresh right after", () => json(SC, "status", path.join(A, "roll")).fresh === true);
await check("scan: note, kept and shown", () => {
  json(SC, "note", path.join(A, "roll"), "a test roll");
  return json(SC, "show", path.join(A, "roll")).note === "a test roll" && fs.readFileSync(index.md, "utf8").includes("a test roll");
});
await check("scan: other skills skip it", () => json(CS, "scan", A)[0].subfolders.every((d) => !d.dir.includes("_scan_")));
await check("scan: changes found, updated in place, renamed to today", () => {
  // On its own archive, so the main one stays as generated.
  const B = path.join(root, "scan-archive");
  fs.mkdirSync(path.join(B, "a"), { recursive: true });
  fs.mkdirSync(path.join(B, "b", "Previews.lrdata"), { recursive: true });
  for (const f of ["a/1.jpg", "a/2.jpg", "b/3.NEF", "b/3.xmp", "b/Previews.lrdata/p.jpg"]) fs.writeFileSync(path.join(B, f), "x");
  const first = json(SC, "update", B);
  if (first.totals.image !== 2 || first.totals.raw !== 1 || first.totals.sidecar !== 1) return false;
  // As if made on an earlier day.
  const old = path.join(B, "_scan_2020-01-01");
  fs.renameSync(first.scan, old);
  for (const f of fs.readdirSync(old)) fs.renameSync(path.join(old, f), path.join(old, f.replace(/^_scan_\d{4}-\d{2}-\d{2}/, "_scan_2020-01-01")));
  fs.writeFileSync(path.join(B, "a", "3.jpg"), "x");
  fs.mkdirSync(path.join(B, "c"));
  fs.writeFileSync(path.join(B, "c", "4.jpg"), "x");
  const st = json(SC, "status", B);
  if (st.fresh || st.changed[0]?.image !== 1 || st.added[0]?.folder !== "c") return false;
  const second = json(SC, "update", B);
  const scans = fs.readdirSync(B).filter((n) => n.startsWith("_scan_"));
  return second.changed === 1 && second.added === 1 && scans.length === 1 && scans[0] === path.basename(first.scan) && fs.readdirSync(second.scan).length === 2;
});
await check("scan: subfolder status uses the archive's scan", () => json(SC, "status", path.join(A, "road trip")).folder === "road trip");

// Curate
const effort = json(CU, "open", path.join(A, "road trip")).folder;
const scratch = path.join(root, "scratch");
fs.mkdirSync(scratch);
const report = path.join(scratch, "report.md");
const plan = path.join(scratch, "plan.json");
fs.writeFileSync(report, "<!-- curate:report -->\n# Road trip\n\nBody.\n");
fs.writeFileSync(
  plan,
  JSON.stringify({
    summary: "A test, with “quotes” and Ș.",
    sets: [
      { key: "A", title: "Good", frames: ["panorama", "tall.png", "web", "clear", "rotated"] },
      { key: "B", title: "Broken", frames: ["broken", "zero", "scan"] },
    ],
    article: {
      title: "Road trip — Ștefan’s",
      sections: [
        { heading: "Long", observation: "Words. ".repeat(600), frames: ["panorama", "tall.png"] },
        { heading: "Broken", observation: "These don't render.", frames: ["broken", "zero", "web"] },
      ],
    },
    catalogue: [
      { n: "panorama", caption: "An SUV on a dirt road at dusk.", keywords: ["land rover discovery", "suv", "car", "vehicle", "dirt road", "dusk", "a long phrase that has to wrap under a narrow image"], text: ["NO ENTRY"] },
      // An older effort's catalogue, with tags instead of keywords.
      { n: "tall.png", caption: "Cars by the sea.", tags: ["cars", "beach"] },
    ],
  }),
);
await check("curate sheet into the effort", () => json(CS, "sheet", path.join(A, "road trip"), "--max", "all", "--out", effort).shown === 9);
// External drives add `._…` shadow files next to every file (macOS AppleDouble).
fs.writeFileSync(path.join(effort, `._${path.basename(effort)}_road-trip.json`), "\u0000\u0005\u0016\u0007    Mac OS X");
await check("write: the plan's article becomes its PDF", () => {
  const w = json(CU, "write", effort, "--report", report, "--plan", plan);
  return w.status === "proposed" && fs.existsSync(w.pdf);
});
await check("bad plan JSON is a plain error", () => {
  fs.writeFileSync(path.join(scratch, "bad.json"), "nope");
  return fails(CU, "write", effort, "--plan", path.join(scratch, "bad.json"));
});
await check("article pdf with broken frames", () => json(CU, "pdf", effort).pages >= 2);
await check("article pdf letter", () => json(CU, "pdf", effort, "--paper", "letter").pages >= 2);
for (const preset of ["web", "original", "large", "small"]) {
  await check(`select ${preset}`, () => json(CU, "select", effort, "--set", "A", "--preset", preset).files.length === 5);
}
await check("select: broken frames listed, export finishes", () => {
  const r = json(CU, "select", effort, "--set", "B");
  return r.files.filter((f) => f.startsWith("(")).length === 2 && r.files.some((f) => f.endsWith("_scan.jpg"));
});
await check("select a name with spaces", () => json(CU, "select", effort, "a long name with spaces 0042").files[0].includes("0042"));
await check("bad --size leaves no folder", () => {
  const n = fs.readdirSync(effort).length;
  return fails(CU, "select", effort, "1", "--size", "0") && fs.readdirSync(effort).length === n;
});
await check("transparent exports on white, rotation applied, no metadata", async () => {
  const sel = path.join(effort, fs.readdirSync(effort).find((d) => d.startsWith("selection_")));
  const clear = path.join(sel, fs.readdirSync(sel).find((f) => f.includes("_clear")));
  const px = await sharp(clear).extract({ left: 1, top: 1, width: 1, height: 1 }).raw().toBuffer();
  const rot = await sharp(path.join(sel, fs.readdirSync(sel).find((f) => f.includes("_rotated")))).metadata();
  return px[0] > 250 && px[1] > 250 && px[2] > 250 && rot.width < rot.height && !rot.exif;
});
await check("report credit stays last", () => fs.readFileSync(path.join(effort, `${path.basename(effort)}_road-trip.md`), "utf8").trimEnd().endsWith("</sub>"));
await check("status", () => json(CU, "status", effort).status === "selected");
await check("selection.json carries caption, keywords and text", () => {
  const sel = path.join(effort, fs.readdirSync(effort).filter((d) => d.startsWith("selection_")).sort()[0]);
  const files = JSON.parse(fs.readFileSync(path.join(sel, "selection.json"), "utf8")).files;
  const pano = files.find((f) => f.source.includes("panorama"));
  const tall = files.find((f) => f.source.includes("tall"));
  return pano.keywords.includes("car") && pano.text[0] === "NO ENTRY" && pano.caption.startsWith("An SUV") && tall.keywords[0] === "cars" && !files.find((f) => f.source.includes("web")).keywords;
});
await check("article pdf lists the keywords", async () => {
  const doc = await PDFDocument.load(fs.readFileSync(path.join(effort, `${path.basename(effort)}_road-trip.pdf`)));
  return doc.getKeywords().includes("land rover discovery");
});
await check("scan: keywords in the map, find by word", () => {
  const up = json(SC, "update", A);
  const map = fs.readFileSync(up.md, "utf8");
  const car = json(SC, "find", A, "car");
  const both = json(SC, "find", path.join(A, "road trip"), "cars", "dusk");
  const none = json(SC, "find", A, "carpet");
  const phrase = json(SC, "find", A, "no entry");
  return map.includes("## Keywords") && map.includes("**car**") && car.found === 2 && both.found === 1 && both.frames[0].exported.length > 0 && none.found === 0 && phrase.found === 1;
});

// The rule above all: originals untouched, and only our dated folders added.
const after = snapshot();
await check("no original changed or removed", () => [...before].every(([f, h]) => after.get(f) === h));
await check("nothing added outside our dated folders", () =>
  [...after.keys()].filter((f) => !before.has(f)).every((f) => f.startsWith("out") || f.startsWith("scratch") || f.startsWith("scan-archive") || f.startsWith("big-archive") || f.startsWith("sample-archive") || f === "review.json" || f === "list.txt" || /(^|[\\/])(contactsheet|_curate|_scan|selection)_\d{4}-\d{2}-\d{2}(-\d+)?[\\/]/.test(f)),
);

fs.rmSync(root, { recursive: true, force: true });
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
