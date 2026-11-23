// Run after `npm run build`:  node --test
// Structured data (JSON-LD) on every built page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://www.weddinglightingco.com';

// Every built page and file, by public path.
const pages = new Map();
const files = new Set();
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    const rel = '/' + path.relative(DIST, p).split(path.sep).join('/');
    if (e.name.endsWith('.html')) pages.set(rel === '/index.html' ? '/' : rel.slice(0, -5), fs.readFileSync(p, 'utf8'));
    else files.add(rel);
  }
})(DIST);

// Every photo size the build may link to under /media.
const photos = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/photos.json'), 'utf8'));
const media = new Set();
for (const p of Object.values(photos)) {
  if (p.fallback) media.add(p.fallback);
  for (const list of [p.avif, p.webp]) for (const [, name] of list || []) media.add(name);
}

// Links inside structured data that are allowed not to resolve, each with its reason.
const ALLOWED = new Set([
  '/profile/nic/profile', // a blog author's profile page; it is a 404 on the previous site too
]);

const blocks = [];
for (const [url, html] of pages) {
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) blocks.push({ url, raw: m[1] });
}

/** Every string under a key that holds a link, with the key it was found under. */
function links(node, out = [], key = '') {
  if (typeof node === 'string') {
    if (['url', 'item', '@id', 'image', 'mainEntityOfPage', 'logo'].includes(key)) out.push([key, node]);
  } else if (Array.isArray(node)) {
    for (const x of node) links(x, out, key);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) links(v, out, k);
  }
  return out;
}

/** Whether a link points at something the site serves. Links to other sites are not checked. */
function resolves(link) {
  if (link.startsWith(SITE)) link = link.slice(SITE.length) || '/';
  else if (!link.startsWith('/')) return true;
  const bare = link.split('#')[0].split('?')[0] || '/';
  if (ALLOWED.has(bare)) return true;
  if (bare.startsWith('/media/')) return media.has(bare.slice('/media/'.length));
  return pages.has(bare) || files.has(bare);
}

test('every page has structured data, and every block parses', () => {
  assert.ok(blocks.length > pages.size, `${blocks.length} blocks on ${pages.size} pages`);
  const without = [...pages.keys()].filter((u) => !blocks.some((b) => b.url === u) && !['/404', '/quote-sent', '/quote-problem'].includes(u));
  assert.deepEqual(without, [], 'pages without JSON-LD');
  for (const b of blocks) {
    assert.ok(!b.raw.includes('</'), `${b.url}: a block contains "</", which would end the script early`);
    assert.doesNotThrow(() => JSON.parse(b.raw), `${b.url}: block does not parse`);
  }
});

test('every block names schema.org and a type', () => {
  for (const b of blocks) {
    for (const o of [].concat(JSON.parse(b.raw))) {
      assert.equal(o['@context'], 'https://schema.org', `${b.url}: @context`);
      assert.ok(o['@type'], `${b.url}: @type missing`);
    }
  }
});

test('every link in structured data leads to a page or file the site serves', () => {
  const broken = [];
  for (const b of blocks) for (const [key, link] of links(JSON.parse(b.raw))) if (!resolves(link)) broken.push(`${b.url} ${key}: ${link}`);
  assert.deepEqual(broken, []);
});

test('breadcrumbs count up from 1 and every step is named', () => {
  let n = 0;
  for (const b of blocks) {
    const o = JSON.parse(b.raw);
    if (o['@type'] !== 'BreadcrumbList') continue;
    n++;
    o.itemListElement.forEach((it, i) => {
      assert.equal(it.position, i + 1, `${b.url}: position`);
      assert.ok(String(it.name || '').trim(), `${b.url}: step ${i + 1} has no name`);
      assert.ok(it.item, `${b.url}: step ${i + 1} has no link`);
    });
  }
  assert.ok(n > 250, `${n} breadcrumb trails`);
});

test('product and blog post images are photo sizes the site holds', () => {
  let n = 0;
  for (const b of blocks) {
    const o = JSON.parse(b.raw);
    if (!['Product', 'BlogPosting'].includes(o['@type']) || o.image === undefined) continue;
    for (const img of [].concat(o.image)) {
      n++;
      const url = typeof img === 'string' ? img : img.url;
      assert.ok(url.startsWith(`${SITE}/media/`), `${b.url}: ${url}`);
      assert.ok(media.has(url.slice(`${SITE}/media/`.length)), `${b.url}: ${url} is not in photos.json`);
    }
  }
  assert.ok(n > 100, `${n} images checked`);
});

test('venue pages carry the business and their breadcrumb trail', () => {
  const venues = [...pages.keys()].filter((u) => u.startsWith('/venue/'));
  assert.ok(venues.length >= 20);
  for (const u of venues) {
    const types = blocks.filter((b) => b.url === u).map((b) => JSON.parse(b.raw));
    assert.ok(types.some((o) => o['@type'] === 'LocalBusiness'), u);
    const crumbs = types.find((o) => o['@type'] === 'BreadcrumbList');
    assert.deepEqual(crumbs.itemListElement.map((i) => i.item), [SITE, `${SITE}/venue`, `${SITE}${u}`], u);
  }
});
