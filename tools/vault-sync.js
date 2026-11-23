#!/usr/bin/env node
// Writes the website into the Obsidian vault and builds the export the Glow brain reads.
//
//   node tools/vault-sync.js <vault-dir> [--glow-dir <dir>] [--media wix|none|<base-url>] [--dry-run]
//
// It reads only this repository and writes only inside the vault (and --glow-dir):
//
//   Site/      one note per page, post, product and venue, plus hub notes. Rebuilt on every run.
//              A note is removed only if it carries `generated: true` and its page is gone.
//   _glow/     brief.md (short context), index.jsonl (every note in chunks), manifest.json.
//   the rest   seed notes from vault/seed are copied in only when the file does not exist yet.
//              Notes people or Glow have written are never overwritten.
//
// --media sets where photo previews in the notes load from: `wix` (the previous host, the
// default while it still serves them), `none` (text only), or a base URL such as
// https://www.weddinglightingco.com/media once the new site serves its own photos.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = 'https://www.weddinglightingco.com';
const CHUNK = 1800;
const SKIP_DIRS = new Set(['.obsidian', '.trash', '.git', '_glow', 'Templates', 'node_modules']);

// Folder for each content template, inside Site/.
export const FOLDER = {
  home: 'Pages', page: 'Pages', legal: 'Pages', profile: 'Pages',
  catalog: 'Catalog Pages', 'store-category': 'Catalog Pages',
  'blog-index': 'Blog Listings', 'blog-category': 'Blog Listings', 'blog-tag': 'Blog Listings',
  post: 'Posts', product: 'Products',
};
const KIND = {
  home: 'page', page: 'page', legal: 'page', profile: 'page', catalog: 'catalog', 'store-category': 'catalog',
  'blog-index': 'listing', 'blog-category': 'listing', 'blog-tag': 'listing', post: 'post', product: 'product',
};
const NAMES = {
  'Pages': 'Pages', 'Catalog Pages': 'Catalog pages', 'Blog Listings': 'Blog listings', 'Posts': 'Blog posts', 'Products': 'Products',
};

// Copy set in code rather than in a content file: where it shows, and the table's columns.
// Most of it is a plain literal of the same name in src/lib/templates.js. The third value is for
// copy that lives elsewhere: the file and constant it is read from, the fields that make the
// table's columns (for a list of objects), and what the note should say about it.
const TEMPLATES = 'src/lib/templates.js';
const QUOTE_DATA = 'server/lib/quote-form-data.js';
const numberWord = (n) => ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'][n] ?? String(n);
const CODE_COPY = {
  HERO: ['Home page hero slideshow', ['Photo', 'Alt text', 'CSS class']],
  INTRO: ['Home page intro columns', ['Heading', 'Text', 'Link label', 'Link']],
  BANNERS: ['Home page banners', ['Word', 'Line', 'Link', 'Photo']],
  FEATURED: ['"Featured" press logos (home and quote pages)', ['Publication', 'Width', 'Height']],
  FACTS: ['/services, "What do I need to know about event lighting?"', ['Fact', 'Link', 'Link label']],
  SERVICE_BAND: ['/services photo band: one photo per service', ['Service', 'Photo and alt']],
  DISCIPLINE: ['Colour group of each service (li lights, de decor, av AV, dr drapes; default li)', ['Service', 'Group'], {
    file: QUOTE_DATA,
    constant: 'SERVICE_GROUP',
    note: () => 'The home page\'s service tiles and the notification email\'s service tiles both read it. The email\'s colour for each group is `GROUP_COLOUR` in the same file.',
  }],
  TIME: ['/catalog time chart: share of crew hours by job. Placeholder figures until the owner supplies real ones', ['Job', 'Group', 'Percent']],
  TIME_STATS: ['/catalog headline numbers (owner, 22 November 2026)', ['Number', 'What']],
  QUOTE_REVIEWS: ['/get-a-quote review rotation: one line from each review on /reviews. Verbatim, never edited', ['Reviewer', 'Quote']],
  QUOTE_SERVICE_PHOTOS: ['/get-a-quote service slideshow', ['Service', 'Photo and alt']],
  BOOKING: ['/get-a-quote and the notification email, "When to book" scale (owner, 22 November 2026)', ['Lead time', 'Availability', 'Bars of 6'], {
    file: QUOTE_DATA,
    constant: 'BOOKING_SCALE',
    fields: ['label', 'outlook', 'bars'],
    note: (scale) => {
      const differ = scale.filter((r) => r.emailLabel && r.emailLabel !== r.label);
      const rows = differ.map((r) => `"${oneLine(r.label)}" (email: "${oneLine(r.emailLabel)}")`);
      return [
        'The quote page and the notification email both read it, so a change there alters both the /get-a-quote page and the notification email.',
        differ.length ? `${numberWord(differ.length)} ${differ.length === 1 ? 'row carries' : 'rows carry'} a separate \`emailLabel\`, the wording the email uses instead of \`label\`: ${rows.join(' and ')}. A proposal to reword ${differ.length === 1 ? 'that row' : 'one of them'} says whether it changes the page (\`label\`), the email (\`emailLabel\`), or both.` : '',
        'Each row also has `months` (not shown), the lower bound the email uses to place a request on the scale; a change of wording leaves it alone.',
      ].filter(Boolean).join(' ');
    },
  }],
};

// ---------------------------------------------------------------- reading the repository

const readText = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const readJson = (root, rel, fallback) => {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? JSON.parse(readText(file)) : fallback;
};

/** A content file: front matter (one `key: <JSON>` per line) and the Markdown body. */
export function parseEntry(text) {
  const t = text.replace(/\r\n/g, '\n');
  if (!t.startsWith('---\n')) return { data: {}, body: t };
  const end = t.indexOf('\n---\n', 4);
  const fm = end < 0 ? t.slice(4) : t.slice(4, end);
  const data = {};
  for (const line of fm.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_]+):\s?(.*)$/);
    if (!m) continue;
    try { data[m[1]] = JSON.parse(m[2]); } catch { data[m[1]] = m[2]; }
  }
  return { data, body: end < 0 ? '' : t.slice(end + 5) };
}

export function readEntries(root) {
  const out = [];
  for (const collection of ['pages', 'posts', 'products']) {
    const dir = path.join(root, 'content', collection);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const { data, body } = parseEntry(readText(path.join(dir, name)));
      if (!data.path) continue;
      out.push({ collection, file: `content/${collection}/${name}`, data, body });
    }
  }
  return out;
}

