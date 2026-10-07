// Shared helpers for build / validate scripts. Zero dependencies (Node 18+).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const REPORTS_DIR = path.join(ROOT, "reports");

export const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const config = () => readJSON(path.join(ROOT, "site.config.json"));

/** All report folders (those containing a report.json). */
export function reportDirs() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs.readdirSync(REPORTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(REPORTS_DIR, d.name, "report.json")))
    .map((d) => d.name)
    .sort();
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", times: "×", minus: "−", middot: "·", rarr: "→", larr: "←", le: "≤", ge: "≥", asymp: "≈", plusmn: "±", deg: "°" };
export function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Parse every chart JSON block in a report. */
export function chartBlocks(html) {
  const re = /<script type="application\/json">([\s\S]*?)<\/script>/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push({ raw: m[1], index: m.index });
  return out;
}

function fmt(v, f) {
  if (v === null || v === undefined) return "–";
  const spec = typeof f === "object" && f ? f : ({ pct: { s: "%" }, pct1: { s: "%" }, pp: { s: " pp" }, usd: { p: "$" }, usd2: { p: "$" }, x: { s: "×" }, min: { s: " min" }, days: { s: " days" }, hrs: { s: " h" } })[f] || {};
  return (spec.p || spec.prefix || "") + v + (spec.s || spec.suffix || "");
}

/** Chart config → readable text lines (so search and AI can "see" chart data). */
export function describeChart(cfg, title) {
  const lines = [`[Chart: ${title || cfg.title || cfg.type}]`];
  for (const s of cfg.series || []) {
    lines.push(`${s.name || "Value"}: ` + (cfg.categories || []).map((c, i) => `${c} ${fmt(s.values[i], cfg.format)}`).join("; "));
  }
  return lines.join("\n");
}

/** HTML report → { text, headings, charts, words } */
export function extract(html) {
  let body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, html])[1];
  // Replace chart containers with a textual description of their data
  let charts = 0;
  body = body.replace(/<div class="pp-chart"[^>]*>\s*<script type="application\/json">([\s\S]*?)<\/script>\s*<\/div>/g, (_, raw) => {
    charts++;
    try { return "\n" + describeChart(JSON.parse(raw)) + "\n"; } catch { return ""; }
  });
  body = body.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, " ");
  // Keep image descriptions searchable (and visible to AI): <img alt="…"> → [Image: …]
  body = body.replace(/<img\b[^>]*\balt="([^"]+)"[^>]*>/gi, (_, alt) => `\n[Image: ${alt}]\n`);
  const headings = [...body.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => clean(m[1]));
  const text = clean(
    body
      .replace(/<\/(p|div|li|h[1-6]|tr|section|header|footer|figure|figcaption|dt|dd|blockquote|table|ol|ul)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<(td|th)[^>]*>/gi, " | ")
  , true);
  const words = text.split(/\s+/).filter(Boolean).length;
  return { text, headings, charts, words };
}

function clean(s, keepLines = false) {
  s = decode(s.replace(/<[^>]+>/g, " "));
  if (!keepLines) return s.replace(/\s+/g, " ").trim();
  return s.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
}

/** Minimal YAML front-matter reader for SKILL.md files (name/description only). */
export function frontMatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
