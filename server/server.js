// Serves the built site. Public pages are static files from dist/.
//
// Environment:
//   PORT              default 8080
//   STAGING           "1" serves proposed redirects, adds noindex, requires the password
//   STAGING_PASSWORD  required when STAGING=1
//   MEDIA_DIR         directory of generated photo sizes (default .media/variants), used when no bucket is set
//   BUCKET_NAME       photo bucket. When set (with the AWS_* settings fly adds), /media is served from it
//   BUILD_SHA         commit the image was built from, reported by /health
//   DATABASE_URL      Postgres, for quote requests. See quote.js and lib/deliver.js for the rest
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { registerQuote } from './quote.js';
import { migrate, quoteStore } from './lib/store.js';
import { bucket, bucketConfigured, TYPES, VARIANTS } from './lib/bucket.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const MEDIA_DIR = path.resolve(ROOT, process.env.MEDIA_DIR || '.media/variants');
const STAGING = process.env.STAGING === '1';
const PASSWORD = process.env.STAGING_PASSWORD || '';
if (STAGING && !PASSWORD) throw new Error('STAGING=1 needs STAGING_PASSWORD');

const redirects = new Map(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'content/redirects.json'), 'utf8'))
    .filter((r) => r.status === 'existing' || r.status === 'approved' || (STAGING && r.status === 'proposed'))
    .map((r) => [r.from, r.to]),
);

// Every page path the build produced, so a request never touches the disk to
// find out whether a page exists.
const pages = new Set();
const assets = new Set();
(function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p);
    else if (e.name.endsWith('.html')) pages.add('/' + path.relative(DIST, p).split(path.sep).join('/').slice(0, -5));
    else assets.add('/' + path.relative(DIST, p).split(path.sep).join('/'));
  }
})(DIST);

const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// quote: { store, deliverOpts } lets tests pass an in-memory store and fake deliveries.
// media: an object with get(key), to serve /media from a bucket (tests pass a fake).
export function build({ quote = {}, media } = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV === 'production', trustProxy: true });

  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;
    if (STAGING) {
      reply.header('X-Robots-Tag', 'noindex, nofollow');
      const given = Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString().split(':').slice(1).join(':');
      if (!same(given, PASSWORD)) {
        return reply.code(401).header('WWW-Authenticate', 'Basic realm="Staging"').send('Password required');
      }
    }
  });

  app.get('/health', async () => ({ ok: true, sha: process.env.BUILD_SHA || 'dev', staging: STAGING }));

  app.register(fastifyStatic, { root: path.join(DIST, '_astro'), prefix: '/_astro/', immutable: true, maxAge: '1y', decorateReply: true });
  if (media) {
    // Photo file names are fixed for a given photo and size, so they can be cached for a year.
    app.get('/media/:file', async (req, reply) => {
      const file = req.params.file;
      const ext = file.split('.').pop().toLowerCase();
      if (!/^[A-Za-z0-9._-]+$/.test(file) || !TYPES[ext]) return reply.code(404).send('Not found');
      const obj = await media.get(VARIANTS + file);
      if (!obj) return reply.code(404).send('Not found');
      reply.header('Cache-Control', 'public, max-age=31536000, immutable').type(TYPES[ext]);
      if (obj.length) reply.header('Content-Length', obj.length);
      if (obj.etag) reply.header('ETag', obj.etag);
      return reply.send(obj.body);
    });
  } else {
    app.register(fastifyStatic, { root: MEDIA_DIR, prefix: '/media/', immutable: true, maxAge: '1y', decorateReply: false });
  }

  registerQuote(app, { dist: DIST, ...quote });

  app.get('/*', async (req, reply) => {
    const q = req.url.indexOf('?');
    const query = q >= 0 ? req.url.slice(q) : '';
    let pathname;
    try { pathname = decodeURIComponent(q >= 0 ? req.url.slice(0, q) : req.url); } catch { pathname = '/'; }

    // One hop only: the slash is removed and the redirect map applied together.
    const bare = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    const target = redirects.get(bare);
    if (target) return reply.redirect(target + query, 301);
    if (bare !== pathname) return reply.redirect(encodeURI(bare) + query, 301);

    // Fonts, logos, scripts, sitemap and robots: any other file the build produced.
    if (assets.has(bare)) {
      const stable = bare.startsWith('/fonts/');
      return reply.sendFile(bare.slice(1), DIST, { maxAge: stable ? '1y' : '1h', immutable: stable });
    }
    const page = bare === '/' ? '/index' : bare;
    if (page !== '/404' && pages.has(page)) {
      return reply.header('Cache-Control', 'public, max-age=300').type('text/html; charset=utf-8')
        .send(fs.createReadStream(path.join(DIST, `${page.slice(1)}.html`)));
    }
    return reply.code(404).type('text/html; charset=utf-8').send(fs.createReadStream(path.join(DIST, '404.html')));
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let store;
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
    await migrate(pool);
    store = quoteStore(pool);
  }
  build({ quote: { store }, media: bucketConfigured() ? bucket() : undefined }).listen({ port: Number(process.env.PORT || 8080), host: '0.0.0.0' });
}