function git(root, args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

/** The end of the array or object literal that starts at src[i], skipping strings and comments. */
function literalAt(src, i) {
  if (src[i] !== '[' && src[i] !== '{') return null;
  let depth = 0;
  let quote = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === '\\') j++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); if (j < 0) return null; }
    else if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j); if (j < 0) return null; j++; }
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth -= 1; if (depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

/**
 * The values of `const NAME = [...]` / `{...}` declarations that are plain literals.
 * Each literal is evaluated in an empty context, so one that refers to anything else
 * fails and is left out rather than run.
 */
export function codeConstants(src, names) {
  const out = {};
  for (const name of names) {
    const m = new RegExp(`\\bconst ${name}\\s*=\\s*`).exec(src);
    const lit = m && literalAt(src, m.index + m[0].length);
    if (!lit) continue;
    try { out[name] = JSON.parse(JSON.stringify(vm.runInContext(`(${lit})`, vm.createContext({}), { timeout: 100 }))); } catch { /* not a plain literal */ }
  }
  return out;
}

/** Where each CODE_COPY section is read from: the file and the constant's name there. */
const codeSource = (name) => {
  const from = CODE_COPY[name]?.[2] || {};
  return { file: from.file || TEMPLATES, constant: from.constant || name };
};

/** The current value of each CODE_COPY section, read from the file it lives in. */
function readCodeCopy(root) {
  const sources = new Map();
  const out = {};
  for (const name of Object.keys(CODE_COPY)) {
    const { file, constant } = codeSource(name);
    if (!sources.has(file)) {
      const abs = path.join(root, file);
      sources.set(file, fs.existsSync(abs) ? readText(abs) : '');
    }
    const v = codeConstants(sources.get(file), [constant])[constant];
    if (v !== undefined) out[name] = v;
  }
  return out;
}

/** Which layout function in templates.js renders each path, from the BY_PATH table. */
function byPathTable(src) {
  const m = /\bconst BY_PATH\s*=\s*/.exec(src);
  const lit = m && literalAt(src, m.index + m[0].length);
  const out = {};
  for (const x of (lit || '').matchAll(/'([^']+)':\s*([A-Za-z_$][\w$]*)/g)) out[x[1]] = x[2];
  return out;
}

// ---------------------------------------------------------------- Markdown helpers

/** Same block split as src/lib/html.js, enough to find service cards and product lists. */
function blocks(body) {
  const out = [];
  for (const chunk of String(body || '').trim().split(/\n\s*\n/)) {
    const c = chunk.trim();
    if (!c || c.startsWith('<!--')) continue;
    if (c.startsWith('<')) { out.push(['raw', c]); continue; }
    let m = c.match(/^\[!\[([^\]]*)\]\(wix:([^)]+)\)\]\(([^)]+)\)$/);
    if (m) { out.push(['img', decodeURIComponent(m[2]), m[1], m[3]]); continue; }
    m = c.match(/^!\[([\s\S]*)\]\(wix:([^)]+)\)$/);
    if (m) { out.push(['img', decodeURIComponent(m[2]), m[1], null]); continue; }
    m = c.match(/^(#{1,4})\s*([\s\S]*)$/);
    if (m) { if (m[2].trim()) out.push(['h', m[1].length, m[2].trim()]); continue; }
    if (/^(- |\d+\. )/.test(c)) {
      out.push([/^\d/.test(c) ? 'ol' : 'ul', c.split('\n').filter((l) => l.trim()).map((l) => l.replace(/^(- |\d+\. )/, ''))]);
      continue;
    }
    m = c.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (m) { out.push(['link', m[1], m[2]]); continue; }
    out.push(['p', c]);
  }
  return out;
}

