/**
 * The curation as a presentable, printable article: a PDF drawn from the
 * effort's `article` (title, sections of text and frames) and summary.
 *
 * Text sits in a reading column; images use the full page width in justified
 * rows, each with contact-sheet edge text (folder · number · file). Real text
 * throughout, so it prints and an AI can read it. A4 by default, or Letter.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

const run = promisify(execFile);
const PAPER = { a4: [595.28, 841.89], letter: [612, 792] };
const L = {
  side: 48, // page margin left and right
  top: 56, // page margin top and bottom
  column: 380, // reading column for text, centred
  gap: 10, // between images in a row, and between rows
  strip: 8, // edge text, left of each image
  stripGap: 3,
  edge: 6, // edge text size
  rowHeight: 190, // target height of an image row
  maxImage: 440, // tallest a single image may be
  scale: 2.5, // embedded image pixels per point
};
const INK = { text: rgb(0.1, 0.1, 0.1), dim: rgb(0.45, 0.45, 0.45) };

/** Standard PDF fonts cover WinAnsi: strip diacritics, keep typographic punctuation, replace the rest. */
const NOT_WINANSI = /[^\x20-\x7e -ÿ‘’“”–—…·•€]/g;
const winAnsi = (s) =>
  String(s ?? "")
    .normalize("NFC")
    // Keep what the font can draw (é, ü); simplify the rest (ș → s), then "?".
    .replace(NOT_WINANSI, (ch) => ch.normalize("NFD").replace(/[̀-ͯ]/g, ""))
    .replace(NOT_WINANSI, "?");

