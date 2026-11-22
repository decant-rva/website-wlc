// Compares the built site in dist/ with the Phase 1 inventory.
// Fails if any inventoried URL is missing, or if its title, meta description,
// canonical or robots differs from what the live site served, or if its H1 is
// not the first H1 the live site served (see the one-H1 rule below).
//
//   node tools/inventory-diff.js          summary and first differences
//   node tools/inventory-diff.js --all    every difference
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/phase-1/inventory.json'), 'utf8'));
const showAll = process.argv.includes('--all');

const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
// Whitespace is compared loosely: the crawl joined inline elements with spaces.
const squash = (s) => decode(String(s || '')).replace(/[\s ​]+/g, '');
const attr = (html, re) => { const m = html.match(re); return m ? m[1] : ''; };

function read(html) {
  return {
    title: attr(html, /<title>([\s\S]*?)<\/title>/i),
    description: attr(html, /<meta name="description" content="([^"]*)"/i),
    canonical: attr(html, /<link rel="canonical" href="([^"]*)"/i),
    robots: attr(html, /<meta name="robots" content="([^"]*)"/i),
    h1: [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '')),
  };
}

const problems = [];
let checked = 0;
for (const [url, want] of Object.entries(inventory)) {
  const file = path.join(ROOT, 'dist', url === '/' ? 'index.html' : `${url.slice(1)}.html`);
  if (!fs.existsSync(file)) { problems.push([url, 'missing', '', '']); continue; }
  checked++;
  const got = read(fs.readFileSync(file, 'utf8'));
  for (const field of ['title', 'description', 'canonical', 'robots']) {
    if (squash(got[field]) !== squash(want[field])) problems.push([url, field, want[field], decode(got[field])]);
  }
  // One H1 per page (owner decision, 22 November 2026). A page that had H1s on the
  // previous site must have exactly one, matching the first of them. A page that had
  // none must still have none. Empty and zero-width H1s on the previous site are ignored.
  const wanted = want.h1.map(squash).filter(Boolean).slice(0, 1);
  const a = wanted.join('|');
  const b = got.h1.map(squash).join('|');
  if (a !== b) problems.push([url, 'h1', wanted.length ? want.h1[want.h1.findIndex((x) => squash(x))] : '', got.h1.map(decode).join(' | ')]);
}

const total = Object.keys(inventory).length;
const bad = new Set(problems.map((p) => p[0]));
console.log(`${total} URLs in inventory, ${checked} built, ${total - bad.size} match on every field, ${bad.size} differ`);
const byField = {};
for (const p of problems) byField[p[1]] = (byField[p[1]] || 0) + 1;
if (problems.length) console.log('differences by field:', JSON.stringify(byField));
for (const [url, field, want, got] of showAll ? problems : problems.slice(0, 25)) {
  console.log(`\n${url}  [${field}]\n  expected: ${String(want).slice(0, 160)}\n  built:    ${String(got).slice(0, 160)}`);
}
process.exit(problems.length ? 1 : 0);