export const cleanAlt = (a) => {
  const s = String(a || '').replace(/\\_/g, '_').replace(/\s+/g, ' ').trim();
  return /\.(jpe?g|png|webp)$/i.test(s) ? '' : s;
};
const oneLine = (s) => String(s ?? '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
const cell = (s) => oneLine(s).replace(/\|/g, '\\|');
const linkText = (s) => oneLine(s).replace(/[[\]|]/g, '').replace(/\\_/g, '_');
const shortTitle = (t) => oneLine(String(t || '').split(' | ')[0]);
const q = (s) => JSON.stringify(String(s ?? ''));

/** A wiki link to a vault note. Inside a table the alias bar has to be escaped. */
const wl = (id, text, table = false) => `[[${id}${text ? `${table ? '\\|' : '|'}${linkText(text)}` : ''}]]`;

/** File-name-safe on Windows and in Obsidian links, from a URL path. */
export function safeName(s) {
  let n = s.replace(/[<>:"/\\|?*#^[\]]/g, '-').replace(/[. ]+$/, '').replace(/^\.+/, '') || 'page';
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(n)) n += '-page';
  return n;
}

export function noteBase(p) {
  if (p === '/') return 'home';
  return safeName(p.replace(/^\/(post|product-page)\//, '').replace(/^\//, '').replace(/\//g, '-'));
}

/** A path the site serves, from an internal href (relative or absolute to the live host). */
function sitePath(href) {
  let h = String(href || '').trim();
  const abs = h.match(/^https?:\/\/(www\.)?weddinglightingco\.com(\/[^\s]*)?$/i);
  if (abs) h = abs[2] || '/';
  if (!h.startsWith('/') || h.startsWith('//')) return null;
  h = h.split('#')[0].split('?')[0];
  if (h.length > 1) h = h.replace(/\/+$/, '');
  try { h = decodeURI(h); } catch { /* keep as is */ }
  return h || '/';
}

// ---------------------------------------------------------------- the sync

export function sync({ root = REPO, vault, glowDir = null, media = 'wix', dryRun = false, now = new Date() } = {}) {
  if (!vault) throw new Error('Give the vault folder: node tools/vault-sync.js <vault-dir>');
  vault = path.resolve(vault);
  const report = { written: 0, unchanged: 0, removed: 0, seeded: 0, kept: 0, notes: 0, chunks: 0, warnings: [] };
  const files = new Map(); // vault-relative path -> content written this run

  const put = (rel, content) => {
    files.set(rel, content);
    if (dryRun) return;
    const abs = path.join(vault, ...rel.split('/'));
    if (fs.existsSync(abs) && readText(abs) === content) { report.unchanged++; return; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    report.written++;
  };

  // ---- inputs
  const entries = readEntries(root);
  const site = readJson(root, 'src/data/site.json', {});
  const venues = readJson(root, 'content/venues.json', { venues: [] });
  const chandeliers = readJson(root, 'content/chandeliers.json', null);
  const redirects = readJson(root, 'content/redirects.json', []);
  const photos = readJson(root, 'content/photos.json', {});
  const unavailable = readJson(root, 'content/photos-unavailable.json', { photos: {} }).photos || {};
  const inventory = readJson(root, 'docs/phase-1/inventory.json', {});
  const tplFile = path.join(root, TEMPLATES);
  const tplSrc = fs.existsSync(tplFile) ? readText(tplFile) : '';
  const code = readCodeCopy(root);
  const byPath = byPathTable(tplSrc);
  const repo = {
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown',
    commit: git(root, ['rev-parse', '--short=12', 'HEAD']) || 'unknown',
    date: git(root, ['log', '-1', '--format=%cs']) || 'unknown',
    subject: git(root, ['log', '-1', '--format=%s']),
  };

  // ---- where every page's note goes
  const notes = new Map(); // site path -> note id (vault-relative, no .md)
  const taken = new Set();
  for (const e of entries) {
    const folder = FOLDER[e.data.template] || 'Pages';
    let base = noteBase(e.data.path);
    let id = `Site/${folder}/${base}`;
    for (let n = 2; taken.has(id.toLowerCase()); n++) id = `Site/${folder}/${base}-${n}`;
    taken.add(id.toLowerCase());
    notes.set(e.data.path, id);
    e.id = id;
  }
  const venueList = (venues.venues || []).filter((v) => v.slug);
  const venueHasPage = (v) => (v.photos || []).some((x) => photos[x.id]);
  for (const v of venueList) {
    v.id = `Site/Venues/${safeName(v.slug)}`;
    if (venueHasPage(v)) notes.set(`/venue/${v.slug}`, v.id);
  }
  const redirectTo = new Map(redirects.map((r) => [r.from, r]));
  const resolve = (href) => {
    const p = sitePath(href);
    if (!p) return null;
    if (notes.has(p)) return { path: p, id: notes.get(p) };
    const r = redirectTo.get(p);
    if (r && notes.has(r.to)) return { path: r.to, id: notes.get(r.to), via: r };
    return { path: p, id: null };
  };
  // Blog category and tag pages all have the H1 "BLOG", so their title names them better.
  const title = (e) => (['blog-category', 'blog-tag'].includes(e.data.template) ? shortTitle(e.data.title) : '') || cleanAlt(e.data.h1?.[0]) || shortTitle(e.data.title) || e.data.path;
  const byP = new Map(entries.map((e) => [e.data.path, e]));
  const label = (p) => (byP.get(p) ? title(byP.get(p)) : p);

  // ---- photos
  const mediaUrl = (id) => {
    if (media === 'none') return null;
    if (media === 'wix') return `https://static.wixstatic.com/media/${encodeURI(id)}`;
    const p = photos[id];
    return p ? `${media.replace(/\/+$/, '')}/${encodeURI(p.fallback || p.file)}` : null;
  };
  const refs = new Map(); // photo id -> [{ where, alt }]
  const addRef = (id, where, alt) => {
    if (!refs.has(id)) refs.set(id, []);
    refs.get(id).push({ where, alt: cleanAlt(alt) });
  };

  // ---- services: the Services menu plus every card on /services
  const servicesEntry = byP.get('/services');
  const serviceCards = [];
  const sb = blocks(servicesEntry?.body);
  for (let i = 0; i + 3 < sb.length; i++) {
    if (sb[i][0] === 'img' && sb[i + 1][0] === 'h' && sb[i + 3][0] === 'link') {
      serviceCards.push({ name: sb[i + 1][2], text: sb[i + 2][1], href: sb[i + 3][2], label: sb[i + 3][1] });
      i += 3;
    }
  }
  const menuServices = (site.nav || []).find((n) => n.label === 'Services')?.children || [];
  const servicePaths = new Set([...menuServices.map((c) => c.href), ...serviceCards.map((c) => c.href)]);

  const layoutOf = (e) => {
    const p = e.data.path;
    const t = e.data.template;
    if (byPath[p]) return byPath[p];
    if (servicePaths.has(p) && t === 'page') return 'service';
    if (t === 'product') return 'product';
    if (t === 'post') return 'post';
    if (['blog-index', 'blog-category', 'blog-tag'].includes(t)) return 'post listing';
    if (t === 'store-category') return 'store category';
    if (['page', 'catalog'].includes(t)) {
      const items = blocks(e.body).filter((b) => b[0] === 'ul').flatMap((b) => b[1]).map((x) => x.match(/^\[(.+)\]\(([^)]+)\)$/)).filter(Boolean);
      const cards = items.filter((m) => byP.has(sitePath(m[2])));
      if (cards.length >= 3 && cards.length >= items.length / 2) return 'product grid';
    }
    return 'prose';
  };

  // ---- Markdown body, for a vault note (links and previews) and as plain text (Glow)
  const broken = [];
  const viaProposed = []; // links that reach their page only through a redirect not yet approved
  const convert = (body, where) => {
    let photosOut = [];
    let md = String(body || '')
      .replace(/<!--\s*([\w-]+)\s*-->/g, (_, b) => `*(${b} block, laid out by the template)*`)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/?[a-z][a-z0-9]*(\s[^<>]*)?>/gi, '')
      .replace(/\[!\[([^\]]*)\]\(wix:([^)\s]+)\)\]\(([^)\s]+)\)/g, (_, alt, id, href) => `![${alt}](wix:${id}) ([link](${href}))`)
      .replace(/!\[([^\]]*)\]\(wix:([^)\s]+)\)/g, (_, alt, raw) => {
        const id = decodeURIComponent(raw);
        const a = cleanAlt(alt);
        addRef(id, where, a);
        photosOut.push({ id, alt: a });
        const url = photos[id] || media === 'wix' ? mediaUrl(id) : null;
        const shown = a || 'photo with no alt text';
        return url && !unavailable[id] ? `![${linkText(shown)}|320](${url})` : `*[photo: ${shown}]*`;
      })
      .replace(/(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text, href) => {
        const r = resolve(href);
        if (!r) return all;
        if (r.via?.status === 'proposed') viaProposed.push({ from: where, href, to: r.path });
        if (r.id) return wl(r.id, text);
        if (!/^\/(media|api|venue)\b/.test(r.path) && !/\.[a-z0-9]{2,4}$/i.test(r.path)) broken.push({ from: where, href, text: oneLine(text) });
        return all;
      })
      .replace(/\\_/g, '_')
      // The page's own headings sit under the note's "## Content", so they move down two levels.
      .replace(/^(#{1,4})[ \t]*(?=\S)/gm, (_, h) => `${'#'.repeat(h.length + 2)} `)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { md, photos: photosOut };
  };
  const plain = (md) => md
    .replace(/!\[([^\]|]*)(\|\d+)?\]\([^)]*\)/g, (_, alt) => `[photo: ${alt || 'no alt text'}]`)
    .replace(/\[\[([^\]|]+)\\?\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (_, id) => id.split('/').pop())
    .replace(/^> \[!\w+\][^\n]*\n?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const words = (md) => (plain(md).replace(/\[photo:[^\]]*\]/g, '').replace(/\*\([^)]*block[^)]*\)\*/g, '').match(/[A-Za-z0-9’']+/g) || []).length;

  const banner = (src) => `> [!info] Generated from ${src.includes(' ') ? src : `\`${src}\``} by \`tools/vault-sync.js\`. Edit the website, not this note: the next sync overwrites it. To suggest a change, write a proposal (see [[Curation/Curation Guide|Curation Guide]]).`;
  const frontMatter = (obj) => `---\n${Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${typeof v === 'string' ? q(v) : JSON.stringify(v)}`).join('\n')}\n---\n`;

  // ---- one note per content entry
  const gaps = { noDescription: [], noH1: [], thin: [], altByPage: new Map() };
  const meta = new Map(); // path -> { words, photos, missingAlt, layout }
  for (const e of entries) {
    const d = e.data;
    const kind = KIND[d.template] || 'page';
    const layout = layoutOf(e);
    const { md, photos: ph } = convert(e.body, d.path);
    const w = words(md);
    const missingAlt = ph.filter((x) => !x.alt).length;
    const inv = inventory[d.path];
    const tags = [`wlc/${kind}`];
    if (layout === 'service') tags.push('wlc/service');
    if (!oneLine(d.description)) { tags.push('wlc/gap/no-description'); if (!['blog-tag', 'profile'].includes(d.template)) gaps.noDescription.push(e); }
    if (inv && !(inv.h1 || []).length) { tags.push('wlc/gap/no-h1'); gaps.noH1.push(e); }
    const thinAt = kind === 'product' ? 40 : 150;
    if (kind !== 'listing' && d.template !== 'profile' && w < thinAt && !['/search', '/site-search'].includes(d.path)) { tags.push('wlc/gap/thin'); gaps.thin.push({ e, w }); }
    if (missingAlt) { tags.push('wlc/gap/alt'); gaps.altByPage.set(d.path, missingAlt); }
    meta.set(d.path, { words: w, photos: ph.length, missingAlt, layout });

    const date = d.schema?.datePublished ? String(d.schema.datePublished).slice(0, 10) : undefined;
    const fm = frontMatter({
      type: kind, url: d.path, live: `${LIVE}${d.path === '/' ? '' : encodeURI(d.path)}`, source: e.file, template: d.template, layout,
      title: d.title, description: d.description, h1: d.h1, robots: d.robots || undefined, published: date,
      words: w, photos: ph.length, photos_missing_alt: missingAlt || undefined,
      aliases: [title(e)], tags, generated: true,
    });
    const rows = [
      ['URL', `[${d.path}](${LIVE}${d.path === '/' ? '' : encodeURI(d.path)})`],
      ['Title', cell(d.title) || '**none**'],
      ['Meta description', cell(d.description) || '**none on the previous site**'],
      ['H1', (d.h1 || []).length ? (d.h1 || []).map(cell).join(' · ') : '**none on the previous site**'],
      ['Layout', `\`${layout}\` in \`src/lib/templates.js\``],
      ['Source', `\`${e.file}\``],
    ];
    if (date) rows.push(['Published', date]);
    let out = `${fm}# ${title(e)}\n\n${banner(e.file)}\n\n| | |\n|---|---|\n${rows.map(([a, b]) => `| ${a} | ${b} |`).join('\n')}\n\nTitle, meta description, canonical and H1 are under the [[Knowledge/Launch Freeze|launch freeze]].\n`;
    if ((d.facts || []).length) out += `\n## Fact tiles\n\nFrom \`facts\` in the front matter.\n\n${d.facts.map((f, i) => `${i + 1}. ${oneLine(f)}`).join('\n')}\n`;
    const linkList = (paths) => paths.map((p) => { const r = resolve(p); return r?.id ? `- ${wl(r.id, label(r.path))}` : `- ${p} (no page)`; }).join('\n');
    if ((d.categories || []).length) out += `\n## Categories\n\n${linkList(d.categories)}\n`;
    if ((d.tags || []).length) out += `\n## Tags\n\n${linkList(d.tags)}\n`;
    if ((d.related || []).length) out += `\n## Related posts\n\n${linkList(d.related)}\n`;
    if ((d.items || []).length) out += `\n## Products listed (${d.items.length})\n\n${linkList(d.items)}\n`;
    out += `\n## Content\n\n${md || '*(no body text)*'}\n`;
    if (ph.length) {
      out += `\n## Photos (${ph.length})\n\n| # | Photo ID | Alt text | Size |\n|---|---|---|---|\n${ph.map((x, i) => {
        const p = photos[x.id];
        return `| ${i + 1} | \`${x.id}\` | ${x.alt ? cell(x.alt) : '**missing**'} | ${p ? `${p.width}×${p.height}` : unavailable[x.id] ? 'not served by the previous host' : 'not in the manifest'} |`;
      }).join('\n')}\n`;
    }
    put(`${e.id}.md`, out);
  }

  // ---- venues
  for (const v of venueList) {
    const ph = (v.photos || []).filter((x) => photos[x.id]);
    ph.forEach((x) => addRef(x.id, `/venue/${v.slug}`, x.alt));
    const page = ph.length ? `/venue/${v.slug}` : null;
    const fm = frontMatter({
      type: 'venue', name: v.name, city: v.city, region: v.region, district: v.district, url: page || undefined,
      photos: ph.length, description: v.description, aliases: [v.name], tags: ['wlc/venue', ...(ph.length ? [] : ['wlc/gap/no-photos'])], generated: true,
    });
    let out = `${fm}# ${v.name}\n\n${banner('content/venues.json')}\n\n| | |\n|---|---|\n| Where | ${cell([v.city, v.district, v.region].filter(Boolean).join(', '))} |\n| Page | ${page ? `[${page}](${LIVE}${page}) (new on this site, not under the launch freeze)` : 'none: no photos yet, so it is listed on /venue only'} |\n| Meta description | ${cell(v.description) || '**none**'} |\n`;
    if (ph.length) out += `\n## Photos (${ph.length})\n\n${ph.map((x) => { const url = mediaUrl(x.id); return `${url ? `![${linkText(x.alt || v.name)}|320](${url})\n` : ''}\`${x.id}\`: ${cleanAlt(x.alt) || '**no alt text**'}`; }).join('\n\n')}\n`;
    const mentions = entries.filter((e) => (e.body || '').toLowerCase().includes(v.name.toLowerCase().replace(/^the /, '')));
    if (mentions.length) out += `\n## Mentioned on\n\n${mentions.slice(0, 40).map((e) => `- ${wl(e.id, title(e))}`).join('\n')}\n`;
    put(`${v.id}.md`, out);
  }

  // ---- photos placed by template code (the banners are decorative, alt left empty on purpose)
  for (const [id, alt] of code.HERO || []) addRef(id, 'src/lib/templates.js HERO', alt);
  for (const name of ['SERVICE_BAND', 'QUOTE_SERVICE_PHOTOS']) {
    for (const [id, alt] of Object.values(code[name] || {})) addRef(id, `src/lib/templates.js ${name}`, alt ?? photos[id]?.alt ?? '');
  }

  // ---- hub notes
  const hubFm = (t, extra = {}) => frontMatter({ type: 'hub', ...extra, tags: ['wlc/hub'], generated: true });
  const hub = (id, t, body, src = 'the website repository') => put(`Site/${id}.md`, `${hubFm(t)}# ${t}\n\n${banner(src)}\n\n${body.trim()}\n`);
  const row = (e) => {
    const m = meta.get(e.data.path);
    return `| ${wl(e.id, title(e), true)} | \`${cell(e.data.path)}\` | ${m.layout} | ${m.words} | ${m.photos}${m.missingAlt ? ` (${m.missingAlt} no alt)` : ''} | ${oneLine(e.data.description) ? 'yes' : '**no**'} |`;
  };
  const table = (list) => `| Page | URL | Layout | Words | Photos | Meta description |\n|---|---|---|---|---|---|\n${list.map(row).join('\n')}`;

  const groups = {};
  for (const e of entries) (groups[FOLDER[e.data.template] || 'Pages'] ||= []).push(e);
  hub('Site Map', 'Site map', Object.entries(groups).map(([f, list]) => `## ${NAMES[f] || f} (${list.length})\n\n${table(list.sort((a, b) => a.data.path.localeCompare(b.data.path)))}`).join('\n\n')
    + `\n\n## Venue pages (${venueList.filter(venueHasPage).length})\n\nNew on this site. One per venue with photos; see [[Site/Venues|Venues]].`);

  const svc = serviceCards.map((c) => {
    const r = resolve(c.href);
    const e = r && byP.get(r.path);
    const facts = e?.data.facts?.length ? ` Fact tiles: ${e.data.facts.length}.` : '';
    return `### ${r?.id ? wl(r.id, linkText(c.name)) : linkText(c.name)}\n\n${oneLine(c.text)}\n\n\`${c.href}\`, ${e ? `${meta.get(e.data.path).words} words, ${meta.get(e.data.path).photos} photos.` : 'no page.'}${facts}`;
  });
  hub('Services', 'Services', `The cards on ${wl(notes.get('/services') || 'Site/Pages/services', '/services')}, in order, as the site shows them. The Services menu lists: ${menuServices.map((c) => { const r = resolve(c.href); return r?.id ? wl(r.id, c.label) : c.label; }).join(', ')}.\n\n${svc.join('\n\n')}`);

  const catalogPages = entries.filter((e) => ['catalog', 'store-category'].includes(e.data.template) || layoutOf(e) === 'product grid');
  const inAny = new Set(catalogPages.flatMap((e) => [...(e.data.items || []), ...blocks(e.body).filter((b) => b[0] === 'ul').flatMap((b) => b[1]).map((x) => sitePath((x.match(/\]\(([^)]+)\)$/) || [])[1]))]));
  const products = entries.filter((e) => e.data.template === 'product');
  let chand = '';
  if (chandeliers?.tiers) {
    chand = `\n\n## Chandelier sorting\n\nFrom \`content/chandeliers.json\`. ${oneLine(chandeliers._note)}\n\nStyles: ${(chandeliers.styles || []).join(', ')}.\n\n${chandeliers.tiers.map((tier, i) => `### ${chandeliers.tierNames?.[i] || `Tier ${i + 1}`}\n\n${tier.map((x) => { const r = resolve(x.path); return `- ${r?.id ? wl(r.id, label(r.path)) : x.path} (${x.style})`; }).join('\n')}`).join('\n\n')}`;
  }
  hub('Catalog', 'Catalog', `${products.length} products. No prices and no checkout: the catalog is for browsing, and pricing comes through a quote.\n\n## Catalog and category pages\n\n${catalogPages.map((e) => { const n = (e.data.items || []).length; return `- ${wl(e.id, title(e))} \`${e.data.path}\`${n ? `: ${n} products` : ''}`; }).join('\n')}\n\n## Products in no category or catalog page\n\n${products.filter((e) => !inAny.has(e.data.path)).map((e) => `- ${wl(e.id, title(e))}`).join('\n') || 'None.'}${chand}`);

  const posts = entries.filter((e) => e.data.template === 'post').sort((a, b) => String(b.data.schema?.datePublished || '').localeCompare(String(a.data.schema?.datePublished || '')));
  const countBy = (key) => {
    const m = new Map();
    for (const e of posts) for (const p of e.data[key] || []) m.set(p, (m.get(p) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([p, n]) => { const r = resolve(p); return `- ${r?.id ? wl(r.id, label(r.path)) : p}: ${n}`; }).join('\n');
  };
  hub('Blog', 'Blog', `${posts.length} posts, newest first.\n\n| Post | Published | Words | Photos |\n|---|---|---|---|\n${posts.map((e) => `| ${wl(e.id, title(e), true)} | ${String(e.data.schema?.datePublished || '').slice(0, 10)} | ${meta.get(e.data.path).words} | ${meta.get(e.data.path).photos} |`).join('\n')}\n\n## Categories (posts in each)\n\n${countBy('categories')}\n\n## Tags (posts in each)\n\nTag pages are served noindex, as on the previous site.\n\n${countBy('tags')}`);

  const regions = new Map();
  for (const v of venueList) {
    const r = regions.get(v.region) || new Map();
    const dname = v.district || v.region;
    r.set(dname, [...(r.get(dname) || []), v]);
    regions.set(v.region, r);
  }
  hub('Venues', 'Venues', `${venueList.length} venues from gigFriend, ${venueList.filter(venueHasPage).length} with photos and a page at \`/venue/<slug>\`. ${oneLine(venues._note)}\n\n${[...regions].map(([reg, ds]) => `## ${reg}\n\n${[...ds].map(([dn, vs]) => `### ${dn}\n\n${vs.map((v) => `- ${wl(v.id, v.name)}, ${v.city || ''}${venueHasPage(v) ? ` (${(v.photos || []).filter((x) => photos[x.id]).length} photos)` : ''}`).join('\n')}`).join('\n\n')}`).join('\n\n')}`, 'content/venues.json');

  hub('Redirects', 'Redirects', `Every redirect the site serves, from \`content/redirects.json\`. \`proposed\` entries are served on staging only, until the owner approves them.\n\n| From | To | Status | Note |\n|---|---|---|---|\n${redirects.map((r) => { const t = resolve(r.to); return `| \`${cell(r.from)}\` | ${t?.id ? wl(t.id, r.to, true) : `\`${cell(r.to)}\``} | ${r.status} | ${cell(r.note)} |`; }).join('\n')}`, 'content/redirects.json');

  const missing = [...refs].filter(([, rs]) => rs.some((r) => !r.alt));
  const whereLink = (w) => (notes.has(w) ? wl(notes.get(w), w, true) : `\`${cell(w)}\``);
  hub('Photos', 'Photos', `${Object.keys(photos).length} photos in \`content/photos.json\`, ${refs.size} distinct photos referenced by pages, venues and templates (some no longer served, see below). Photos are written in Markdown as \`![alt text](wix:PHOTO_ID)\`; see [[Knowledge/Photos and Media|Photos and Media]].\n\n## Missing alt text (${missing.length} photos)\n\nAlt text is carried over exactly at launch unless the owner says otherwise. Where the same photo has alt text somewhere else, it is shown as a starting point.\n\n| Photo ID | Used without alt on | Alt text used elsewhere |\n|---|---|---|\n${missing.map(([id, rs]) => `| \`${id}\` | ${[...new Set(rs.filter((r) => !r.alt).map((r) => r.where))].map(whereLink).join(', ')} | ${cell(rs.find((r) => r.alt)?.alt || photos[id]?.alt || '')} |`).join('\n')}\n\n## Not served by the previous host (${Object.keys(unavailable).length})\n\nLeft out of the manifest, so pages skip them. Put the original in \`.media/originals/\` under its ID and run \`npm run media\` to bring one back.\n\n${Object.entries(unavailable).map(([id, ps]) => `- \`${id}\`: ${ps.map((p) => (notes.has(p) ? wl(notes.get(p), p) : p)).join(', ')}`).join('\n')}`, 'content/photos.json');

  const brokenRows = broken.filter((b, i, a) => a.findIndex((x) => x.from === b.from && x.href === b.href) === i);
  const proposed = redirects.filter((r) => r.status === 'proposed');
  hub('Content Gaps', 'Content gaps', `Work the site could use, found by the sync. Items marked **frozen** wait for the owner to lift the [[Knowledge/Launch Freeze|launch freeze]]; a proposal for them can be written now and held. Tags such as \`#wlc/gap/no-description\` mark the same notes, so the tag pane lists them too.

## No meta description (${gaps.noDescription.length}, frozen)

${gaps.noDescription.map((e) => `- ${wl(e.id, title(e))} \`${e.data.path}\``).join('\n')}