function wrap(text, width, font, size) {
  const lines = [];
  for (const para of winAnsi(text).split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

const fitEnd = (text, width, m) => {
  if (m(text) <= width) return text;
  for (let n = text.length - 1; n > 0; n--) if (m(`${text.slice(0, n).trimEnd()}…`) <= width) return `${text.slice(0, n).trimEnd()}…`;
  return "";
};
const fitMiddle = (text, width, m, keep = 4) => {
  if (m(text) <= width) return text;
  const tail = text.slice(-keep);
  for (let n = text.length - keep - 1; n > 0; n--) if (m(`${text.slice(0, n)}…${tail}`) <= width) return `${text.slice(0, n)}…${tail}`;
  return m(`…${tail}`) <= width ? `…${tail}` : "";
};

/** Justified rows: every row fills the width; a very tall single image is capped and centred. */
function rows(items, width) {
  const out = [];
  let row = [];
  const fixed = (n) => n * (L.strip + L.stripGap) + (n - 1) * L.gap;
  for (const it of items) {
    row.push(it);
    const ratio = row.reduce((s, r) => s + r.ratio, 0);
    if (ratio * L.rowHeight + fixed(row.length) >= width) {
      out.push({ items: row, height: (width - fixed(row.length)) / ratio });
      row = [];
    }
  }
  if (row.length) {
    const ratio = row.reduce((s, r) => s + r.ratio, 0);
    const full = (width - fixed(row.length)) / ratio;
    // A short last row still fills the width; only its height is capped.
    out.push({ items: row, height: Math.min(L.maxImage, full) });
  }
  return out;
}

async function readable(file, tmp) {
  if (/\.(jpe?g|png|webp|tiff?|avif|gif)$/i.test(file)) return file;
  if (process.platform !== "darwin") return null;
  const copy = path.join(tmp, `${path.basename(file, path.extname(file))}-${Math.random().toString(36).slice(2, 7)}.jpg`);
  await run("sips", ["-s", "format", "jpeg", "-Z", "2000", file, "--out", copy]);
  return copy;
}

export async function renderArticle(data, file, { paper = "a4" } = {}) {
  const article = data.article;
  if (!article?.sections?.length) throw new Error("no article in the plan yet: add `article` (title, sections) with `write --plan`");
  const [W, H] = PAPER[paper] || PAPER.a4;
  const doc = await PDFDocument.create();
  const f = {
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };
  const textX = (W - L.column) / 2;
  const fullW = W - L.side * 2;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "curate-pdf-"));
  const byN = new Map(data.frames.map((fr) => [fr.n, fr]));

  let page;
  let y; // from the top
  const pages = [];
  const newPage = () => {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = L.top;
  };
  const room = () => H - L.top - y;
  const text = (str, { font, size, leading, color = INK.text, x = textX, width = L.column, after = 0 }) => {
    for (const line of wrap(str, width, font, size)) {
      if (room() < leading) newPage();
      y += leading;
      page.drawText(line, { x, y: H - y + (leading - size) * 0.5, size, font, color });
    }
    y += after;
  };

  newPage();
  // Title, date, summary.
  text(article.title || data.subject, { font: f.sansBold, size: 24, leading: 30, after: 4 });
  const date = new Date(data.created).toISOString().slice(0, 10);
  text(`${date}  ·  ${data.subject}  ·  ${data.frames.length} frames`, { font: f.sans, size: 8.5, leading: 12, color: INK.dim, after: 14 });
  if (data.summary) text(data.summary, { font: f.serif, size: 13, leading: 19, after: 22 });

  for (const section of article.sections) {
    // Images for this section, at full width.
    const items = [];
    for (const n of section.frames || []) {
      const fr = byN.get(n);
      if (!fr) continue;
      const src = await readable(path.join(data.source.folder, fr.file), tmp).catch(() => null);
      if (!src) continue;
      const meta = await sharp(src).rotate().metadata();
      const swap = (meta.orientation || 1) >= 5;
      const w = swap ? meta.height : meta.width;
      const h = swap ? meta.width : meta.height;
      items.push({ n, fr, src, ratio: w / h });
    }
    const sectionRows = rows(items, fullW);

    // Above the images, the curator's observation (in their voice); below, a plain caption.
    // Keep the heading and observation on the same page as the first row of images.
    const paras = String(section.observation ?? section.text ?? "").split(/\n\s*\n/).filter(Boolean);
    const caption = section.caption ? winAnsi(section.caption) : "";
    const captionHeight = caption ? wrap(caption, L.column, f.sans, 8.5).length * 12 + 6 : 0;
    const textHeight =
      (section.heading ? 22 : 0) + paras.reduce((sum, p) => sum + wrap(p, L.column, f.serif, 11.5).length * 17 + 9, 0) + 6;
    if (y > L.top && room() < textHeight + (sectionRows[0]?.height ?? 0)) newPage();

    if (section.heading) text(section.heading, { font: f.sansBold, size: 12, leading: 18, after: 4 });
    for (const para of paras) text(para, { font: f.serif, size: 11.5, leading: 17, after: 9 });
    y += 6;

    for (const [r, row] of sectionRows.entries()) {
      // The last row keeps the caption with it.
      const need = row.height + (r === sectionRows.length - 1 ? captionHeight : 0);
      if (room() < need) newPage();
      const used = row.items.reduce((s, it) => s + it.ratio * row.height, 0) + row.items.length * (L.strip + L.stripGap) + (row.items.length - 1) * L.gap;
      let x = L.side + (fullW - used) / 2;
      for (const it of row.items) {
        const w = it.ratio * row.height;
        const jpg = await sharp(it.src)
          .rotate()
          .resize(Math.ceil(w * L.scale), Math.ceil(row.height * L.scale), { fit: "inside" })
          .jpeg({ quality: 80, mozjpeg: true })
          .toBuffer();
        const img = await doc.embedJpg(jpg);
        const ix = x + L.strip + L.stripGap;
        page.drawImage(img, { x: ix, y: H - y - row.height, width: w, height: row.height });

        // Contact-sheet edge text, climbing the image: folder · number · file.
        const m = (s) => f.sans.widthOfTextAtSize(winAnsi(s), L.edge);
        const num = String(it.n);
        const fileName = path.basename(it.fr.file);
        const ext = path.extname(fileName).toLowerCase();
        const stem = path.basename(fileName, path.extname(fileName));
        const half = (row.height - m(num)) / 2 - 4;
        const folder = fitEnd(data.subject.replace(/-/g, " "), half, m);
        const fileFit = fitMiddle(stem, half - m(ext), m);
        const put = (s, at) =>
          s && page.drawText(winAnsi(s), { x: x + L.strip - 1, y: H - y - row.height + at, size: L.edge, font: f.sans, color: INK.text, rotate: degrees(90) });
        put(folder, 0);
        put(num, (row.height - m(num)) / 2);
        if (fileFit) put(fileFit + ext, row.height - m(fileFit + ext));
        x += L.strip + L.stripGap + w + L.gap;
      }
      y += row.height + L.gap;
    }
    if (caption) text(caption, { font: f.sans, size: 8.5, leading: 12, color: INK.dim, after: 0 });
    y += 22;
  }

  // Footer on every page: what this is, and where.
  pages.forEach((p, i) => {
    const line = winAnsi(`${data.id}  ·  ${i + 1} / ${pages.length}`);
    p.drawText(line, { x: (W - f.sans.widthOfTextAtSize(line, 6.5)) / 2, y: L.top / 2, size: 6.5, font: f.sans, color: INK.dim });
  });

  doc.setTitle(winAnsi(article.title || data.id));
  doc.setSubject(winAnsi(data.summary || ""));
  doc.setKeywords([...new Set(data.frames.flatMap((fr) => fr.notes?.tags || []))].map(winAnsi));
  await fs.writeFile(file, await doc.save());
  await fs.rm(tmp, { recursive: true, force: true });
  return { file, pages: pages.length, bytes: (await fs.stat(file)).size };
}
