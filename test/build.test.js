// Run after `npm run build`:  node --test
// Checks on the built pages themselves.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const photos = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'content/photos.json'), 'utf8'));
const ours = new Set(Object.values(photos).map((p) => p.fallback));
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) pages.push([path.relative(DIST, p), fs.readFileSync(p, 'utf8')]);
  }
})(DIST);

test('no built page refers to the previous host', () => {
  // The previous host's photos stop working when that account ends. Markdown names photos
  // as wix:<id>, an ID scheme only; it must never reach the HTML as a URL.
  const hits = pages.filter(([, html]) => /wixstatic\.com|wix\.com\/|wixsite\.com/i.test(html)).map(([f]) => f);
  assert.deepEqual(hits, []);
});

test('share and structured-data images are our own photo files', () => {
  let og = 0;
  for (const [f, html] of pages) {
    const m = html.match(/<meta property="og:image" content="([^"]+)">/);
    if (m) {
      og += 1;
      assert.match(m[1], /^https:\/\/www\.weddinglightingco\.com\/media\//, f);
      assert.ok(ours.has(m[1].split('/media/')[1]), `${f}: ${m[1]} is not a size we generate`);
      assert.match(html, /<meta property="og:image:width" content="\d+">/, f);
    }
    for (const s of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const block = JSON.parse(s[1]);
      if (block.image) assert.ok(ours.has(String(block.image).split('/media/')[1]), `${f}: ${block.image}`);
    }
  }
  assert.ok(og > 200, `only ${og} pages have a share image`);
});