## No H1 on the previous site (${gaps.noH1.length}, frozen)

These pages show their heading as an H2 styled like an H1 until the freeze lifts.

${gaps.noH1.map((e) => `- ${wl(e.id, title(e))} \`${e.data.path}\``).join('\n')}

## Thin pages (${gaps.thin.length})

Under 150 words of body text (40 for a product), listings left out.

| Page | Words |
|---|---|
${gaps.thin.sort((a, b) => a.w - b.w).map(({ e, w }) => `| ${wl(e.id, title(e), true)} | ${w} |`).join('\n')}

## Photos without alt text, by page (${gaps.altByPage.size} pages)

${[...gaps.altByPage].sort((a, b) => b[1] - a[1]).map(([p, n]) => `- ${wl(notes.get(p), label(p))}: ${n}`).join('\n')}

Every photo is listed in [[Site/Photos|Photos]].

## Internal links to pages that do not exist (${brokenRows.length})

${brokenRows.map((b) => `- ${wl(notes.get(b.from), label(b.from))} links "${linkText(b.text)}" to \`${b.href}\``).join('\n') || 'None.'}

## Internal links that work only through a proposed redirect (${viaProposed.length})

Until the owner approves the redirect, production serves these links as a 404.

${viaProposed.map((b) => `- ${wl(notes.get(b.from), label(b.from))} links to \`${b.href}\`, redirected to \`${b.to}\``).join('\n') || 'None.'}

