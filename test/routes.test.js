// Run after `npm run build`:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from '../server/server.js';

const inventory = JSON.parse(fs.readFileSync(new URL('../docs/phase-1/inventory.json', import.meta.url), 'utf8'));
const redirects = JSON.parse(fs.readFileSync(new URL('../content/redirects.json', import.meta.url), 'utf8'));
const app = build();
const get = (url) => app.inject({ method: 'GET', url });

test('every inventoried URL returns 200', async () => {
  for (const url of Object.keys(inventory)) {
    const res = await get(encodeURI(url));
    assert.equal(res.statusCode, 200, url);
  }
});

test('trailing slash redirects once to the bare path', async () => {
  const res = await get('/uplighting/');
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/uplighting');
  assert.equal((await get('/uplighting')).statusCode, 200);
});

test('served redirects are single hop and never land on the home page', async () => {
  for (const r of redirects.filter((x) => x.status !== 'proposed')) {
    const res = await get(r.from + '/');
    assert.equal(res.statusCode, 301, r.from);
    assert.equal(res.headers.location, r.to);
    assert.notEqual(r.to, '/');
    assert.equal((await get(r.to)).statusCode, 200, `${r.to} must be a live page`);
  }
});

test('proposed redirects are not served in production mode', async () => {
  for (const r of redirects.filter((x) => x.status === 'proposed')) {
    assert.equal((await get(r.from)).statusCode, 404, r.from);
  }
});

test('every redirect target exists', () => {
  for (const r of redirects) assert.ok(inventory[r.to], `${r.from} points to ${r.to}`);
});

test('unknown paths return a real 404', async () => {
  const res = await get('/no-such-page');
  assert.equal(res.statusCode, 404);
  assert.match(res.body, /Page not found/);
});

test('sitemap lists only indexable pages', async () => {
  const res = await get('/sitemap.xml');
  assert.equal(res.statusCode, 200);
  const locs = [...res.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const indexable = Object.values(inventory).filter((p) => !/noindex/i.test(p.robots)).length;
  assert.equal(locs.length, indexable);
  assert.ok(!locs.some((l) => l.includes('/blog/tags/')));
});

test('fonts, logo and menu script are served', async () => {
  for (const url of ['/fonts/poppins-900.woff2', '/img/logo.png', '/js/menu.js', '/favicon.png', '/robots.txt']) {
    assert.equal((await get(url)).statusCode, 200, url);
  }
});
