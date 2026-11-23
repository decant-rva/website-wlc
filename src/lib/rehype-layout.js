// Gives the flat Markdown output the structure the design needs:
//   three or more photos in a row   -> <div class="gal">
//   one large photo on its own      -> <figure class="fig">
//   a transparent PNG (logo, drawing) -> <p class="icon"> or <p class="graphic"> by size
//   paragraphs holding one internal link each, in a row -> <div class="actions"> of .btn links
//   a paragraph holding one external link -> <p class="credit"> (photo credits)
import fs from 'node:fs';
import path from 'node:path';
import { capDensity } from './photos.js';

const ICON_MAX = 420;

// Page names by path, so a link that wraps a photo with no alt text still has
// a name for screen readers. The alt text itself is left as authored.
const names = new Map();
for (const dir of ['pages', 'posts', 'products']) {
  const base = path.resolve(process.cwd(), 'content', dir);
  for (const file of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    const head = fs.readFileSync(path.join(base, file), 'utf8').split('\n---', 1)[0];
    const at = head.match(/^path: (".*")$/m);
    const title = head.match(/^title: (".*")$/m);
    if (at && title) names.set(JSON.parse(at[1]), JSON.parse(title[1]).split(' | ')[0]);
  }
}

function nameLinks(node) {
  for (const child of node.children || []) {
    if (child.type !== 'element') continue;
    if (child.tagName === 'a' && !child.properties.ariaLabel) {
      const text = JSON.stringify(child).match(/"type":"text","value":"[^"]*\S/);
      const alts = [...JSON.stringify(child).matchAll(/"alt":"([^"]*)"/g)].map((m) => m[1]);
      const label = names.get(String(child.properties.href || '').split('?')[0]);
      if (!text && alts.length && alts.every((a) => !a.trim()) && label) child.properties.ariaLabel = label;
    }
    nameLinks(child);
  }
}

const isEl = (n, tag) => n && n.type === 'element' && (!tag || n.tagName === tag);
const blank = (n) => n.type === 'text' && !n.value.trim();
const kids = (n) => (n.children || []).filter((c) => !blank(c));

function photoOf(p) {
  if (!isEl(p, 'p')) return null;
  const c = kids(p);
  if (c.length !== 1) return null;
  let node = c[0];
  const holder = node;
  if (isEl(node, 'a') && kids(node).length === 1) node = kids(node)[0];
  if (isEl(node, 'picture')) node = node.children.find((x) => isEl(x, 'img'));
  if (!isEl(node, 'img')) return null;
  // Small transparent PNGs are icons. Large ones are logos or drawings when
  // they stand alone, and product photos when they sit in a row of photos.
  const png = /\.(png|svg|gif)$/i.test(String(node.properties.src || ''));
  const width = Number(node.properties.width) || 0;
  return { holder, width, png, icon: png && width <= ICON_MAX };
}

function linkOf(p) {
  if (!isEl(p, 'p')) return null;
  const c = kids(p);
  if (c.length !== 1 || !isEl(c[0], 'a')) return null;
  if (!c[0].children.every((x) => x.type === 'text')) return null;
  return c[0];
}

const el = (tagName, className, children) => ({ type: 'element', tagName, properties: { className: [className] }, children });

function group(parent) {
  const input = parent.children.filter((c) => !blank(c));
  const out = [];
  let seenHeading = false;
  for (let i = 0; i < input.length; i++) {
    const node = input[i];
    if (isEl(node) && /^h[1-6]$/.test(node.tagName)) seenHeading = true;

    const photo = photoOf(node);
    const nextPhoto = photo && !photo.icon ? photoOf(input[i + 1]) : null;
    const prevWasPhoto = out.length > 0 && out[out.length - 1].properties?.className?.includes('gal');
    if (photo && !photo.icon && (!photo.png || prevWasPhoto || (nextPhoto && !nextPhoto.icon))) {
      const run = [photo.holder];
      while (i + 1 < input.length) {
        const next = photoOf(input[i + 1]);
        if (!next || next.icon) break;
        run.push(next.holder);
        i++;
      }
      if (prevWasPhoto) {
        out[out.length - 1].children.push(...run);
        continue;
      }
      if (run.length >= 3) {
        // Gallery tiles are small, so the browser can pick a smaller file.
        for (const r of run) {
          const pic = isEl(r, 'a') ? kids(r)[0] : r;
          for (const c of pic.children || []) {
            if (isEl(c, 'source')) c.properties = { ...c.properties, sizes: capDensity('(min-width: 62rem) 20vw, 50vw') };
          }
        }
        const g = el('div', 'gal', run);
        if (!seenHeading) g.properties.className.push('lead');
        out.push(g);
      } else {
        for (const r of run) out.push(el('figure', 'fig', [r]));
      }
      continue;
    }
    if (photo) {
      node.properties = { ...node.properties, className: [photo.width > ICON_MAX ? 'graphic' : 'icon'] };
      out.push(node);
      continue;
    }

    const link = linkOf(node);
    if (link && String(link.properties.href || '').startsWith('/')) {
      const run = [link];
      while (i + 1 < input.length) {
        const next = linkOf(input[i + 1]);
        if (!next || !String(next.properties.href || '').startsWith('/')) break;
        run.push(next);
        i++;
      }
      for (const a of run) a.properties = { ...a.properties, className: ['btn'] };
      out.push(el('div', 'actions', run));
      continue;
    }
    if (link) {
      node.properties = { ...node.properties, className: ['credit'] };
      out.push(node);
      continue;
    }

    if (isEl(node) && (node.tagName === 'section' || node.tagName === 'div')) group(node);
    // A list whose every item starts with a photo is a grid of captioned tiles.
    if (isEl(node, 'ul')) {
      const items = kids(node).filter((c) => isEl(c, 'li'));
      const lead = (li) => { const f = kids(li)[0]; return isEl(f, 'picture') || isEl(f, 'img') || isEl(f, 'comment') || f?.type === 'comment'; };
      if (items.length && items.every(lead)) {
        node.properties = { ...node.properties, className: ['tiles'] };
        for (const li of items) {
          for (const c of kids(li)[0].children || []) {
            if (isEl(c, 'source')) c.properties = { ...c.properties, sizes: capDensity('(min-width: 62rem) 25vw, 50vw') };
          }
        }
      }
    }
    out.push(node);
  }
  parent.children = out;
}

// The page header prints the H1 from the front matter, so a copy in the body is dropped.
function dropH1(tree) {
  tree.children = tree.children.filter((c) => !isEl(c, 'h1'));
}

export function rehypeLayout() {
  return (tree) => { dropH1(tree); group(tree); nameLinks(tree); };
}
