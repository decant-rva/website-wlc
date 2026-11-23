// Runs tools/smoke.js against the built site served locally, in production and staging mode.
// Run after `npm run build`. Photos are not in the repository, so the one the smoke test asks
// for is served from a temporary folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

async function serve(env) {
  const media = fs.mkdtempSync(path.join(os.tmpdir(), 'wlc-smoke-media-'));
  const home = fs.readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
  const photo = (home.match(/\/media\/([A-Za-z0-9._-]+\.(?:jpg|jpeg|webp|avif|png))/) || [])[1];
  if (photo) fs.writeFileSync(path.join(media, photo), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const port = await freePort();
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: '', PORT: String(port), MEDIA_DIR: media, ...env },
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${url}/health`)).ok) break; } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  return { url, stop: () => { child.kill(); fs.rmSync(media, { recursive: true, force: true }); } };
}

const smoke = (args) => spawnSync(process.execPath, ['tools/smoke.js', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });

test('the smoke test passes against a production server', async () => {
  const s = await serve({ CANONICAL_HOST: 'www.weddinglightingco.com' });
  try {
    const r = smoke([s.url]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /0 failed/);
  } finally { s.stop(); }
});

test('in staging mode it catches a production build served as staging, and nothing else', async () => {
  const s = await serve({ STAGING: '1', STAGING_PASSWORD: 'x', CANONICAL_HOST: 'staging.weddinglightingco.com' });
  try {
    const r = smoke([s.url, '--staging', '--password', 'x']);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const fails = r.stdout.split('\n').filter((l) => l.startsWith('FAIL'));
    // dist/ is a production build: its robots.txt allows crawling and its pages have no robots tag.
    assert.deepEqual(fails.map((l) => l.split(':')[0]), ['FAIL  robots.txt disallows everything', 'FAIL  pages carry a noindex robots tag']);
    assert.match(r.stdout, /ok {4}without the password a page is 401/);
    assert.match(r.stdout, /ok {4}X-Robots-Tag noindex on \/no-such-page-smoke/);
  } finally { s.stop(); }
});
