// Run after `npm run build`: every internal link and image on every built page
// must resolve the way the production server answers it (server/server.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const HOST = 'https://www.weddinglightingco.com';

// What production serves: the redirect map without proposed entries, built pages, other built files, photos.
const redirects = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'content/redirects.json'), 'utf8'))
  .filter((r) => r.status === 'existing' || r.status === 'approved').map((r) => [r.from, r.to]));
const pages = new Set();
const assets = new Set();
const htmlFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    const rel = '/' + path.relative(DIST, p).split(path.sep).join('/');
    if (e.name.endsWith('.html')) { pages.add(rel.slice(0, -5)); htmlFiles.push([rel, p]); } else assets.add(rel);
  }
})(DIST);
const media = new Set();
for (const photo of Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'content/photos.json'), 'utf8')))) {
  for (const kind of ['avif', 'webp']) for (const [, name] of photo[kind] || []) media.add(name);
  if (photo.fallback) media.add(photo.fallback);
}

/** The status production gives a root-relative path: 'ok', or why it fails. */
function resolve(raw) {
  let p;
  try { p = decodeURIComponent(raw.split(/[?#]/)[0]); } catch { return 'undecodable'; }
  if (p === '') return 'ok';
  const bare = p.length > 1 ? p.replace(/\/+$/, '') : p;
  if (redirects.has(bare)) return resolve(redirects.get(bare));
  if (bare === '/') return 'ok';
  if (bare.startsWith('/media/')) return media.has(bare.slice(7)) ? 'ok' : 'photo not in manifest';
  if (assets.has(bare)) return 'ok';
  if (bare !== '/404' && bare !== '/index' && pages.has(bare)) return 'ok';
  return '404';
}

test('every internal link, image and structured-data URL on every built page resolves', () => {
  const broken = [];
  for (const [rel, file] of htmlFiles) {
    if (rel === '/404.html') continue;
    const html = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const urls = new Set();
    for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) urls.add(m[1]);
    for (const m of html.matchAll(/\ssrcset="([^"]*)"/g)) for (const part of m[1].split(',')) urls.add(part.trim().split(/\s+/)[0]);
    // Structured data and share tags name pages on this site too.
    for (const m of html.matchAll(/"(?:url|item|@id|image|logo)"\s*:\s*"(https:\/\/www\.weddinglightingco\.com[^"]*)"/g)) urls.add(m[1]);
    for (const m of html.matchAll(/<meta\s+(?:property|name)="(?:og:url|og:image|twitter:image)"\s+content="([^"]*)"/g)) urls.add(m[1]);
    for (const raw of urls) {
      const u = raw.replace(/&amp;/g, '&');
      if (!u || u.startsWith('#') || /^(mailto|tel|data|javascript):/i.test(u)) continue;
      // A link meant for this site whose host came out wrong, e.g. "https://www.weddinglightingco.comhttps".
      if (/^https?:\/\/[^/]*weddinglightingco\.com/i.test(u)) {
        let host = '';
        try { host = new URL(u).hostname; } catch { /* reported below */ }
        if (!/^([a-z0-9-]+\.)*weddinglightingco\.com$/i.test(host)) { broken.push(`${rel} -> ${u} (malformed)`); continue; }
      }
      let local;
      if (u.startsWith(HOST)) local = u.slice(HOST.length) || '/';
      else if (u.startsWith('/') && !u.startsWith('//')) local = u;
      else continue; // external
      const why = resolve(local);
      if (why !== 'ok') broken.push(`${rel} -> ${u} (${why})`);
    }
  }
  assert.deepEqual(broken, [], `${broken.length} broken internal links:\n${broken.join('\n')}`);
});