## Redirects awaiting the owner's approval (${proposed.length})

${proposed.map((r) => `- \`${r.from}\` to \`${r.to}\`: ${oneLine(r.note)}`).join('\n') || 'None.'}

## Venues with no photos (${venueList.filter((v) => !venueHasPage(v)).length})

Listed on /venue without a page of their own. Tagged \`#wlc/gap/no-photos\`.`);

  const codeBody = Object.entries(CODE_COPY).map(([name, [where, cols, from]]) => {
    const { file, constant } = codeSource(name);
    const raw = code[name];
    if (raw === undefined) return `## ${name}\n\n${where}. Not found as a plain literal: \`${constant}\` in \`${file}\`.`;
    // Copy kept outside templates.js: say which file a proposal targets, and what else reads it.
    const intro = from ? `${where}.\n\nSet as \`${constant}\` in \`${file}\`, the file a proposal must target (\`file: ${file}\`), not \`${TEMPLATES}\`. ${from.note ? from.note(raw) : ''}`.trim() : `${where}.`;
    const v = from?.fields && Array.isArray(raw) ? raw.map((r) => from.fields.map((f) => r?.[f])) : raw;
    let rows;
    if (Array.isArray(v) && v.every(Array.isArray)) rows = v.map((r) => r.map((x) => (typeof x === 'string' && photos[x] ? `\`${x}\`` : cell(x ?? ''))));
    else if (v && typeof v === 'object' && !Array.isArray(v)) rows = Object.entries(v).map(([k, x]) => [cell(k), cell(Array.isArray(x) ? x.filter((y) => y != null).join(': ') : x)]);
    if (!rows) return `## ${name}\n\n${intro}\n\n\`\`\`json\n${JSON.stringify(v, null, 1)}\n\`\`\``;
    const n = Math.max(cols.length, ...rows.map((r) => r.length));
    const head = Array.from({ length: n }, (_, i) => cols[i] || '');
    return `## ${name}\n\n${intro}\n\n| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${Array.from({ length: n }, (_, i) => r[i] ?? '').join(' | ')} |`).join('\n')}`;
  });
  const elsewhere = Object.keys(CODE_COPY).filter((name) => codeSource(name).file !== TEMPLATES);
  const codeFiles = [TEMPLATES, ...new Set(elsewhere.map((name) => codeSource(name).file))];
  const inFile = codeFiles.slice(1).map((f) => {
    const names = elsewhere.filter((name) => codeSource(name).file === f);
    return `${names.join(' and ')} ${names.length === 1 ? 'is' : 'are'} in \`${f}\``;
  });
  const exceptions = inFile.length ? `, except where a section names another file (${inFile.join('; ')})` : '';
  hub('Copy in Code', 'Copy in code', `Some words and photos on the site are set in code, not in a content file: in \`${TEMPLATES}\`${exceptions}. A change to any of these is a code change: the proposal's \`file\` is that file, the proposal names the constant, and Claude edits it. Each section is the constant's current value.\n\nOther fixed text in the templates: the home page tagline \`lighting·decor·drapes·av\` and the "Based on 87+ Reviews on Google" line (\`home\`), and the service area line, which comes from \`areasLine\` in [[Site/Business Facts|Business Facts]].\n\n${codeBody.join('\n\n')}`, codeFiles.length > 1 ? codeFiles.map((f) => `\`${f}\``).join(' and ') : TEMPLATES);

  const navList = (items, depth = 0) => (items || []).map((n) => {
    const r = resolve(n.href);
    return `${'  '.repeat(depth)}- ${r?.id ? wl(r.id, n.label) : `${n.label} (\`${n.href}\`)`}${n.children ? `\n${navList(n.children, depth + 1)}` : ''}`;
  }).join('\n');
  const a = site.address || {};
  hub('Business Facts', 'Business facts', `From \`src/data/site.json\`: the name, address and phone in the footer and in the LocalBusiness structured data on every page. They must match the Google Business Profile character for character (still to confirm, see [[Knowledge/Open Questions|Open Questions]]).

| | |
|---|---|
| Name | ${cell(site.name)} |
| Short name | ${cell(site.shortName)} |
| Website | ${cell(site.url)} |
| Phone | ${cell(site.phone)} |
| Email | ${cell(site.email)} |
| Address | ${cell([a.street, a.city, a.region, a.postalCode].filter(Boolean).join(', '))} |
| Service areas | ${cell((site.serviceAreas || []).join(', '))} |
| Area line | ${cell(site.areasLine)} |
| Social | ${(site.social || []).map((s) => `[${s.label}](${s.href})`).join(', ')} |

## Main menu

${navList(site.nav)}

## Footer

${(site.footer || []).map((c) => `### ${c.heading}\n\n${navList(c.links)}`).join('\n\n')}

### Catalog column

${navList(site.footerCatalog)}`, 'src/data/site.json');

  const counts = {
    pages: entries.length, posts: posts.length, products: products.length, venues: venueList.length,
    venuePages: venueList.filter(venueHasPage).length, photos: Object.keys(photos).length, redirects: redirects.length,
  };
  hub('Site Index', 'Site index', `The website as of \`${repo.branch}\` at \`${repo.commit}\` (${repo.date}): "${oneLine(repo.subject)}".

${counts.pages} content pages (${counts.posts} posts, ${counts.products} products), ${counts.venuePages} venue pages, ${counts.photos} photos, ${counts.redirects} redirects.

- [[Site/Site Map|Site map]]: every URL with its layout, word count, photos and meta description
- [[Site/Services|Services]]: the service cards and their pages
- [[Site/Catalog|Catalog]]: catalog pages, categories, chandelier sorting
- [[Site/Blog|Blog]]: posts, categories, tags
- [[Site/Venues|Venues]]: every venue by area, and the ones with photos
- [[Site/Photos|Photos]]: missing alt text and photos the old host no longer serves
- [[Site/Redirects|Redirects]]
- [[Site/Content Gaps|Content gaps]]: what the site could use, for curation
- [[Site/Copy in Code|Copy in code]]: words that live in the templates, not in content files
- [[Site/Business Facts|Business facts]]: name, address, phone, menus

Folders: ${Object.keys(groups).map((f) => `\`Site/${f}/\``).join(', ')}, \`Site/Venues/\`.`);

  // ---- remove generated notes whose page is gone
  const siteDir = path.join(vault, 'Site');
  const walk = (dir, rel, fn) => {
    if (!fs.existsSync(dir)) return;
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory()) { if (!SKIP_DIRS.has(d.name)) walk(path.join(dir, d.name), `${rel}${d.name}/`, fn); } else fn(path.join(dir, d.name), `${rel}${d.name}`);
    }
  };
  walk(siteDir, 'Site/', (abs, rel) => {
    if (!rel.endsWith('.md') || files.has(rel)) return;
    if (looseFrontMatter(readText(abs)).meta.generated === 'true') {
      if (!dryRun) fs.rmSync(abs);
      report.removed++;
    }
  });

  // ---- seed notes: copied in only where the file does not exist
  const seedDir = path.join(root, 'vault', 'seed');
  const seeds = [];
  const walkSeed = (dir, rel) => {
    if (!fs.existsSync(dir)) return;
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory()) { if (d.name !== '.git') walkSeed(path.join(dir, d.name), `${rel}${d.name}/`); } else seeds.push([path.join(dir, d.name), `${rel}${d.name}`]);
    }
  };
  walkSeed(seedDir, '');
  for (const [abs, rel] of seeds) {
    const target = path.join(vault, ...rel.split('/'));
    if (fs.existsSync(target)) { report.kept++; continue; }
    report.seeded++;
    if (!dryRun) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(abs, target); }
  }
  if (!dryRun) fs.mkdirSync(path.join(vault, 'Curation', 'Proposals'), { recursive: true });

  // ---- the Glow export: every note in the vault, in chunks
  const vaultNote = (rel) => {
    if (files.has(rel)) return files.get(rel);
    const abs = path.join(vault, ...rel.split('/'));
    if (fs.existsSync(abs)) return readText(abs);
    const seed = path.join(seedDir, ...rel.split('/'));
    return fs.existsSync(seed) ? readText(seed) : null;
  };
  const allNotes = new Set(files.keys());
  if (!dryRun) walk(vault, '', (abs, rel) => { if (rel.endsWith('.md')) allNotes.add(rel); });
  for (const [, rel] of seeds) if (rel.endsWith('.md')) allNotes.add(rel);

  const lines = [];
  for (const rel of [...allNotes].sort()) {
    if (rel.split('/').some((p) => SKIP_DIRS.has(p))) continue;
    const text = vaultNote(rel);
    if (text == null) continue;
    const { meta: fm, body } = looseFrontMatter(text);
    const noteTitle = (body.match(/^# (.+)$/m) || [])[1] || rel.replace(/\.md$/, '').split('/').pop();
    const base = { note: rel.replace(/\.md$/, ''), title: oneLine(noteTitle), type: fm.type || (rel.startsWith('Knowledge/') ? 'knowledge' : 'note') };
    if (fm.url) base.url = fm.url;
    if (fm.source) base.source = fm.source;
    if (fm.status) base.status = fm.status;
    if (fm.generated === 'true') base.generated = true;
    let n = 0;
    for (const { heading, text: t } of chunks(plain(body.replace(/^# .+\n/, '')))) {
      lines.push(JSON.stringify({ id: `${base.note}#${n++}`, ...base, section: heading || undefined, text: t }));
    }
    report.notes++;
  }
  report.chunks = lines.length;

  const readVault = (rel) => {
    const t = vaultNote(rel);
    return t == null ? `(${rel} is missing from the vault.)` : looseFrontMatter(t).body.replace(/^# .+\n+/, '').replace(/^(#{2,5}) /gm, '#$1 ').trim();
  };
  const gapCounts = `${gaps.noDescription.length} pages with no meta description and ${gaps.noH1.length} with no H1 (both frozen), ${gaps.thin.length} thin pages, ${missing.length} photos missing alt text on ${gaps.altByPage.size} pages, ${brokenRows.length} broken internal links, ${viaProposed.length} links that rely on a redirect not yet approved, ${proposed.length} redirects awaiting approval.`;
  const brief = `# Glow brief: the Wedding Lighting Co website

From \`decant-rva/website-wlc\`, branch \`${repo.branch}\`, commit \`${repo.commit}\` (${repo.date}). This is the short version. Every note in the vault is in \`index.jsonl\` next to this file, in chunks; look things up there before you write.

## Your rules

${readVault('GLOW.md')}

## The business

${site.name} (${site.shortName}), ${[a.street, a.city, a.region, a.postalCode].filter(Boolean).join(', ')}. Phone ${site.phone}, email ${site.email}. Serves ${(site.serviceAreas || []).join(', ')}. Event lighting, drapes, decor and AV for weddings, corporate events, proms, galas and parties. More in Knowledge/Business Profile.

Services on the site:

${serviceCards.map((c) => `- ${linkText(c.name)} (${c.href}): ${oneLine(c.text)}`).join('\n')}

## Voice

${readVault('Knowledge/Brand Voice.md')}

## The site now

${counts.pages} content pages (${counts.posts} posts, ${counts.products} products), ${counts.venuePages} venue pages, ${counts.photos} photos, ${counts.redirects} redirects. Open work: ${gapCounts} Details in Site/Content Gaps.

## Where to look

- A page's current words: its Site note (\`Site/Pages/<slug>\`, \`Site/Posts/<slug>\`, \`Site/Products/<slug>\`). The \`source\` field is the file in the website repository.
- Words set in code (home hero, banners, review lines, booking scale): Site/Copy in Code.
- Names, address, phone, menus: Site/Business Facts.
- How content is stored, and what each front matter field does: Knowledge/Content Model.
- What may change now and what waits: Knowledge/Launch Freeze.
- Decisions already made: DECISIONS. Where things stand: PROJECT-STATUS.
- How to write a proposal: Curation/Curation Guide and Templates/Proposal.
`;
  const manifest = {
    generated_at: now.toISOString(), repository: 'decant-rva/website-wlc', branch: repo.branch, commit: repo.commit, commit_date: repo.date,
    media, counts, notes: report.notes, chunks: report.chunks, chunk_chars: CHUNK,
    files: { brief: 'brief.md', index: 'index.jsonl' },
    index_fields: ['id', 'note', 'title', 'type', 'url', 'source', 'status', 'generated', 'section', 'text'],
  };
  const glowFiles = { 'brief.md': brief, 'index.jsonl': `${lines.join('\n')}\n`, 'manifest.json': `${JSON.stringify(manifest, null, 2)}\n` };
  const oldManifest = path.join(vault, '_glow', 'manifest.json');
  if (fs.existsSync(oldManifest)) {
    try {
      const old = JSON.parse(readText(oldManifest));
      if (JSON.stringify({ ...old, generated_at: '' }) === JSON.stringify({ ...manifest, generated_at: '' })) glowFiles['manifest.json'] = readText(oldManifest);
    } catch { /* rewrite it */ }
  }
  for (const [f, c] of Object.entries(glowFiles)) put(`_glow/${f}`, c);
  if (glowDir && !dryRun) {
    fs.mkdirSync(glowDir, { recursive: true });
    for (const [f, c] of Object.entries(glowFiles)) fs.writeFileSync(path.join(glowDir, f), c);
  }
  report.briefChars = brief.length;
  report.repo = repo;
  report.counts = counts;
  report.files = files;
  return report;
}

/** Simple `key: value` front matter, enough to read type, url, status and generated. */
function looseFrontMatter(text) {
  const t = text.replace(/\r\n/g, '\n');
  if (!t.startsWith('---\n')) return { meta: {}, body: t };
  const end = t.indexOf('\n---', 4);
  if (end < 0) return { meta: {}, body: t };
  const meta = {};
  for (const line of t.slice(4, end).split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].replace(/^"(.*)"$/, '$1').trim();
  }
  return { meta, body: t.slice(t.indexOf('\n', end + 1) + 1) };
}

/** Sections of at most CHUNK characters, split at headings, then paragraphs, then sentences. */
function chunks(text) {
  const out = [];
  let heading = '';
  let buf = [];
  const flush = () => {
    const body = buf.join('\n').trim();
    buf = [];
    if (!body) return;
    let cur = '';
    const cut = (t) => (t.length <= CHUNK ? [t] : t.match(new RegExp(`[\\s\\S]{1,${CHUNK}}(?=\\s|$)|[\\s\\S]{1,${CHUNK}}`, 'g')));
    const pieces = body.split(/\n\s*\n/).flatMap((p) => (p.length <= CHUNK ? [p] : p.split('\n').flatMap(cut))).filter((p) => p.trim());
    for (const p of pieces) {
      if (cur && cur.length + p.length + 2 > CHUNK) { out.push({ heading, text: cur }); cur = ''; }
      cur = cur ? `${cur}${p.startsWith('|') && cur.endsWith('|') ? '\n' : '\n\n'}${p}` : p;
    }
    if (cur) out.push({ heading, text: cur });
  };
  for (const line of text.split('\n')) {
    const m = line.match(/^#{1,4} (.+)$/);
    if (m) { flush(); heading = m[1].trim(); } else buf.push(line);
  }
  flush();
  return out.map((c) => ({ heading: c.heading, text: c.text.length > CHUNK ? c.text.slice(0, CHUNK) : c.text }));
}

// ---------------------------------------------------------------- command line

function main(argv) {
  const args = { media: 'wix' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [k, v] = a.includes('=') ? a.split(/=(.*)/s) : [a, undefined];
    if (k === '--glow-dir') args.glowDir = v ?? argv[++i];
    else if (k === '--media') args.media = v ?? argv[++i];
    else if (k === '--dry-run') args.dryRun = true;
    else if (k === '--help' || k === '-h') args.help = true;
    else rest.push(a);
  }
  if (args.help || !rest[0]) {
    console.log('Usage: node tools/vault-sync.js <vault-dir> [--glow-dir <dir>] [--media wix|none|<base-url>] [--dry-run]');
    process.exit(args.help ? 0 : 1);
  }
  const r = sync({ vault: rest[0], glowDir: args.glowDir, media: args.media, dryRun: args.dryRun });
  const c = r.counts;
  console.log(`${args.dryRun ? 'Dry run. ' : ''}Vault: ${path.resolve(rest[0])}`);
  console.log(`Website: ${r.repo.branch} at ${r.repo.commit} (${r.repo.date})`);
  console.log(`Site notes: ${c.pages} pages, ${c.venues} venues and the hub notes. ${r.written} written, ${r.unchanged} unchanged, ${r.removed} removed.`);
  console.log(`Seed notes: ${r.seeded} added, ${r.kept} already there and left alone.`);
  console.log(`Glow export: ${r.notes} notes in ${r.chunks} chunks, brief ${r.briefChars} characters${args.glowDir ? `, copied to ${path.resolve(args.glowDir)}` : ''}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) main(process.argv.slice(2));
