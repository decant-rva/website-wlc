// Serves the built site. Public pages are static files from dist/.
//
// Environment:
//   PORT              default 8080
//   STAGING           "1" serves proposed redirects, adds noindex, requires the password
//   STAGING_PASSWORD  required when STAGING=1
//   MEDIA_DIR         directory of generated photo sizes (default .media/variants), used when no bucket is set
//   BUCKET_NAME       photo bucket. When set (with the AWS_* settings fly adds), /media is served from it
//   BUILD_SHA         commit the image was built from, reported by /health
//   DATABASE_URL      Postgres (Neon, pooled address), for quote requests. See quote.js and lib/deliver.js for the rest
//   DATABASE_URL_UNPOOLED  Neon's direct address, used only to apply migrations at start-up
//   CANONICAL_HOST    host this app is published under (www.weddinglightingco.com or the staging host).
//                     A request to the app's *.fly.dev address is sent there, so the site is not
//                     served twice and Cloudflare cannot be bypassed by accident.
//   CF_ORIGIN_SECRET  see clientIp() in quote.js
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
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

// Compares digests, which are always the same length, so neither the length of the password
// nor a character outside ASCII can change the answer or make the comparison throw.
const digest = (x) => crypto.createHash('sha256').update(String(x)).digest();
const same = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));
const CANONICAL_HOST = process.env.CANONICAL_HOST || '';

// quote: { store, deliverOpts } lets tests pass an in-memory store and fake deliveries.
// media: an object with get(key), to serve /media from a bucket (tests pass a fake).
export function build({ quote = {}, media } = {}) {
  // trustProxy stays off: X-Forwarded-For can be written by anyone. See clientIp() in quote.js.
  // return503OnClosing off: during a shutdown the requests still arriving are answered normally
  // (the server finishes them) instead of with a bare JSON 503.
  const app = Fastify({ logger: process.env.NODE_ENV === 'production', requestTimeout: 120000, return503OnClosing: false });

  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;
    // Without a port or a trailing dot, so "wlc-site.fly.dev:443" and "wlc-site.fly.dev." match too.
    const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
    if (CANONICAL_HOST && host.endsWith('.fly.dev')) return reply.redirect(`https://${CANONICAL_HOST}${req.url}`, 301);
    if (STAGING) {
      reply.header('X-Robots-Tag', 'noindex, nofollow');
      const given = Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString().split(':').slice(1).join(':');
      if (!same(given, PASSWORD)) {
        return reply.code(401).header('WWW-Authenticate', 'Basic realm="Staging"').send('Password required');
      }
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    if (!STAGING) reply.header('Strict-Transport-Security', 'max-age=31536000');
    // A password-protected page must never be kept by a shared cache such as Cloudflare's.
    if (STAGING) reply.header('Cache-Control', 'private, no-store');
    return payload;
  });

  // A visitor never sees a bare JSON error: form problems get the "call or email us" page, everything else the 404 page.
  const sendPage = (reply, code, name) => reply.code(code).header('Cache-Control', 'no-store').type('text/html; charset=utf-8')
    .send(fs.createReadStream(path.join(DIST, `${name}.html`)));
  app.setErrorHandler((err, req, reply) => {
    const code = err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (code >= 500) req.log.error(err); else req.log.warn({ err: err.message, url: req.url }, 'request refused');
    if (req.url.startsWith('/api/')) return sendPage(reply, code, 'quote-problem');
    return reply.code(code).type('text/plain; charset=utf-8').send(code >= 500 ? 'Something went wrong. Please call 804-410-3605.' : 'Bad request');
  });
  app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/') ? sendPage(reply, 404, 'quote-problem') : sendPage(reply, 404, '404')));

  // Fly checks this every 30 seconds; those requests are not logged.
  app.get('/health', { logLevel: 'silent' }, async () => ({ ok: true, sha: process.env.BUILD_SHA || 'dev', staging: STAGING }));

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
    // "//example.org/" must not become a redirect to another site: browsers read a Location
    // starting with // (or /\) as a different host.
    if (/^[\/\\]{2,}/.test(pathname)) return reply.redirect(encodeURI(pathname.replace(/^[\/\\]+/, '/').replace(/\/+$/, '') || '/').replace(/\?/g, '%3F').replace(/#/g, '%23') + query, 301);

    // One hop only: the slash is removed and the redirect map applied together.
    const bare = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    const target = redirects.get(bare);
    if (target) return reply.redirect(target + query, 301);
    // encodeURI leaves ? and # alone; a decoded %3F or %23 must not become a real query or fragment.
    if (bare !== pathname) return reply.redirect(encodeURI(bare).replace(/\?/g, '%3F').replace(/#/g, '%23') + query, 301);

    // Fonts, logos, scripts, sitemap and robots: any other file the build produced.
    if (assets.has(bare)) {
      const stable = bare.startsWith('/fonts/');
      return reply.sendFile(bare.slice(1), DIST, { maxAge: stable ? '1y' : '1h', immutable: stable });
    }
    // The home page's file is index.html, but /index is not a page of its own.
    if (bare === '/index') return reply.redirect('/' + query, 301);
    const page = bare === '/' ? '/index' : bare;
    if (page !== '/404' && pages.has(page)) {
      return reply.header('Cache-Control', 'public, max-age=300').type('text/html; charset=utf-8')
        .send(fs.createReadStream(path.join(DIST, `${page.slice(1)}.html`)));
    }
    return sendPage(reply, 404, '404');
  });

  return app;
}

// Compared as paths, not as `file://${argv[1]}`, which never matches on Windows (file:///A:/…).
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  let store;
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    // The site must come up even when the database is unreachable: pages are static, and the
    // quote form falls back to "call or email us" until the database answers.
    // Timeouts, so a slow database gives the visitor the "call or email us" page in seconds
    // instead of leaving them waiting until Cloudflare gives up.
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL, max: 4,
      // query_timeout is enforced by the client. statement_timeout is not set: it travels as a
      // startup parameter, which a PgBouncer pool (Neon's pooled address) may refuse.
      connectionTimeoutMillis: 5000, query_timeout: 15000,
    });
    pool.on('error', (e) => console.error('database connection lost:', e.message));
    store = quoteStore(pool);
    // Neon gives two addresses for the same database. Schema changes go over the direct one;
    // the site's own queries go through the pooled one (DATABASE_URL). Retried until it works.
    const applySchema = async () => {
      const direct = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
      try {
        await direct.connect();
        await migrate(direct);
        console.log('database ready');
      } catch (e) {
        console.error('database not ready, trying again in 30 seconds:', e.message);
        setTimeout(applySchema, 30000).unref();
      } finally {
        await direct.end().catch(() => {});
      }
    };
    applySchema();
  }
  const app = build({ quote: { store }, media: bucketConfigured() ? bucket() : undefined });
  await app.listen({ port: Number(process.env.PORT || 8080), host: '0.0.0.0' });
  // fly.io stops a machine with SIGINT (deploys, restarts). Stop taking new requests, let the ones
  // under way finish (a photo upload can take a while on a phone) and wait for running deliveries.
  // kill_timeout in the fly files gives this 30 seconds.
  let stopping = false;
  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal}: finishing requests and deliveries under way`);
    setTimeout(() => process.exit(0), 25000).unref();
    await app.close().catch((e) => console.error(e));
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
