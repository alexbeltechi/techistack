#!/usr/bin/env node
/**
 * End-to-end smoke test for both skills, on a generated archive in a temp
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
  return sheet.shown === 9 && names.some((n) => n.endsWith("_black.pdf")) && names.some((n) => /_black_p01\.jpg$/.test(n)) && names.some((n) => /\d_road-trip\.pdf$/.test(n));
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
  const doc = await PDFDocument.load(fs.readFileSync(sheet.files.find((f) => f.endsWith("_black.pdf"))));
  return doc.getPages().every((p) => String(p.node.Annots()?.lookup(0)).includes("github.com/alexbeltechi/techistack"));
});

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
  }),
);
await check("curate sheet into the effort", () => json(CS, "sheet", path.join(A, "road trip"), "--max", "all", "--out", effort).shown === 9);
await check("write", () => json(CU, "write", effort, "--report", report, "--plan", plan).status === "proposed");
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

// The rule above all: originals untouched, and only our dated folders added.
const after = snapshot();
await check("no original changed or removed", () => [...before].every(([f, h]) => after.get(f) === h));
await check("nothing added outside our dated folders", () =>
  [...after.keys()].filter((f) => !before.has(f)).every((f) => f.startsWith("out") || f.startsWith("scratch") || /(^|[\\/])(contactsheet|_curate|selection)_\d{4}-\d{2}-\d{2}(-\d+)?[\\/]/.test(f)),
);

fs.rmSync(root, { recursive: true, force: true });
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
