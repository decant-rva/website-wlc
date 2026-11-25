// Runs after `astro build`. src/styles/site.css holds every rule from the
// design build-out; this removes the rules no built page uses, writes the result
// under a name made from its own contents, and points the built pages at it.
//
// The new name matters: /_astro/ files are cached for a year as immutable, and
// Astro's name comes from the unpruned stylesheet, which does not change when a
// page starts using a rule it did not use before.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PurgeCSS } from 'purgecss';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const dir = path.join(DIST, '_astro');
// PurgeCSS reads content and css as glob patterns, which need forward slashes; with
// Windows backslashes they match nothing and purge() returns no result.
const glob = (p) => p.split(path.sep).join('/');
const renamed = new Map();
for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.css'))) {
  const file = path.join(dir, name);
  const before = fs.statSync(file).size;
  const [out] = await new PurgeCSS().purge({
    content: [glob(path.join(DIST, '**/*.html'))],
    css: [glob(file)],
    // Off: PurgeCSS only counts fonts named in `font-family`, and the body font is named
    // in the `font` shorthand, so it would delete DM Sans.
    fontFace: false,
    keyframes: true,
    defaultExtractor: (content) => content.match(/[A-Za-z0-9_-]+/g) || [],
    // Classes the server adds to the quote form when it sends it back with problems marked.
    safelist: ['bad', 'qerr'],
  });
  if (!out) throw new Error(`PurgeCSS returned nothing for ${file}`);
  const hash = crypto.createHash('sha256').update(out.css).digest('base64url').slice(0, 8);
  const next = name.replace(/\.[^.]+\.css$/, `.${hash}.css`);
  fs.writeFileSync(path.join(dir, next), out.css);
  if (next !== name) { fs.rmSync(file); renamed.set(name, next); }
  console.log(`${name} -> ${next}: ${before} -> ${out.css.length} bytes`);
}

(function rewrite(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { rewrite(p); continue; }
    if (!e.name.endsWith('.html')) continue;
    let html = fs.readFileSync(p, 'utf8');
    let changed = false;
    for (const [from, to] of renamed) {
      if (html.includes(`/_astro/${from}`)) { html = html.split(`/_astro/${from}`).join(`/_astro/${to}`); changed = true; }
    }
    if (changed) fs.writeFileSync(p, html);
  }
})(DIST);
