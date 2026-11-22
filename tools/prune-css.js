// Runs after `astro build`. src/styles/site.css holds every rule from the
// design build-out; this removes the rules no built page uses and rewrites the
// stylesheet in dist/ in place.
import fs from 'node:fs';
import path from 'node:path';
import { PurgeCSS } from 'purgecss';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const dir = path.join(DIST, '_astro');
for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.css'))) {
  const file = path.join(dir, name);
  const before = fs.statSync(file).size;
  const [out] = await new PurgeCSS().purge({
    content: [path.join(DIST, '**/*.html')],
    css: [file],
    fontFace: true,
    keyframes: true,
    defaultExtractor: (content) => content.match(/[A-Za-z0-9_-]+/g) || [],
    // Classes the server adds to the quote form when it sends it back with problems marked.
    safelist: ['bad', 'qerr'],
  });
  fs.writeFileSync(file, out.css);
  console.log(`${name}: ${before} -> ${out.css.length} bytes`);
}
