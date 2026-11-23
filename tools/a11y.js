// Runs axe-core (WCAG 2.2 A and AA rules) against a running copy of the site,
// one page per template at phone and desktop width.
//   npm start &   then   node tools/a11y.js [base-url]
// Exits 1 on any violation that is not on the allow-list below, so it can run in CI.
// Automated rules catch only part of WCAG; a manual keyboard and screen reader
// pass is still needed before launch.
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
// Staging asks for a password on every request: pass --password <pw>, or set STAGING_PASSWORD.
const args = process.argv.slice(2);
const pwAt = args.indexOf('--password');
const password = pwAt >= 0 ? args.splice(pwAt, 2)[1] : process.env.STAGING_PASSWORD;
const credentials = password ? { httpCredentials: { username: 'staging', password } } : {};
const base = args[0] || 'http://localhost:8080';

// One page per template, plus the 404 page.
const PAGES = ['/', '/services', '/uplighting', '/catalog', '/chandelier-pendant-catalog', '/catalog/silk-florals-catalog',
  '/product-page/adj-jolt', '/blog', '/category/chandeliers', '/post/rattan-lighting', '/about-wedding-lighting-co',
  '/contact-us', '/faq', '/wedding-decor-package-cost', '/reviews', '/get-a-quote', '/portfolio', '/venue',
  '/venue/dover-hall', '/subscribe', '/privacy-policy', '/drapery', '/no-such-page'];
const WIDTHS = [['phone', { width: 390, height: 844 }], ['desktop', { width: 1366, height: 900 }]];

// Known, accepted results. Each entry must say why.
const ALLOWED = [
  {
    // Owner's palette (decision of 22 November 2026): the grey-white --white (#DBDBDD) on the
    // magenta drapes colour (#D6249F) measures 3.29:1, below the 4.5:1 AA needs for body text.
    // Pure white would only reach about 4.4:1. Recorded as a known risk, not a code fault.
    rule: 'color-contrast',
    test: (data) => data && data.fgColor === '#dbdbdd' && data.bgColor === '#d6249f',
  },
];
const allowed = (rule, node) => {
  const data = [...node.any, ...node.all, ...node.none].map((c) => c.data).find((d) => d && d.fgColor);
  return ALLOWED.some((a) => a.rule === rule && a.test(data));
};

const browser = await chromium.launch();
let failing = 0;
let accepted = 0;
for (const [label, viewport] of WIDTHS) {
  const context = await browser.newContext({ viewport, ...credentials });
  const page = await context.newPage();
  for (const url of PAGES) {
    await page.goto(base + url, { waitUntil: 'load' });
    await page.addScriptTag({ content: axe });
    const result = await page.evaluate(() => window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    }));
    for (const v of result.violations) {
      const nodes = v.nodes.filter((n) => !allowed(v.id, n));
      accepted += v.nodes.length - nodes.length;
      if (!nodes.length) continue;
      failing += nodes.length;
      console.log(`${label} ${url}  ${v.id} (${v.impact}) x${nodes.length}: ${v.help}`);
      for (const n of nodes.slice(0, 3)) console.log(`    ${n.target.join(' ')}  ${n.html.slice(0, 120)}`);
    }
  }
  await context.close();
}
await browser.close();
console.log(`${PAGES.length} pages at ${WIDTHS.length} widths: ${failing} issue${failing === 1 ? '' : 's'}, ${accepted} accepted (see ALLOWED)`);
process.exit(failing ? 1 : 0);
