// Read-only smoke test for a running copy of the site, for use right after a deploy.
//
//   node tools/smoke.js https://www.weddinglightingco.com
//   node tools/smoke.js https://staging.weddinglightingco.com --staging --password <pw>
//
// Options:
//   --staging              check the staging signals (noindex everywhere, password, no caching)
//   --password <pw>        the staging password
//   --canonical-host <h>   host the app's fly.dev address should redirect to
//                          (default www.weddinglightingco.com, or staging.weddinglightingco.com with --staging)
//   --fly-host <h>         the fly.dev host to try (default wlc-site.fly.dev / wlc-site-staging.fly.dev)
//
// It only sends GET requests. It never posts the quote form: a real post creates a real lead in
// GigFriend and an email to the office. Prints one line per check and exits 1 if any check fails.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const base = new URL(args.find((a) => /^https?:\/\//.test(a)) || '');
const staging = flag('--staging');
const password = option('--password', '');
const canonicalHost = option('--canonical-host', staging ? 'staging.weddinglightingco.com' : 'www.weddinglightingco.com');
const flyHost = option('--fly-host', staging ? 'wlc-site-staging.fly.dev' : 'wlc-site.fly.dev');
if (staging && !password) { console.error('--staging needs --password'); process.exit(2); }
const auth = staging ? { authorization: `Basic ${Buffer.from(`smoke:${password}`).toString('base64')}` } : {};

/** One GET, redirects not followed. Node's http modules allow a Host header; fetch does not. */
function get(pathname, { headers = {}, withAuth = true } = {}) {
  // A path is sent exactly as written ("//example.org/" must reach the server as a path, not be
  // read as another host); a full URL is used as it is.
  const url = /^https?:\/\//.test(pathname) ? new URL(pathname) : base;
  const target = url === base
    ? { protocol: base.protocol, hostname: base.hostname, port: base.port, path: /[^\x21-\x7e]/.test(pathname) ? encodeURI(pathname) : pathname }
    : { protocol: url.protocol, hostname: url.hostname, port: url.port, path: url.pathname + url.search };
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request({ ...target, method: 'GET', headers: { 'user-agent': 'wlc-smoke-test', ...(withAuth ? auth : {}), ...headers }, timeout: 15000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks), get body() { return this.buf.toString('utf8'); } }));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    req.end();
  });
}

