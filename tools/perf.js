// Performance budget check: one page per template, on an emulated phone over a slow
// connection, against a running copy of the site with its photos.
//
//   npm start &   then   npm run check:perf -- [base-url]
//
// Budgets (docs/phase-1/ARCHITECTURE.md): LCP under 2.5 s and CLS under 0.1 fail the run.
// Requests before scrolling are reported against the 10 to 20 target but do not fail it.
// The throttling is Chrome DevTools emulation, not a real network, so treat the timings as
// indicative. Not run in CI, which has no photos.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
// Staging asks for a password on every request: pass --password <pw>, or set STAGING_PASSWORD.
const args = process.argv.slice(2);
const pwAt = args.indexOf('--password');
const password = pwAt >= 0 ? args.splice(pwAt, 2)[1] : process.env.STAGING_PASSWORD;
const credentials = password ? { httpCredentials: { username: 'staging', password } } : {};
const base = (args[0] || 'http://localhost:8080').replace(/\/$/, '');

const PAGES = [
  ['home', '/'],
  ['services', '/services'],
  ['service', '/uplighting'],
  ['catalog', '/catalog'],
  ['chandeliers', '/chandelier-pendant-catalog'],
  ['product', '/product-page/adj-jolt'],
  ['blog', '/blog'],
  ['post', '/post/rattan-lighting'],
  ['quote', '/get-a-quote'],
  ['venue', '/venue/dover-hall'],
];
const LCP_BUDGET = 2500;
const CLS_BUDGET = 0.1;
const REQUEST_TARGET = 20;

// Roughly Lighthouse's mobile setting: 150 ms round trip, 1.6 Mbps down, 750 kbps up, 4x slower CPU.
const NETWORK = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

const browser = await chromium.launch();
const rows = [];
for (const [name, path] of PAGES) {
  const context = await browser.newContext({ ...devices['iPhone 13'], ...credentials });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', NETWORK);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let requests = 0;
  let bytes = 0;
  cdp.on('Network.requestWillBeSent', () => { requests += 1; });
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength || 0; });
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0 };
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__perf.lcp = e.startTime; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true });
  });
  let status = 0;
  try {
    const res = await page.goto(base + path, { waitUntil: 'load', timeout: 60000 });
    status = res ? res.status() : 0;
    await page.waitForTimeout(1500); // let late layout shifts and the final LCP candidate arrive
  } catch (e) {
    console.error(`${path}: ${e.message}`);
  }
  const { lcp, cls } = await page.evaluate(() => window.__perf).catch(() => ({ lcp: 0, cls: 0 }));
  rows.push({ name, path, status, lcp: Math.round(lcp), cls: Number(cls.toFixed(4)), requests, kb: Math.round(bytes / 1024) });
  await context.close();
}
await browser.close();

const fails = [];
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('template', 12)}${pad('path', 30)}${pad('status', 8)}${pad('LCP ms', 9)}${pad('CLS', 8)}${pad('requests', 10)}KB before scroll`);
for (const r of rows) {
  const notes = [];
  if (r.status !== 200) { notes.push(`HTTP ${r.status}`); fails.push(`${r.path} answered ${r.status}`); }
  if (r.lcp > LCP_BUDGET || r.lcp === 0) { notes.push('LCP over budget'); fails.push(`${r.path} LCP ${r.lcp} ms`); }
  if (r.cls > CLS_BUDGET) { notes.push('CLS over budget'); fails.push(`${r.path} CLS ${r.cls}`); }
  if (r.requests > REQUEST_TARGET) notes.push(`over the ${REQUEST_TARGET}-request target`);
  console.log(`${pad(r.name, 12)}${pad(r.path, 30)}${pad(r.status, 8)}${pad(r.lcp, 9)}${pad(r.cls, 8)}${pad(r.requests, 10)}${pad(r.kb, 8)}${notes.join('; ')}`);
}
if (fails.length) {
  console.error(`\nOver budget: ${fails.join(', ')}`);
  process.exit(1);
}
console.log(`\nEvery page is within LCP ${LCP_BUDGET} ms and CLS ${CLS_BUDGET}.`);
