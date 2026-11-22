// Serves the built site. Public pages are static files from dist/.
//
// Environment:
//   PORT              default 8080
//   STAGING           "1" serves proposed redirects, adds noindex, requires the password
//   STAGING_PASSWORD  required when STAGING=1
//   MEDIA_DIR         directory of generated photo sizes (default .media/variants)
//   BUILD_SHA         commit the image was built from, reported by /health
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

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
(function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p);
    else if (e.name.endsWith('.html')) pages.add('/' + path.relative(DIST, p).split(path.sep).join('/').slice(0, -5));
  }
})(DIST);

const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function build() {
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
  app.register(fastifyStatic, { root: MEDIA_DIR, prefix: '/media/', immutable: true, maxAge: '1y', decorateReply: false });

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

    if (bare === '/sitemap.xml' || bare === '/robots.txt' || bare === '/favicon.ico') {
      return reply.sendFile(bare.slice(1), DIST, { maxAge: '1h', immutable: false });
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
  build().listen({ port: Number(process.env.PORT || 8080), host: '0.0.0.0' });
}
