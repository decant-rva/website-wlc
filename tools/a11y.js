// Runs axe-core (WCAG 2.2 A and AA rules) against a running copy of the site.
//   npm start &   then   node tools/a11y.js [base-url]
// Automated rules catch only part of WCAG; a manual keyboard and screen reader
// pass is still needed before launch.
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const base = process.argv[2] || 'http://localhost:8080';
const PAGES = ['/', '/uplighting', '/services', '/post/rattan-lighting', '/product-page/adj-jolt', '/blog',
  '/category/chandeliers', '/faq', '/get-a-quote', '/reviews', '/privacy-policy', '/contact-us'];

const browser = await chromium.launch();
let total = 0;
for (const [label, options] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', devices['Pixel 7']]]) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  for (const url of PAGES) {
    await page.goto(base + url, { waitUntil: 'load' });
    await page.addScriptTag({ content: axe });
    const result = await page.evaluate(() => window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    }));
    for (const v of result.violations) {
      total += v.nodes.length;
      console.log(`${label} ${url}  ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`);
      console.log(`    ${v.nodes[0].html.slice(0, 140)}`);
    }
  }
  await context.close();
}
await browser.close();
console.log(total ? `${total} issues` : 'no issues found by the automated rules');
process.exit(total ? 1 : 0);
