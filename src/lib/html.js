// Small HTML builders shared by the page templates. Everything here returns a
// string of static markup; nothing runs in the browser.
import site from '../data/site.json';
import { picture as sourcesFor, photos } from './photos.js';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Inline Markdown: bold and links. Enough for the short runs of text the templates place by hand. */
export function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\\_/g, '_');
}

/**
 * Splits a Markdown body into blocks the templates can lay out by hand:
 *   ['img', id, alt, href|null]  ['h', level, text]  ['p', text]
 *   ['ul'|'ol', items]  ['link', label, href]  ['raw', html]
 */
export function blocks(body) {
  const out = [];
  for (const chunk of String(body || '').trim().split(/\n\s*\n/)) {
    const c = chunk.trim();
    if (!c) continue;
    if (c.startsWith('<!--')) continue;
    if (c.startsWith('<')) { out.push(['raw', c]); continue; }
    let m = c.match(/^\[!\[([^\]]*)\]\(wix:([^)]+)\)\]\(([^)]+)\)$/);
    if (m) { out.push(['img', decodeURIComponent(m[2]), m[1], m[3]]); continue; }
    m = c.match(/^!\[([\s\S]*)\]\(wix:([^)]+)\)$/);
    if (m) { out.push(['img', decodeURIComponent(m[2]), m[1].replace(/\\_/g, '_'), null]); continue; }
    m = c.match(/^(#{1,4})\s*([\s\S]*)$/);
    if (m) { if (m[2].trim()) out.push(['h', m[1].length, m[2].trim()]); continue; }
    if (/^(- |\d+\. )/.test(c)) {
      const items = c.split('\n').filter((l) => l.trim()).map((l) => l.replace(/^(- |\d+\. )/, ''));
      out.push([/^\d/.test(c) ? 'ol' : 'ul', items]);
      continue;
    }
    m = c.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (m) { out.push(['link', m[1], m[2]]); continue; }
    out.push(['p', c]);
  }
  return out;
}

/** Alt text that is only a file name says nothing, so it is dropped. */
export const cleanAlt = (a) => (/\.(jpe?g|png|webp)$/i.test(String(a || '').trim()) ? '' : String(a || ''));

/**
 * A responsive photo for a photo ID. Empty string when the photo is not in the manifest.
 * The templates use a plain <img> with a WebP srcset and a JPEG fallback, not <picture>:
 * the layout rules count and select images as direct children, and a wrapper breaks them.
 */
export function pic(id, { alt, sizes = '(min-width: 62rem) 50vw, 100vw', eager = false, cls = '' } = {}) {
  const p = sourcesFor(id, sizes);
  if (!p) return '';
  const text = esc(cleanAlt(alt ?? photos[id]?.alt ?? ''));
  const load = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  const c = cls ? ` class="${cls}"` : '';
  if (p.single) return `<img${c} src="${p.single}" alt="${text}" width="${p.width}" height="${p.height}" ${load} decoding="async">`;
  return `<img${c} src="${p.fallback}" srcset="${p.webp}" sizes="${p.sizes}" alt="${text}" width="${p.width}" height="${p.height}" ${load} decoding="async">`;
}

/** Breadcrumb: string lights. trail is [{ name, path }], home first. */
export function crumbs(trail) {
  if (!trail.length) return '';
  const last = trail[trail.length - 1];
  const links = trail.slice(0, -1).map((c) => `<li><a href="${c.path}">${esc(c.name)}</a></li>`).join('');
  return `<nav class="crumbs bc bc7" aria-label="Breadcrumb"><ol>${links}<li><span aria-current="page">${esc(last.name)}</span></li></ol></nav>`;
}

/** Navy page header with the breadcrumb, the H1 and an optional lede. */
export function pageHead(h1, trail, { lede = '', extra = '', cls = '', tag = 'h1' } = {}) {
  // tag: a page that had no H1 on the previous site keeps its heading as an H2 until the launch freeze lifts.
  const hs = (Array.isArray(h1) ? h1 : [h1]).map((t) => `<${tag}${tag === 'h1' ? '' : ' class="h1"'}>${inline(t)}</${tag}>`).join('');
  return `<header class="ph${cls ? ' ' + cls : ''}">${crumbs(trail)}${hs}${lede ? `<p class="lede">${inline(lede)}</p>` : ''}${extra}</header>`;
}

const emailHref = esc(site.emailHref);

/** Closing band on most pages. */
export const cta = () => `<section class="cta"><h2>Tell us about your event!</h2><div class="actions"><a class="btn solid" href="/get-a-quote">Get A Quote</a><a class="btn" href="tel:${site.phone}">${site.phone}</a><a class="btn" href="${emailHref}">${site.email}</a></div></section>`;

/** Closing band on the blog and About. */
export const friends = (heading = "Let's be friends!") => `<section class="cta ctaf"><h2>${esc(heading)}</h2><div class="actions"><a class="btn solid" href="sms:${site.phone}">Text Us</a><a class="btn" href="tel:${site.phone}">Call us</a><a class="btn" href="mailto:${site.email}">Email us</a><a class="btn" href="${site.social[0].href}">Tag us on Instagram</a></div></section>`;

/** Lays out a run of blocks as ordinary prose: galleries, figures, buttons, headings, lists. */
export function prose(bl, { skipH1 = true } = {}) {
  let o = '';
  for (let i = 0; i < bl.length; i++) {
    const b = bl[i];
    if (b[0] === 'img') {
      let j = i;
      while (j < bl.length && bl[j][0] === 'img') j++;
      const g = bl.slice(i, j);
      if (g.length >= 3) o += `<div class="gal">${g.map((x) => pic(x[1], { alt: x[2], sizes: '(min-width: 62rem) 25vw, 50vw' })).join('')}</div>`;
      else o += g.map((x) => `<figure class="fig">${pic(x[1], { alt: x[2], sizes: '(min-width: 62rem) 46rem, 100vw' })}</figure>`).join('');
      i = j - 1;
      continue;
    }
    if (b[0] === 'link') {
      let j = i;
      while (j < bl.length && bl[j][0] === 'link') j++;
      o += `<div class="actions">${bl.slice(i, j).map((x) => `<a class="btn" href="${x[2]}">${esc(x[1])}</a>`).join('')}</div>`;
      i = j - 1;
      continue;
    }
    if (b[0] === 'h') {
      if (b[1] === 1 && skipH1) continue;
      const lv = Math.max(b[1], 2);
      o += `<h${lv}>${inline(b[2])}</h${lv}>`;
    } else if (b[0] === 'p') o += `<p>${inline(b[1])}</p>`;
    else if (b[0] === 'ul' || b[0] === 'ol') o += `<${b[0]}>${b[1].map((x) => `<li>${inline(x)}</li>`).join('')}</${b[0]}>`;
    else if (b[0] === 'raw') o += b[1];
  }
  return o;
}

export const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
