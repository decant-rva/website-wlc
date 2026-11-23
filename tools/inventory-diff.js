// Compares the built site in dist/ with the Phase 1 inventory.
// Fails if any inventoried URL is missing, or if its title, meta description,
// canonical or robots differs from what the live site served, or if its H1 is
// not the first H1 the live site served (see the one-H1 rule below). Also fails on
// a second title, description, canonical or robots tag, on any crawler-specific robots
// tag (googlebot, bingbot), on noindex on a page the inventory does not cover, and on
// a served redirect whose source is an inventoried URL.
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
// H1 whitespace is compared loosely: the crawl joined inline elements with spaces.
const squash = (s) => decode(String(s || '')).replace(/[\s ​]+/g, '');
// Head tags are compared with runs of whitespace collapsed, not removed, so a title that
// loses its spaces is still a difference.
const collapse = (s) => decode(String(s || '')).replace(/[\s ​]+/g, ' ').trim();
// Attributes in any order and any quoting.
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((m) => [m[1].toLowerCase(), m[2] ?? m[3] ?? m[4]]));

function read(raw) {
  const html = raw.replace(/<!--[\s\S]*?-->/g, '');
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const named = (n) => metas.filter((a) => String(a.name || '').toLowerCase() === n).map((a) => a.content ?? '');
  return {
    title: [...html.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map((m) => m[1]),
    description: named('description'),
    canonical: links.filter((a) => String(a.rel || '').toLowerCase().split(/\s+/).includes('canonical')).map((a) => a.href ?? ''),
    robots: named('robots'),
    crawlerRobots: metas.filter((a) => /^(googlebot|bingbot|googlebot-news)$/i.test(a.name || '')).map((a) => `${a.name}=${a.content}`),
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
    // Exactly one tag where the previous site had a value, none where it had none.
    const expected = want[field] ? [collapse(want[field])] : [];
    const built = got[field].map(collapse).filter((x, i) => x || i > 0 || expected.length);
    if (JSON.stringify(built) !== JSON.stringify(expected)) problems.push([url, field, want[field], got[field].map(decode).join(' | ')]);
  }
  if (got.crawlerRobots.length) problems.push([url, 'crawler robots tag', '', got.crawlerRobots.join(' | ')]);
  // One H1 per page (owner decision, 22 November 2026). A page that had H1s on the
  // previous site must have exactly one, matching the first of them. A page that had
  // none must still have none. Empty and zero-width H1s on the previous site are ignored.
  const wanted = want.h1.map(squash).filter(Boolean).slice(0, 1);
  const a = wanted.join('|');
  const b = got.h1.map(squash).join('|');
  if (a !== b) problems.push([url, 'h1', wanted.length ? want.h1[want.h1.findIndex((x) => squash(x))] : '', got.h1.map(decode).join(' | ')]);
}

// Pages the inventory does not cover (the venue pages, for example) must not carry noindex,
// apart from the few that are meant to.
const MEANT_NOINDEX = new Set(['/404', '/quote-sent', '/quote-problem']);
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith('.html')) continue;
    let url = '/' + path.relative(path.join(ROOT, 'dist'), p).split(path.sep).join('/').slice(0, -5);
    if (url === '/index') url = '/';
    if (inventory[url] || MEANT_NOINDEX.has(url)) continue;
    const got = read(fs.readFileSync(p, 'utf8'));
    const robots = [...got.robots, ...got.crawlerRobots].join(' ');
    if (/noindex|none/i.test(robots)) problems.push([url, 'noindex on a page outside the inventory', '', robots]);
  }
})(path.join(ROOT, 'dist'));

// A redirect away from a URL the previous site served as a page would take that page out of search.
for (const r of JSON.parse(fs.readFileSync(path.join(ROOT, 'content/redirects.json'), 'utf8'))) {
  if (inventory[r.from] && r.status !== 'rejected') problems.push([r.from, `redirect (${r.status})`, '', `-> ${r.to}`]);
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