let failed = 0;
const results = [];
async function check(name, fn) {
  try {
    const note = await fn();
    results.push(`ok    ${name}${note ? `: ${note}` : ''}`);
  } catch (e) {
    failed += 1;
    results.push(`FAIL  ${name}: ${e.message}`);
  }
  console.log(results[results.length - 1]);
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const decode = (s) => String(s).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const collapse = (s) => decode(s).replace(/[\s ​]+/g, ' ').trim();
const robotsMeta = (html) => (html.match(/<meta\s+name="robots"\s+content="([^"]*)"/i) || [])[1] ?? '';
const noindexHeader = (r) => /noindex/i.test(String(r.headers['x-robots-tag'] || ''));

console.log(`Smoke test of ${base.origin} (${staging ? 'staging' : 'production'})\n`);

await check('/health answers with the running commit', async () => {
  const r = await get('/health', { withAuth: false });
  expect(r.status === 200, `status ${r.status}`);
  const j = JSON.parse(r.body);
  expect(j.ok === true && j.sha, 'no sha in the answer');
  expect(j.staging === staging, `staging flag is ${j.staging}`);
  return `sha ${j.sha}`;
});

const home = await get('/');
await check('home page answers 200', async () => { expect(home.status === 200, `status ${home.status}`); });

if (staging) {
  await check('without the password a page is 401', async () => {
    const r = await get('/uplighting', { withAuth: false });
    expect(r.status === 401, `status ${r.status}`);
    expect(noindexHeader(r), 'no X-Robots-Tag noindex on the 401');
  });
  const css = (home.body.match(/\/_astro\/[^"]+\.css/) || [])[0] || '/_astro/missing.css';
  const font = (home.body.match(/\/fonts\/[^"]+\.woff2/) || [])[0] || '/fonts/missing.woff2';
  for (const p of ['/', '/uplighting', '/no-such-page-smoke', '/robots.txt', '/sitemap.xml', font, css]) {
    await check(`X-Robots-Tag noindex on ${p}`, async () => {
      const r = await get(p);
      expect(noindexHeader(r), `header is "${r.headers['x-robots-tag'] || ''}" (status ${r.status})`);
    });
  }
  await check('pages are not cacheable by shared caches', async () => {
    const cc = String(home.headers['cache-control'] || '');
    expect(/private|no-store/.test(cc) && !/public/.test(cc), `Cache-Control is "${cc}"`);
  });
  await check('robots.txt disallows everything', async () => {
    const r = await get('/robots.txt');
    expect(/^Disallow:\s*\/\s*$/m.test(r.body), 'no "Disallow: /" line (is this a production build?)');
  });
  await check('pages carry a noindex robots tag', async () => {
    expect(/noindex/i.test(robotsMeta(home.body)), `home page robots meta is "${robotsMeta(home.body)}" (is this a production build?)`);
  });
} else {
  const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/phase-1/inventory.json'), 'utf8'));
  const urls = Object.keys(inventory);
  const sample = Array.from({ length: 10 }, (_, i) => urls[Math.floor((i * urls.length) / 10)]);
  for (const u of sample) {
    await check(`${u}: title and robots as on the previous site, no noindex header`, async () => {
      const r = await get(u);
      expect(r.status === 200, `status ${r.status}`);
      expect(!noindexHeader(r), `X-Robots-Tag is "${r.headers['x-robots-tag']}"`);
      const want = inventory[u];
      const title = (r.body.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] ?? '';
      expect(collapse(title) === collapse(want.title), `title "${collapse(title)}", expected "${collapse(want.title)}"`);
      expect(collapse(robotsMeta(r.body)) === collapse(want.robots), `robots "${robotsMeta(r.body)}", expected "${want.robots}"`);
    });
  }
  await check('robots.txt allows crawling and lists the sitemap', async () => {
    const r = await get('/robots.txt');
    expect(r.status === 200, `status ${r.status}`);
    expect(!/^Disallow:\s*\/\s*$/m.test(r.body), 'robots.txt disallows everything');
    expect(/^Sitemap:\s*https:\/\/www\.weddinglightingco\.com\/sitemap\.xml/m.test(r.body), 'no Sitemap line for the www host');
  });
  await check('sitemap has the expected number of URLs', async () => {
    const r = await get('/sitemap.xml');
    const n = (r.body.match(/<loc>/g) || []).length;
    const local = path.join(ROOT, 'dist/sitemap.xml');
    if (fs.existsSync(local)) {
      const want = (fs.readFileSync(local, 'utf8').match(/<loc>/g) || []).length;
      expect(n === want, `${n} URLs, the local build has ${want}`);
    } else expect(n > 200, `only ${n} URLs`);
    return `${n} URLs`;
  });
}

await check('an existing redirect is a single 301 to a live page', async () => {
  const r0 = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/redirects.json'), 'utf8')).find((x) => x.status === 'existing');
  const r = await get(r0.from);
  expect(r.status === 301, `${r0.from} answered ${r.status}`);
  const to = new URL(r.headers.location, base);
  expect(to.pathname === r0.to, `${r0.from} goes to ${r.headers.location}, expected ${r0.to}`);
  const t = await get(to.pathname);
  expect(t.status === 200, `${r0.to} answered ${t.status}`);
  return `${r0.from} -> ${r0.to}`;
});
await check('"//example.org/" stays on the site', async () => {
  const r = await get('//example.org/');
  const loc = String(r.headers.location || '');
  expect(!loc.startsWith('//') && !/^\/\\/.test(loc), `Location "${loc}"`);
  if (/^https?:/i.test(loc)) expect(new URL(loc).host === base.host, `Location "${loc}" leaves the site`);
  return `${r.status} ${loc}`;
});
await check('an unknown path is a 404 page', async () => {
  const r = await get('/no-such-page-smoke');
  expect(r.status === 404, `status ${r.status}`);
  expect(/text\/html/.test(r.headers['content-type']), `content-type ${r.headers['content-type']}`);
});
await check('a trailing slash redirects once', async () => {
  const r = await get('/uplighting/');
  expect(r.status === 301 && new URL(r.headers.location, base).pathname === '/uplighting', `${r.status} ${r.headers.location}`);
});
await check('GET /api/quote is not a page (the form only posts)', async () => {
  const r = await get('/api/quote');
  expect(r.status === 404, `status ${r.status}`);
  expect(/text\/html/.test(r.headers['content-type']), `content-type ${r.headers['content-type']}`);
});
await check('security headers', async () => {
  const h = home.headers;
  const missing = [['x-content-type-options', /nosniff/i], ['x-frame-options', /./], ['referrer-policy', /./], ...(staging ? [] : [['strict-transport-security', /max-age=\d+/]])]
    .filter(([k, re]) => !re.test(String(h[k] || ''))).map(([k]) => k);
  expect(!missing.length, `missing ${missing.join(', ')}`);
});
await check('the stylesheet is cached as immutable and named after its contents', async () => {
  const href = (home.body.match(/\/_astro\/[^"]+\.css/) || [])[0];
  expect(href, 'no stylesheet link on the home page');
  const r = await get(href);
  expect(r.status === 200, `${href} answered ${r.status}`);
  expect(/immutable/.test(String(r.headers['cache-control'] || '')) || staging, `Cache-Control "${r.headers['cache-control']}"`);
  const hash = crypto.createHash('sha256').update(r.buf).digest('base64url').slice(0, 8);
  expect(href.endsWith(`.${hash}.css`), `${href} does not match its contents (${hash})`);
  return href;
});
await check('a photo from the home page is served', async () => {
  const src = (home.body.match(/\/media\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|webp|avif|png)/) || [])[0];
  expect(src, 'no /media photo on the home page');
  const r = await get(src);
  expect(r.status === 200 && /^image\//.test(r.headers['content-type']), `${src} answered ${r.status} ${r.headers['content-type']}`);
  return src;
});
await check(`a request for ${flyHost} goes to ${canonicalHost}`, async () => {
  // Locally the Host header stands in for the fly.dev name; against a deployed site the fly.dev
  // address is asked directly (Cloudflare would refuse a Host it does not serve).
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(base.hostname);
  const r = local ? await get('/uplighting', { headers: { host: flyHost } }) : await get(`https://${flyHost}/uplighting`);
  expect(r.status === 301, `status ${r.status} (the site is served on the fly.dev address)`);
  const to = new URL(r.headers.location);
  expect(to.host === canonicalHost && to.protocol === 'https:', `Location "${r.headers.location}"`);
});

console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
