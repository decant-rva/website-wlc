// Page templates. Each takes a content entry and returns
//   { html, bodyClass, closing, quoteBar }
// html is the markup that goes inside <main>. Returning null means the page
// uses the default layout: navy header, then the Markdown as prose.
import fs from 'node:fs';
import path from 'node:path';
import site from '../data/site.json';
import { allEntries, firstPhoto, latestPosts, trail as trailFor } from './entries.js';
import { photos } from './photos.js';
import { blocks, cleanAlt, crumbs, cta, esc, fmtDate, friends, inline, pageHead, pic, prose } from './html.js';

const sentences = (s) => s.split(/(?<=[.?!])\s+/);

/** The photo a card shows for a page: its share image if we hold it, else the first photo in its body. */
function cardPhoto(entry) {
  const m = String(entry.data.og?.['og:image'] || '').match(/media\/([^/]+)/);
  const og = m ? decodeURIComponent(m[1]) : null;
  return og && photos[og] ? og : firstPhoto(entry);
}

function postCard(entry) {
  const d = entry.data;
  const id = cardPhoto(entry);
  const date = d.schema?.datePublished ? fmtDate(d.schema.datePublished) : '';
  return `<li><a href="${d.path}">${id ? pic(id, { alt: '', sizes: '(min-width: 62rem) 24rem, 100vw' }) : ''}<span class="ct"><span class="cd">${date}</span><span class="cn">${esc(d.h1[0] || d.title)}</span><span class="cs">${esc(d.description)}</span></span></a></li>`;
}

function productCard(entry) {
  const d = entry.data;
  const id = cardPhoto(entry);
  const name = d.h1[0] || d.title.split(' | ')[0];
  return `<li><a href="${d.path}">${id ? pic(id, { alt: '', sizes: '(min-width: 62rem) 18rem, 50vw' }) : '<span class="noimg"></span>'}<span class="cn">${esc(name)}</span></a></li>`;
}

// ---- product: fixture in a pool of light, name and buttons beside it, description and specs below
const SPEC = /\s*(Dimensions|Weight \(lbs\)|Color|Bulbs|Power|Wattage)\s+/;
function product(entry, trail, h) {
  const bl = blocks(entry.body);
  const img = bl.find((b) => b[0] === 'img');
  let specs = '';
  const keep = [];
  for (const b of bl) {
    if (b[0] === 'img' || (b[0] === 'h' && b[1] === 1)) continue;
    if (b[0] === 'ul' && b[1].length === 1 && b[1][0].startsWith('Dimensions')) {
      const parts = b[1][0].split(SPEC);
      let rows = '';
      for (let i = 1; i + 1 < parts.length; i += 2) rows += `<div><dt>${esc(parts[i])}</dt><dd>${esc(parts[i + 1])}</dd></div>`;
      specs = `<div class="k-spec pd-spec"><h2>Specs</h2><dl>${rows}</dl></div>`;
    } else keep.push(b);
  }
  const h1 = `<${h.tag}${h.tag === 'h1' ? '' : ' class="h1"'}>${inline(h.text)}</${h.tag}>`;
  const actions = '<div class="actions"><a class="btn solid" href="/get-a-quote">Get A Quote</a><a class="btn" href="/catalog">Browse Catalog</a></div>';
  const photo = img ? `<figure class="px-pool">${pic(img[1], { alt: img[2], sizes: '(min-width: 62rem) 30rem, 22rem', eager: true })}</figure>` : '';
  const html = `<div class="px px1"><section class="px-stage"><div class="px-in">${crumbs(trail)}<div class="px-sg">${photo}<div class="px-t">${h1}${actions}</div></div></div></section><div class="px-in px-two"><div class="px-copy">${prose(keep)}</div>${specs}</div></div>`;
  return { html, bodyClass: 'prod pxo', quoteBar: false };
}

// ---- blog post: navy "lights down", numbered chapters, taped prints
function leadLi(h) {
  return h.replace(/<li>([\s\S]*?)<\/li>/g, (_, x) => {
    const a = x.split(/(?<=[.!?])\s+/);
    return `<li><b>${a[0]}</b>${a.length > 1 ? ' ' + a.slice(1).join(' ') : ''}</li>`;
  });
}
function post(entry, trail, h) {
  const d = entry.data;
  let rest = blocks(entry.body);
  const k = rest.findIndex((b) => b[0] === 'h' && b[1] === 1);
  if (k >= 0) rest = rest.slice(k + 1);
  let lede = '';
  if (rest[0]?.[0] === 'p') { lede = rest[0][1]; rest = rest.slice(1); }
  const date = d.schema?.datePublished ? `<p class="meta"><time datetime="${esc(d.schema.datePublished)}">${fmtDate(d.schema.datePublished)}</time></p>` : '';
  // The main photo moves up into the header as a taped print.
  const first = rest.find((b) => b[0] === 'img');
  if (first) rest = rest.filter((b) => b !== first);
  let head = pageHead(h.text, trail, { lede, extra: date, tag: h.tag });
  if (first) head = head.replace('<header class="ph">', '<header class="ph bq-hd"><div>').replace('</header>', `</div><div class="bq-ph">${prose([first])}</div></header>`);
  // One chapter per heading. Anything before the first heading joins the first chapter.
  let segs = [[]];
  for (const b of rest) { if (b[0] === 'h') segs.push([]); segs[segs.length - 1].push(b); }
  const pre = segs[0];
  segs = segs.slice(1);
  if (!segs.length) segs = [pre];
  else if (pre.length) segs[0] = [segs[0][0], ...pre, ...segs[0].slice(1)];
  let out = '';
  for (const sg of segs) {
    const imgs = sg.filter((b) => b[0] === 'img');
    const txt = sg.filter((b) => b[0] !== 'img');
    const body = `<div class="prose post bp">${leadLi(prose(txt))}</div>`;
    out += imgs.length
      ? `<section class="bq-ch has${imgs.length > 1 ? ' two' : ''}"><div class="bq-in">${body}<div class="bq-ph">${imgs.map((b) => prose([b])).join('')}</div></div></section>`
      : `<section class="bq-ch"><div class="bq-in">${body}</div></section>`;
  }
  return { html: `${head}<div class="bq-chs">${out}</div>${friends()}`, bodyClass: 'bpp bq bq11', closing: false };
}

// ---- blog index, category and tag listings
async function postListing(entry, trail, h) {
  const d = entry.data;
  let list = await latestPosts(Infinity);
  if (d.template === 'blog-category') list = list.filter((e) => (e.data.categories || []).includes(d.path));
  if (d.template === 'blog-tag') list = list.filter((e) => (e.data.tags || []).includes(d.path));
  // Line under the heading on the blog home page, supplied by the owner.
  const lede = d.template === 'blog-index' ? 'We design events. We set them up. We take them down. Then we come back here to talk about how much fun we had.' : '';
  return { html: `${pageHead(h.text, trail, { lede, tag: h.tag })}<ul class="posts big">${list.map(postCard).join('')}</ul>`, bodyClass: 'bgx' };
}

// ---- store category: product grid
async function storeCategory(entry, trail, h) {
  const entries = await allEntries();
  const cards = (entry.data.items || []).map((p) => entries.get(p)).filter(Boolean).map(productCard).join('');
  return { html: `${pageHead(h.text, trail, { tag: h.tag })}<ul class="prods">${cards}</ul>` };
}

// ---- FAQ: first heading is the lede, each following heading opens its answer
function faq(entry, trail, h) {
  const bl = blocks(entry.body);
  const hs = bl.map((b, i) => (b[0] === 'h' ? i : -1)).filter((i) => i >= 0);
  if (hs.length < 2) return null;
  const outro = bl[bl.length - 1][0] === 'p' && hs[hs.length - 1] < bl.length - 2 ? bl[bl.length - 1] : null;
  const end = outro ? bl.length - 1 : bl.length;
  let o = '';
  hs.slice(1).forEach((n, a) => {
    const next = hs[a + 2] ?? end;
    o += `<details${a === 0 ? ' open' : ''}><summary><h2>${inline(bl[n][2])}</h2></summary>${prose(bl.slice(n + 1, next))}</details>`;
  });
  return { html: `${pageHead(h.text, trail, { lede: bl[hs[0]][2], tag: h.tag })}<div class="faq">${o}${outro ? `<p class="out">${inline(outro[1])}</p>` : ''}</div>` };
}

// ---- package pricing: every look with its price on a strip of tape, lowest first
function packages(entry, trail, h) {
  const bl = blocks(entry.body);
  const firstImg = bl.findIndex((b) => b[0] === 'img');
  const intro = bl.slice(0, firstImg).filter((b) => b[0] === 'p');
  const looks = [];
  for (let i = firstImg; i < bl.length; i++) {
    if (bl[i][0] === 'img' && bl[i + 1]?.[0] === 'p' && /^\$[\d,]+$/.test(bl[i + 1][1])) looks.push([Number(bl[i + 1][1].replace(/\D/g, '')), bl[i], bl[i + 1][1]]);
  }
  looks.sort((a, b) => a[0] - b[0]);
  const cards = looks.map(([, img, price], k) => `<li><figure>${pic(img[1], { alt: img[2], sizes: '(min-width: 62rem) 24rem, 50vw', eager: k < 3 })}<figcaption>${esc(price)}</figcaption></figure></li>`).join('');
  const html = `${pageHead(h.text, trail, { lede: intro[0]?.[1], tag: h.tag })}${intro[1] ? `<p class="pk-cat">${inline(intro[1][1])}</p>` : ''}<ul class="pk-grid">${cards}</ul>`;
  return { html, bodyClass: 'pkp' };
}

// ---- contact: the back of a postcard
const CONTACT_PHOTO = 'a16fb7_0ac2079ce2cb4034bb0b3e43ce048cb0~mv2.jpg';
function contact(entry, trail, h) {
  const intro = blocks(entry.body).find((b) => b[0] === 'p')?.[1] || '';
  const s = sentences(intro);
  const rows = [
    ['Phone:', site.phone, `tel:${site.phone}`],
    ['Instagram:', '@weddinglightingco', site.social[0].href],
    ['Email:', 'Info@weddinglightingco.com', 'mailto:Info@weddinglightingco.com'],
  ].map(([a, v, u]) => `<div><dt>${a}</dt><dd><a href="${u}">${esc(v)}</a></dd></div>`).join('')
    + '<div><dt>Admin Office (No Appointments):</dt><dd>1535 West Ave Richmond VA Suite 13</dd></div>';
  const html = `${pageHead('CONTACT US', trail, { lede: s.slice(0, 2).join(' '), tag: h.tag })}<section class="cn-pc"><div class="cn-post"><figure>${pic(CONTACT_PHOTO, { alt: '', sizes: '(min-width: 62rem) 30rem, 100vw', eager: true })}</figure><div class="cn-back"><span class="cn-stamp" aria-hidden="true"></span><p class="cn-mark">${site.areasLine}</p><dl>${rows}</dl></div></div><p class="cn-after">${esc(s.slice(2).join(' '))}</p></section>`;
  return { html, bodyClass: 'ctp ctp5', closing: false };
}


// ---- shared pieces for the home, services and catalog pages
const STARS = '<span class="stars" role="img" aria-label="5 Star Google reviews">★★★★★</span>';
const photoUrl = (id) => (photos[id] ? `/media/${photos[id].fallback || photos[id].file}` : '');
const stem = (id) => id.replace(/~mv2/, '').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

const FEATURED = [['Brides', 263, 64], ['Virginia Weddings', 263, 102], ['Carats & Cake', 230, 86], ['MunaLuchi Bride', 253, 88],
  ['Style Me Pretty', 285, 84], ['WedVibes', 244, 23], ['Maharani Weddings', 284, 87], ['Richmond Weddings', 273, 76]];
const featured = () => `<section class="featured"><h2>FEATURED</h2><ul class="logos">${FEATURED.map(([a, w, h], n) => `<li><img src="/img/featured/f${n + 1}.webp" alt="${esc(a)}" width="${w}" height="${h}" loading="lazy"></li>`).join('')}</ul></section>`;

/** The service cards on /services: photo, name, description, link. */
function serviceCards(bl) {
  const out = [];
  for (let i = 0; i + 3 < bl.length; i++) {
    if (bl[i][0] === 'img' && bl[i + 1][0] === 'h' && bl[i + 3][0] === 'link') {
      out.push({ img: bl[i], name: bl[i + 1][2], text: bl[i + 2][1], label: bl[i + 3][1], href: bl[i + 3][2] });
      i += 3;
    }
  }
  return out;
}
// Discipline colour for each service: lights blue, decor green, AV red, drapes magenta.
const DISCIPLINE = { Drapes: 'dr', 'Silk Florals & Trees': 'de', Decor: 'de', 'LED Dance Floor': 'de', Video: 'av', 'Live Audio': 'av', 'Special Effects': 'av' };

// ---- home
const HERO = [
  ['a16fb7_eb019a8fec284cbfb21d0b8c6fa4f89a~mv2.jpg', 'twinkle light canopy in a clear top tent for a wedding at virginia house in richmond', ''],
  ['a16fb7_97fb74ec43184eb4944d3e1fae6e2c70~mv2.jpg', 'Cool blue uplighting around the dominion club ballroom', 'hx h2'],
  ['a16fb7_36c036f4c13848dbadff5b21896dc4a2~mv2.jpg', 'rattan chandeliers pendants and lanterns for garden wedding maymont virginia', 'hx h3'],
];
const INTRO = [
  ['lighting, drapes, decor & more', "Find expert advice, exquisite designs, high quality rentals, and experienced industry insight for your event. Our lighting, decor & AV pros will bring your event vision to life with a turn-key solutions that meet and exceed your expectations. We can't wait to talk about your ideas, here's how we can help.", 'Services', '/services'],
  ['find something you love', "Our team has helped design and implement thousands of thoughtful & creative lighting designs, decor treatments, & turn-key AV solutions that perfectly fit out clients' needs. Customers praise our creative event designers, flexible, experienced techs, and responsive sales staff.", 'Reviews', '/reviews'],
  ['special events, weddings, & parties', 'Our team of skilled designers and technicians have experience with weddings, meetings, proms, mitzvahs, galas, & fundraising events. Bring us your event of any size and we will help you curate a distinctive ambience for you and your guests to enjoy.', 'Gallery', '/portfolio'],
];
const BANNERS = [
  ['EXPERT', 'production to magnify your brand', '/services', 'a16fb7_e7ec7767c1fc41dca5bb2dd0cad26c91~mv2.jpg'],
  ['RENTALS', 'lighting & decor that perfectly fits your vibe', '/catalog', 'a16fb7_a8fbfed6a6e04faf9118be08eaa48303~mv2.jpg'],
  ['DESIGNS', 'that excede all expectation', '/venue', 'a16fb7_fe3609d0bd0b4792b65d8141d5ebcbb5~mv2.jpg'],
  ['SUPPORT', 'for the designs of your dreams', null, 'a16fb7_31dd89c22bfa4dc4b465d985b258e73d~mv2.jpg'],
];
async function home(entry, trail, h) {
  const entries = await allEntries();
  const bl = blocks(entry.body);
  const h1 = `<h1>${inline(h.text)}</h1>`;
  const txt = `<p class="sub">lighting·decor·drapes·av</p>${h1}<p class="rating">${STARS}Based on 87+ <a href="/reviews">Reviews on Google</a></p><div class="actions"><a class="btn solid" href="/get-a-quote">Get A Quote</a><a class="btn" href="/catalog">Browse Catalog</a><a class="btn" href="/services">Explore Services</a></div>`;
  const slides = HERO.map(([id, alt, cls], n) => pic(id, { alt, cls, eager: n === 0, sizes: '(min-width: 62rem) 60vw, 100vw' })).join('');
  const hero = `<section class="hero"><img class="badge" src="/img/badge.webp" alt="" width="480" height="480"><div class="txt">${txt}</div><div class="pic"><p class="locs">${site.areasLine}</p>${slides}<input class="hp" type="checkbox" aria-label="Pause photo changes"></div></section>`;
  const intro = `<section class="intro"><h2>The Wedding Lighting Company</h2><div class="cols">${INTRO.map(([h, p, label, href]) => `<div><h3>${esc(h)}</h3><p>${esc(p)}</p><a class="lnk" href="${href}">${label}</a></div>`).join('')}</div></section>`;
  const bans = `<section class="banners">${BANNERS.map(([a, b, href, id]) => `${href ? `<a class="ban" href="${href}">` : '<div class="ban">'}${pic(id, { alt: '', sizes: '(min-width: 62rem) 25vw, 50vw' })}<span class="bt"><b>${a}</b><span>${esc(b)}</span></span>${href ? '</a>' : '</div>'}`).join('')}</section>`;
  const k = bl.findIndex((b) => b[0] === 'raw' && b[1].includes('about'));
  const ab = k >= 0 ? bl.slice(k + 1) : [];
  const aimg = ab.find((b) => b[0] === 'img');
  const about = aimg ? `<section class="about"><figure>${pic(aimg[1], { alt: 'wedding decorators' })}</figure><div>${prose(ab.filter((b) => b[0] !== 'img' && b[0] !== 'raw'))}</div></section>` : '';
  const cards = serviceCards(blocks(entries.get('/services').body));
  const tiles = `<section class="svct"><h2>Services</h2><ul>${cards.map((c) => `<li><a class="${DISCIPLINE[c.name] || 'li'}" href="${c.href}">${pic(c.img[1], { alt: '', sizes: '8rem' })}<span>${inline(c.name)}</span></a></li>`).join('')}</ul></section>`;
  return { html: `${hero}${intro}<div class="fband">${featured()}</div>${bans}${cta()}${about}${tiles}`, bodyClass: 'home', closing: false };
}

// ---- services
const SERVICE_BAND = {
  Chandeliers: ['a16fb7_36c036f4c13848dbadff5b21896dc4a2~mv2.jpg', 'rattan chandeliers pendants and lanterns for garden wedding maymont virginia'],
  'Decor Lighting': ['a16fb7_b75aac01b2954f8480184c0079bff80c~mv2.jpg', 'Wireless lamps illuminate a silent auction at ACCA shriners Center'],
  Drapes: ['a16fb7_71c012443fef449299dc3ae33686b904~mv2.jpg', 'drape door archways bolling haxall house'],
  'Dance Floor Lighting': ['a16fb7_bb9ac2c3f9ca41f0adef2b2cba412822~mv2.jpg', 'disco mirror ball decor rental for wedding'],
  Gobos: ['a16fb7_2a99912274c243c39a3703f316747b19~mv2.jpg', 'HD starry night projections science museum of virginia'],
  'Silk Florals & Trees': ['a16fb7_6588838e1b074ab3b534b50f117427c7~mv2.jpg', 'rattan and silk florals maymont nature center'],
  Uplighting: ['a16fb7_fda6905df6b544d383ecb12b1761fc95~mv2.jpg', 'cool and warm wedding uplighting at science museum of virginia'],
  'LED Dance Floor': ['a16fb7_843bce82816247059b42973b21935ca7~mv2.jpg', 'RED LED Dance Floor for a concert event'],
  Decor: ['a16fb7_eb914fbb130040de88b4a978d2da77b9~mv2.jpg', 'greenery and lighting centerpiece hung over the entire dance floor'],
  'String Lighting': ['a16fb7_8c8fa4a1d16f4414b4ad9ca16d77ec11~mv2.jpg', 'Bistro Lighting over the wedding reception area at Wintergreen; Nellysford, Virginia'],
  'Pin Spots': ['a16fb7_b89c9d7696cd49e4ab98e5007298b28e~mv2.jpg', 'pin spots lights john marshall ballroom'],
  'Special Effects': ['a16fb7_71aafeb5650c4f48b1afe45f3fa14ecf~mv2.jpg', 'Wedding special effects confetti blast wedding decor trends 2024'],
  Video: ['a16fb7_11544e25cf0f404abb99e3d7420ba2e5~mv2.jpg', 'custom branding texture projections for corporate event'],
};
// Changes the photo and the service name every three seconds. Stops for reduced motion or when paused.
const BAND_JS = `<script>(()=>{if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;const s=document.querySelector('.svb'),D=JSON.parse(s.dataset.s),[a,b]=s.querySelectorAll('img'),l=s.querySelector('.svn a'),p=s.querySelector('.hp');let i=0,t=0;setInterval(()=>{if(p.checked)return;const d=D[i=(i+1)%D.length],n=new Image;n.onload=()=>{const f=t?a:b;f.src=d[0];f.alt=d[1];b.style.opacity=t?0:1;t=!t;l.textContent=d[2];l.href=d[3]};n.src=d[0]},3000)})()</script>`;
function serviceBand(cards) {
  const D = cards.filter((c) => SERVICE_BAND[c.name] && photoUrl(SERVICE_BAND[c.name][0])).map((c) => [photoUrl(SERVICE_BAND[c.name][0]), SERVICE_BAND[c.name][1], c.name, c.href]);
  if (!D.length) return '';
  const f = D[0];
  return `<section class="svb" data-s="${esc(JSON.stringify(D))}"><div class="svt"><h2>Services</h2><p class="svn"><a href="${f[3]}">${esc(f[2])}</a></p><input class="hp" type="checkbox" aria-label="Pause photo changes"></div><div class="svp"><img src="${f[0]}" alt="${esc(f[1])}" loading="lazy" decoding="async"><img alt="" decoding="async"></div></section>${BAND_JS}`;
}
// Four things to know, each linking to the post or page it comes from. Wording agreed with the owner.
const FACTS = [
  ['Since most high-end professional wireless uplights will last as long as 8 hours, wireless lighting has become standard for weddings.', '/post/here-are-things-you-need-to-know-about-wedding-lighting'],
  ['Warm, dim light relaxes a room and gets people talking. Shift to deeper color once the music starts and the same room feels like a party.', '/post/complete-guide-to-wedding-lighting-cost'],
  ['Key light puts the focus where you want it, like a pin spot on the cake. Fill light softens everything around it so the room glows. You want both.', '/pin-spots', 'Pin Spots'],
  ['Renting decor for a simple venue usually costs less than booking one that’s already decorated.', '/post/using-decor-rentals-for-weddings'],
];
async function facts() {
  const entries = await allEntries();
  const items = FACTS.map(([text, href, label], n) => {
    const e = entries.get(href);
    return `<li><b>${n + 1}</b><p>${esc(text)}</p><a href="${href}">${esc(label || e?.data.h1[0] || '')}</a></li>`;
  }).join('');
  return `<section class="fx"><h2>What do I need to know about event lighting?</h2><ol>${items}</ol></section>`;
}
async function services(entry, trail, h) {
  const bl = blocks(entry.body);
  const lede = bl.find((b) => b[0] === 'p')?.[1];
  const cards = serviceCards(bl);
  const list = cards.map((c) => `<li><a class="ico" href="${c.img[3] || c.href}">${pic(c.img[1], { alt: '', sizes: '8rem' })}</a><h2>${inline(c.name)}</h2><p>${inline(c.text)}</p><a class="lnk" href="${c.href}">${esc(c.label)}</a></li>`).join('');
  return { html: `${pageHead(h.text, trail, { lede, tag: h.tag })}<ul class="svcs">${list}</ul>${await facts()}${serviceBand(cards)}`, closing: false };
}

// ---- catalog home
// Share of crew hours by job. Placeholder figures until the owner supplies real ones.
const TIME = [['Uplighting', 'li', 14], ['Bistro Lights', 'li', 12], ['Drape Canopy', 'dr', 9], ['Chandeliers & Pendants', 'li', 8], ['Drape Backdrop', 'dr', 7], ['Video Wall', 'av', 6], ['Pin Spotting', 'li', 5], ['Line Array', 'av', 5], ['Hanging Florals & Vines', 'de', 4], ['Drape Wall', 'dr', 4], ['Gobos', 'li', 3], ['LED Dance Floor', 'de', 3], ['Ground PA', 'av', 3], ['Staging & Risers', 'av', 2.5], ['Projectors', 'av', 2], ['Table & Floor Lamps', 'li', 2], ['Greenery & Garland', 'de', 2], ['Drape Arches', 'dr', 1.5], ['Microphones & Wireless', 'av', 1.5], ['Atmospherics & FX', 'li', 1.5], ['Silk Trees & Topiary', 'de', 1], ['Projection Screens', 'av', 1], ['TVs & Monitors', 'av', 0.8], ['DJ Equipment', 'av', 0.7], ['Dance Floor', 'de', 0.5]];
// Figures from the owner, 22 November 2026.
const TIME_STATS = [['360,000', 'feet of string lights run'], ['5,432', 'uplights placed'], ['1,643', 'chandeliers flown'], ['1,453', 'events set up by our staff'], ['603,998', 'square feet of drapes hung']];
export function timeChart({ heading = 'What we spend our time doing', stats = true } = {}) {
  const max = Math.max(...TIME.map((x) => x[2]));
  const row = ([n, c, v]) => `<li class="${c}" title="${esc(n)}: ${v}%"><span class="tn">${esc(n)}</span><span class="tb"><i style="width:${(v / max * 100).toFixed(1)}%"></i></span><span class="tv">${v}%</span></li>`;
  const panels = [['li', 'Lights'], ['dr', 'Drapes'], ['av', 'AV'], ['de', 'Decor']].map(([c, name]) => {
    const rows = TIME.filter((x) => x[1] === c);
    const total = Math.round(rows.reduce((a, x) => a + x[2], 0) * 10) / 10;
    return `<section class="${c}"><h3><i></i>${name}<b>${total}%</b></h3><ol class="tmc1">${rows.map(row).join('')}</ol></section>`;
  }).join('');
  const st = stats ? `<ul class="tms">${TIME_STATS.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('')}</ul>` : '';
  return `<section class="tm tq tq2"><h2>${esc(heading)}</h2>${st}<div class="tq-pan">${panels}</div></section>`;
}
// Discipline of each of the eight newest products, in page order.
const NEWEST = ['de', 'li', 'li', 'li', 'de', 'de', 'de', 'li'];
async function catalog(entry, trail, h) {
  const entries = await allEntries();
  const bl = blocks(entry.body);
  const lede = bl.find((b) => b[0] === 'p')?.[1];
  const cards = bl.filter((b) => b[0] === 'link').map(([, label, href]) => {
    const e = entries.get(href);
    const id = e && cardPhoto(e);
    return `<li><a href="${href}">${id ? pic(id, { alt: '', sizes: '(min-width: 62rem) 24rem, 50vw' }) : '<span class="noimg"></span>'}<span class="cn">${esc(label)}</span></a></li>`;
  }).join('');
  // Cut-out product photos live in public/img/newest, named after the photo ID.
  const newest = bl.filter((b) => b[0] === 'img').slice(0, 8).map((b, n) => `<span class="d-${NEWEST[n]}"><img src="/img/newest/${stem(b[1])}.webp" alt="${esc(b[2].startsWith('for a picture') ? '' : cleanAlt(b[2]))}" loading="lazy" decoding="async"></span>`).join('');
  const html = `${pageHead(h.text, trail, { lede, tag: h.tag })}<ul class="cats">${cards}</ul><section class="rel nw2"><h2>Newest Products</h2><div class="nwg">${newest}</div></section>${cta()}${timeChart()}`;
  return { html, bodyClass: 'cx cx4 cxw', closing: false };
}

// ---- reviews
function reviews(entry, trail, h) {
  const bl = blocks(entry.body);
  let o = '';
  for (let i = 0; i + 2 < bl.length; i++) {
    if (bl[i][0] === 'img' && bl[i + 1][0] === 'h' && bl[i + 2][0] === 'p') {
      const name = esc(bl[i + 1][2]).replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" rel="noopener">$1</a>');
      o += `<li>${pic(bl[i][1], { alt: bl[i][2], sizes: '(min-width: 62rem) 20rem, 100vw' })}<blockquote><p>${inline(bl[i + 2][1])}</p></blockquote><p class="who">${STARS}${name}</p></li>`;
      i += 2;
    }
  }
  return { html: `${pageHead(h.text, trail, { tag: h.tag, extra: `<p class="rating">${STARS}Based on 87+ Reviews on Google</p>` })}<ul class="revs">${o}</ul>` };
}

// ---- service page: photo band, optional fact tiles, the copy as large panels with a photo each
// A photograph we hold files for. Drawn icons (PNG, SVG) and photos missing from the manifest are left out.
const isPhoto = (b) => b[0] === 'img' && !/\.(png|svg|gif)$/i.test(b[1]) && Boolean(photos[b[1]]);
const splitFirst = (x) => { const a = x.split(/(?<=[.!?])\s+/); return [a[0], a.slice(1).join(' ')]; };
async function service(entry, trail, h) {
  const entries = await allEntries();
  const d = entry.data;
  const bl = blocks(entry.body).filter((b) => !(b[0] === 'h' && b[1] === 1));
  const imgs = bl.filter(isPhoto);
  const paras = bl.filter((b) => b[0] === 'p');
  if (!paras.length) return null;
  // The first sentence is the lede; the rest of that paragraph opens the copy.
  const [lede, restOfFirst] = splitFirst(paras[0][1]);
  // Photo band: six photos spread through the set. The others go beside the panels.
  const pickFilm = imgs.length >= 10 ? [1, 5, 9, 0, 2, 7] : [0, 1, 2, 3, 4, 5];
  const film = pickFilm.map((k) => imgs[k]).filter(Boolean);
  let side = imgs.filter((x) => !film.includes(x));
  if (imgs.length >= 11) side = [imgs[10], ...side.filter((x) => x !== imgs[10])];
  // Panels: a heading starts one; a paragraph without a heading becomes one, titled by its first sentence.
  const panels = [];
  let moreHeading = '';
  let open = null;
  const links = [];
  for (const b of bl) {
    if (b[0] === 'img' || b[0] === 'raw') continue;
    if (b[0] === 'link') { links.push(b); continue; }
    if (b[0] === 'h') {
      if (/^MORE\b/i.test(b[2])) { moreHeading = b[2]; open = null; continue; }
      open = { title: b[2], body: [] };
      panels.push(open);
      continue;
    }
    if (b[0] === 'p') {
      const text = b === paras[0] ? restOfFirst : b[1];
      if (!text) continue;
      if (open) { open.body.push(['p', text]); continue; }
      const [t, r] = splitFirst(text);
      panels.push({ title: t, body: r ? [['p', r]] : [] });
      continue;
    }
    if (open) open.body.push(b); else if (panels.length) panels[panels.length - 1].body.push(b); else panels.push({ title: '', body: [b] });
  }
  const fig = (x) => `<figure class="fig"><span class="bq-im">${pic(x[1], { alt: '', sizes: '(min-width: 62rem) 34rem, 100vw' })}</span>${cleanAlt(x[2]) ? `<figcaption>${esc(cleanAlt(x[2]))}</figcaption>` : ''}</figure>`;
  const chapters = panels.map((p, k) => {
    const photo = side[k];
    const body = `<div class="prose post bp">${p.title ? `<h3>${inline(p.title)}</h3>` : ''}${prose(p.body)}</div>`;
    return photo
      ? `<section class="bq-ch has"><div class="bq-in">${body}<div class="bq-ph">${fig(photo)}</div></div></section>`
      : `<section class="bq-ch"><div class="bq-in">${body}</div></section>`;
  }).join('');
  const filmHtml = film.length >= 3 ? `<div class="ab-film sv-film">${film.map((x, k) => pic(x[1], { alt: x[2], sizes: '(min-width: 62rem) 20vw, 50vw', eager: k === 0 })).join('')}</div>` : '';
  const tiles = d.facts?.length ? `<ol class="sv-tiles">${d.facts.map((x, k) => `<li><b>${k + 1}</b><p>${esc(x)}</p></li>`).join('')}</ol>` : '';
  const btns = `<div class="actions sv-act"><a class="btn solid" href="/get-a-quote">Get A Quote</a>${links.map((x) => `<a class="btn" href="${x[2]}">${esc(x[1])}</a>`).join('')}</div>`;
  const related = (d.related || []).map((p) => entries.get(p)).filter(Boolean);
  const rel = related.length ? `<section class="rel">${moreHeading ? `<h2>${inline(moreHeading)}</h2>` : ''}<ul class="posts">${related.map(postCard).join('')}</ul></section>` : '';
  const html = `${pageHead(h.text, trail, { lede, tag: h.tag })}${filmHtml}${tiles}<div class="bq-chs">${chapters}</div>${btns}${rel}`;
  return { html, bodyClass: 'sv sv9 sv11 bpp bq bq8', closing: false };
}
const SERVICE_PATHS = new Set(site.nav.find((n) => n.label === 'Services').children.map((c) => c.href));

// ---- about
// Swaps the photo every three seconds. Stops for reduced motion or when paused.
const SLIDES_JS = `<script>(()=>{if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;const s=document.querySelector('.ab-wf'),D=JSON.parse(s.dataset.s),[a,b]=s.querySelectorAll('img'),p=s.querySelector('.hp');let i=0,t=0;setInterval(()=>{if(p.checked)return;const d=D[i=(i+1)%D.length],n=new Image;n.onload=()=>{const f=t?a:b;f.src=d;b.style.opacity=t?0:1;t=!t};n.src=d},3000)})()</script>`;
function about(entry, trail, h) {
  const bl = blocks(entry.body);
  const h2 = bl.find((b) => b[0] === 'h' && b[1] === 2)?.[2] || '';
  const story = bl.filter((b) => b[0] === 'p' && b[1].length >= 160).map((b) => inline(b[1]));
  // Short facts: a heading followed by a one-line answer.
  const facts = {};
  for (let i = 0; i + 1 < bl.length; i++) {
    if (bl[i][0] === 'h' && bl[i][1] === 1 && bl[i][2] !== 'About' && bl[i + 1][0] === 'p' && bl[i + 1][1].length < 160) facts[bl[i][2]] = bl[i + 1][1].replace('$1200', '$1500');
  }
  const imgs = bl.filter((b) => b[0] === 'img').map((b) => b[1]);
  const num = (v) => { const [a, ...b] = String(v || '').split(' '); return `<b>${esc(a)}</b><span>${esc(b.join(' '))}</span>`; };
  // Two more figures from the owner, 22 November 2026.
  const extra = [['events', '1,453', 'events set up by our staff'], ['string lights', '360,000', 'feet of string lights run']];
  const stats = `<dl class="ab-stats ab-stats5">${['experience', 'team', 'price'].filter((k) => facts[k]).map((k) => `<div><dt>${k}</dt><dd>${num(facts[k])}</dd></div>`).join('')}${extra.map(([k, a, b]) => `<div><dt>${k}</dt><dd><b>${a}</b><span>${b}</span></dd></div>`).join('')}</dl>`;
  // Five words, longest first. "thoughtful" stands in for "helpful" and "inspired" was added, both at the owner's request.
  const vibe = String(facts.vibe || '').split(',').map((x) => x.trim()).concat('inspired');
  const order = ['professional', 'helpful', 'organized', 'friendly', 'inspired'].filter((w) => vibe.includes(w));
  const words = `<ul class="ab-words">${order.map((w) => `<li class="w${vibe.indexOf(w) + 1}">${w === 'helpful' ? 'thoughtful' : esc(w)}</li>`).join('')}</ul>`;
  const slides = [0, 1, 3, 4].map((k) => photoUrl(imgs[k])).filter(Boolean);
  const head = pageHead(h.text, trail, { tag: h.tag, cls: 'ab-ph', extra: '<p class="ab-tag">We like lights. Like, a lot.</p>' });
  const top = `<section class="ab-wd"><div class="ab-wd1">${words}<figure class="ab-wf" data-s="${esc(JSON.stringify(slides))}"><img src="${slides[0] || ''}" alt="" decoding="async"><img alt="" decoding="async"><input class="hp" type="checkbox" aria-label="Pause photo changes"></figure></div></section>`;
  const film = `<div class="ab-film">${imgs.slice(0, 10).map((id) => pic(id, { alt: '', sizes: '(min-width: 62rem) 20vw, 50vw' })).join('')}</div>`;
  const mark = `<div class="ab-tm"><img class="ab-tml" src="/img/wordmark.webp" alt="Wedding Lighting Co" width="356" height="360" loading="lazy"><div class="ab-tmm"><img src="/img/beautifuler.webp" alt="BEAUTIFULer" width="1400" height="339" loading="lazy"><p>A Translucent Design Company</p></div></div>`;
  // "Read more" opens the full story. The owner is writing it; until then the control is left out.
  const lead = `<div class="ab-w ab-lead">${h2 ? `<h2>${inline(h2)}</h2>` : ''}${story.slice(0, 2).map((x) => `<p>${x}</p>`).join('')}${mark}</div>`;
  const lists = `<dl class="ab-lists">${['services', 'events', 'cities', 'rentals'].filter((k) => facts[k]).map((k) => `<div><dt>${k}</dt><dd>${esc(facts[k])}</dd></div>`).join('')}</dl>`;
  const html = `${head}${top}${film}<section class="ab-band ab-band2">${stats}</section>${lead}${timeChart({ heading: 'This is what we do.', stats: false })}${lists}${friends("Now it's your turn")}${SLIDES_JS}`;
  return { html, bodyClass: 'ab ab9', closing: false };
}

// ---- chandeliers & pendants catalog: slideshow header, style row, copy, the sorted catalog with a style filter
const CH = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'content/chandeliers.json'), 'utf8'));
const STYLE_SLUG = { Crystal: 'crystal', Modern: 'modern', 'Farmhouse & Iron': 'farmhouse', 'Rattan & Wicker': 'rattan', Linen: 'linen' };
// Hand-drawn glyph for each style, on a 24 unit box.
const GLYPH = {
  crystal: '<path d="M12 2.2v3.1M5.2 9.6c1.9-3.2 4.3-4.4 6.9-4.3 2.7.1 4.9 1.5 6.6 4.5"/><path d="M5.3 9.7c-.9 1.6-1.2 2.9-.1 3.9 1 .8 1.6-.9.1-3.9zM12 9.9c-1.1 2.1-1.5 3.9-.1 5.2 1.5 1.1 2-1.6.1-5.2zM18.7 9.8c-.9 1.7-1.1 3-.1 3.9 1.1.8 1.6-1 .1-3.9z"/><path d="M8.6 16.3c-.5 1-.6 1.8 0 2.4.7.4.8-.8 0-2.4zM15.5 16.2c-.5 1.1-.5 1.9.1 2.4.6.4.8-.9-.1-2.4zM12 18.6c-.6 1.2-.7 2.2.1 2.9.8.5.9-1.1-.1-2.9z"/>',
  modern: '<path d="M12 2.1v2.6"/><path d="M12.1 4.8 5 11.9l7 7.3 7.1-7.2z"/><path d="M12 8.3l-3.6 3.6 3.7 3.7 3.5-3.6z"/><path d="M12 19.3v2.4"/>',
  farmhouse: '<path d="M12 2.2v4.2M6.3 3.4 12 6.5l5.8-3"/><path d="M3 13.6c.4-2.3 4.1-3.9 9-3.9s8.7 1.5 9 3.8c.2 2.2-3.9 4-9 4-5 .1-9.3-1.7-9-3.9z"/><path d="M12 9.8v7.6M3.4 13l17.3 1.2M6 10.9l12 5.4M17.9 10.8 6.1 16.4"/>',
  rattan: '<path d="M12 2.2v2.9"/><path d="M4 16.9C4.2 9.8 7.5 5.2 12 5.1c4.6.1 7.7 4.6 8 11.7z"/><path d="M4.1 16.9c2.5 1 13.4 1 15.9-.1"/><path d="M8.1 6.9c-.6 3.4-.8 6.9-.4 10.6M12 5.2v12.5M15.8 6.8c.7 3.5.9 7 .5 10.7M5.4 10.3c4.3.9 8.8.9 13.1-.1M4.4 13.6c5 .9 10.2.9 15.2 0"/>',
  linen: '<path d="M12 2.2v4"/><path d="M7.6 6.3h8.9l3.1 11.2c-4.9 1.2-10.3 1.2-15.2.1z"/><path d="M9.3 6.5 7.8 18M12 6.4v11.9M14.7 6.5 16.3 18"/><path d="M10.6 20.8c.9.5 1.9.5 2.8 0"/>',
};
const glyph = (slug) => (GLYPH[slug] ? `<svg class="gl" aria-hidden="true" viewBox="0 0 24 24"><use href="#g-${slug}"/></svg>` : '');
// Clicking a style tile ticks the matching filter. The slideshow stops for reduced motion or when paused.
const CHAND_JS = `<script>(()=>{document.querySelectorAll('.chs a').forEach(a=>a.addEventListener('click',()=>{const r=document.getElementById('st-'+a.dataset.s);if(r)r.checked=true}));if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;const s=document.querySelector('.svb'),D=JSON.parse(s.dataset.s),[a,b]=s.querySelectorAll('img'),l=s.querySelector('.kcat-cap'),p=s.querySelector('.hp');let i=0,t=0;setInterval(()=>{if(p.checked)return;const d=D[i=(i+1)%D.length],n=new Image;n.onload=()=>{const f=t?a:b;f.src=d[0];f.alt=d[1];b.style.opacity=t?0:1;t=!t;l.textContent=d[2]};n.src=d[0]},3000)})()</script>`;
async function chandeliers(entry, trail, h) {
  const entries = await allEntries();
  const sb = blocks(entries.get('/chandeliers-pendants').body);
  const P = sb.filter((b) => b[0] === 'p').map((b) => b[1]);
  const SN = P.map(sentences);
  const T = (a, b) => inline(SN[a]?.[b] || '');
  const ph = sb.filter((b) => isPhoto(b) && !b[2].includes('icon'));
  const slug = (s) => STYLE_SLUG[s] || s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  const all = CH.tiers.flatMap((t, ti) => t.map((x) => ({ ...x, tier: ti, entry: entries.get(x.path) }))).filter((x) => x.entry);
  const count = Object.fromEntries(CH.styles.map((s) => [s, all.filter((x) => x.style === s).length]));
  const styles = CH.styles.filter((s) => count[s]);
  // 1 slideshow header
  const show = [0, 1, 6, 9].map((k) => ph[k]).filter(Boolean);
  const D = show.map((x) => [photoUrl(x[1]), cleanAlt(x[2]), cleanAlt(x[2])]);
  const head = `<${h.tag}${h.tag === 'h1' ? '' : ' class="h1"'}>${inline(h.text)}</${h.tag}>`;
  const sl = D.length ? `<section class="svb kcat-sl" data-s="${esc(JSON.stringify(D))}"><div class="svt">${crumbs(trail)}${head}<p class="kcat-cap">${esc(D[0][2])}</p><input class="hp" type="checkbox" aria-label="Pause photo changes"></div><div class="svp"><img src="${D[0][0]}" alt="${esc(D[0][1])}" decoding="async"><img alt="" decoding="async"></div></section>` : pageHead(h.text, trail, { tag: h.tag });
  // 2 style row
  const row = styles.map((s) => `<li><a href="#items" data-s="${slug(s)}"><span class="chs-i"><img src="/img/styles/${slug(s)}.jpg" alt="" loading="lazy" decoding="async"></span><span class="chs-n">${glyph(slug(s))}${esc(s)}</span><span class="chs-c">${count[s]}</span></a></li>`).join('');
  const srow = `<section class="chs" aria-label="Chandelier styles"><ul>${row}</ul></section>`;
  // 3 copy
  const more = `<details class="kc-more"><summary>I want to learn more about Chandeliers &amp; pendants.</summary><p class="chm-hi">Enough to read a whole blurb about it? Fantastic!</p>${P.map((x) => `<p>${inline(x)}</p>`).join('')}</details>`;
  const copy = `<div class="chw kc4"><div class="kc-quote"><figure>${ph[5] ? pic(ph[5][1], { alt: ph[5][2] }) : ''}</figure><div><p class="kc-hook">${T(0, 1)}</p><p>${T(2, 1)}</p><a class="btn solid" href="/get-a-quote">Get A Quote</a></div></div><div class="kc-two"><div><h3>Customization options</h3><ul class="kc-check"><li>Bulb color can be customized throughout the night</li><li>Chain cover color</li><li>Candle color</li><li>Bulbs can be dimmed</li></ul></div><div><p>Chandeliers paired with some of our other services, such as uplighting, silk florals, and drape backdrops and canopy designs, can create amazing looks that will be remembered by all of your guests.</p><p class="chl"><a class="btn" href="/uplighting">Uplighting</a><a class="btn" href="/silk-florals">Silk Florals</a><a class="btn" href="/drape-walls-backdrops-canopies">Drapery Walls, Backdrops &amp; Canopies</a></p></div></div>${more}</div>`;
  // 4 catalog with a style filter (radio buttons and :has, no script needed)
  const chips = `<label><input type="radio" name="st" id="st-all" checked><span>All <b>${all.length}</b></span></label>${styles.map((s) => `<label><input type="radio" name="st" id="st-${slug(s)}"><span>${glyph(slug(s))}${esc(s)} <b>${count[s]}</b></span></label>`).join('')}`;
  const cards = all.map((x) => {
    const id = cardPhoto(x.entry);
    const name = x.entry.data.h1[0] || x.entry.data.title.split(' | ')[0];
    return `<li data-s="${slug(x.style)}"><a href="${x.path}"><span class="st st${x.tier + 1}">${CH.tierNames[x.tier]}</span>${id ? pic(id, { alt: '', sizes: '(min-width: 62rem) 16rem, 50vw' }) : ''}<span class="cn">${esc(name)}</span><span class="tg tg-${slug(x.style)}">${glyph(slug(x.style))}${esc(x.style)}</span></a></li>`;
  }).join('');
  const hide = `${styles.map((s) => `.chc:has(#st-${slug(s)}:checked) .chp li:not([data-s="${slug(s)}"])`).join(',')}{display:none}`;
  const cat = `<section class="chc" id="items"><style>${hide}</style><h2 class="kcat-h">Chandeliers &amp; Pendants Catalog</h2><fieldset class="chf"><legend class="vh">Style</legend>${chips}</fieldset><ul class="chp">${cards}</ul></section>`;
  // 5 four reasons
  const reasons = [['Safely transported', T(0, 3)], ['Affordable and high quality', T(0, 4)], ['Customization options', `${T(1, 0)} ${T(1, 1)}`], ['Professionally installed', T(2, 4)]];
  const why = `<div class="kc-navy chn"><ol>${reasons.map(([a, b], n) => `<li><b>${n + 1}</b><h3>${a}</h3><p>${b}</p></li>`).join('')}</ol></div>`;
  // 6 the rest of the photos
  const rest = ph.filter((x, k) => ![0, 1, 6, 9, 5].includes(k)).slice(0, 6);
  const gal = `<div class="gal kcat-g chg">${rest.map((x) => pic(x[1], { alt: x[2], sizes: '(min-width: 62rem) 33vw, 50vw' })).join('')}</div>`;
  const sym = `<svg class="chsym" aria-hidden="true" width="0" height="0">${Object.entries(GLYPH).map(([k, v]) => `<symbol id="g-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${v}</symbol>`).join('')}</svg>`;
  const html = `${sym}${sl}${srow}${copy}${cat}${why}${gal}<p class="kcat-b"><a class="btn" href="/services">Return to Services Overview</a></p>${friends()}${CHAND_JS}`;
  return { html, bodyClass: 'kcat kcat3 chx', closing: false };
}

// ---- catalog sub-pages: a Markdown list of product links becomes a product grid
async function productList(entry, trail, h) {
  const entries = await allEntries();
  const bl = blocks(entry.body);
  const items = bl.filter((b) => b[0] === 'ul').flatMap((b) => b[1]).map((x) => x.match(/^\[(.+)\]\(([^)]+)\)$/)).filter(Boolean);
  const cards = items.map((m) => entries.get(decodeURI(m[2])) || entries.get(m[2])).filter(Boolean);
  if (cards.length < 3 || cards.length < items.length / 2) return null;
  const lede = bl.find((b) => b[0] === 'p')?.[1];
  return { html: `${pageHead(h.text, trail, { lede, tag: h.tag })}<ul class="prods">${cards.map(productCard).join('')}</ul>` };
}

// ---- get a quote: what to know on the left, the form on the right, then reviews, services, featured and FAQ
// One line from each review on /reviews.
const QUOTE_REVIEWS = [
  ["Elaine Kwak", "Everyone was WOWed by the lights, including us, and let me tell you - if you're on the fence about lighting - it makes SUCH a difference in terms of ambience and in the photos."],
  ["Katie Kitchen", "Dylan and his team did a wonderful job bringing my vision to life. They took a simple, basic building and made it look magical."],
  ["Graham Copeland", "The first time I called to discuss my wedding, Dylan was ready with options for every version of my budget and an answer to every one of my questions."],
  ["Carbone Photo Co LLC", "Their attention to detail is unmatched and the space was completely transformed thanks to them!"],
  ["Karla Crisp", "They are extremely professional, quick to respond, give great ideas and listen to the vision. They excel at bringing that vision to life."],
  ["Casey Watson Armstrong", "The lighting definitely changed the vibe of our event in the best possible way."],
  ["Emma Martinez", "They were very quick and responsive to our emails, and made sure we understood every part of the process."],
  ["Rainey Niklawski", "The string lights were magical, and Dylan and his team were very meticulous in the set-up and take-down."],
  ["Rebecca Arrington", "They were so easy to work with and made our wedding look magical."],
  ["Kristin Booth", "My students wanted the prom to look exactly like the end of the movie Tangled with all of the lanterns above them, and it looked exactly like that."],
  ["Cameron Marshall", "Their team was professional, efficient, and delivered exactly what was promised."],
  ["Alison Singer", "With their lighting, TWLC transformed my venue from an academic atrium to an elegant Fall Ball."],
];
// Photo shown for each service in the quote page slideshow. null alt = use the alt stored with the photo.
const QUOTE_SERVICE_PHOTOS = {
  "Chandeliers": ["a16fb7_f5720f59bdcb45868255dc0cb6facbd1~mv2.jpg", "pendant and rattan chandeliers Linden Row Inn tent"],
  "Decor Lighting": ["a16fb7_d490453d98aa46218131390c7239bf2d~mv2.jpg", "A lamp post illuminates a bar for a wedding in Richmond virginia"],
  "Drapes": ["a16fb7_69cad28947b6435c8d0de5e1fee5fb4c~mv2.jpg", "drape canopy overhead barns at mataponi springs"],
  "Dance Floor Lighting": ["a16fb7_0b76397e4bd640b3a48cfc3b7d77e943~mv2.jpeg", "Disco ball and greenery for wedding"],
  "Gobos": ["a16fb7_9b63d58ea4ee489cb2a599316d347c8a~mv2.jpg", "custom name monogram gobo john marshall ballrooms"],
  "Silk Florals & Trees": ["a16fb7_39f6788216f541f190cc706c4a94b236~mv2.jpg", "Wisteria and Ivy silk florals combined with rattan wicker lighting for a beautiful garden"],
  "Uplighting": ["a16fb7_97fb74ec43184eb4944d3e1fae6e2c70~mv2.jpg", "Cool blue uplighting around the dominion club ballroom"],
  "LED Dance Floor": ["a16fb7_a1ca0c0c7df8454d878f4cbf85c943ea~mv2.jpeg", "LED Dance floor Neon event"],
  "Decor": ["a16fb7_8771320b90fa4c3aad2ae4069d01454b~mv2.jpg", "hanging floral and lighting centerpiece over dance floor"],
  "String Lighting": ["337130_0a2bdcd8f5c54caebe9f2a15d412e86d~mv2.jpg", null],
  "Pin Spots": ["a16fb7_fbc7e4457f0f4e7dafefbeca1436f06f~mv2.jpg", "warm pin spots on tables john marshall balroom"],
  "Special Effects": ["a16fb7_ccfdf0365a6c4c2aa959b6a0045734b1~mv2.jpg", "Epic Bridal photo with cold sparks Maymont Richmond Virginia wedding lighting decor trends"],
  "Video": ["a16fb7_3a492250d9864a5bbe6d6d3e968e092f~mv2.jpg", "video projections for academy awards show"],
};
// "When to book" wording supplied by the owner, 22 November 2026. Third value: bars lit out of six.
const BOOKING = [
  ["12 months or more", "Certain", 6],
  ["9 to 12 months", "Almost certain", 5],
  ["6 to 9 months", "Likely", 4],
  ["3 to 6 months", "No custom order, dates spotty", 3],
  ["2 to 3 months", "Unlikely", 2],
  ["< 1 Month", "Rarely available. Limited Options", 1],
];
// Service slideshow and review rotation. Both stop for reduced motion; reviews stop once the visitor touches them.
const QUOTE_JS = `<script>(()=>{if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;const s=document.querySelector('.svs'),D=JSON.parse(s.dataset.s),[a,b]=s.querySelectorAll('img'),l=s.querySelector('.svn a'),p=s.querySelector('.hp');let i=0,t=0;setInterval(()=>{if(p.checked)return;const d=D[i=(i+1)%D.length],n=new Image;n.onload=()=>{const f=t?a:b;f.src=d[0];f.alt=d[1];b.style.opacity=t?0:1;t=!t;l.textContent=d[2];l.href=d[3]};n.src=d[0]},3000);const v=document.querySelector('.rvs'),r=[...v.querySelectorAll('input')];let on=1;v.onpointerdown=v.onkeydown=()=>on=0;setInterval(()=>{if(on&&!v.matches(':hover,:focus-within'))r[(r.findIndex(x=>x.checked)+1)%r.length].checked=true},6000)})()</script>`;
async function quote(entry, trail, h) {
  const entries = await allEntries();
  const cards = serviceCards(blocks(entries.get('/services').body));
  const info = `<dl class="qif"><div><dt>Order minimum</dt><dd>$1,500</dd></div><div><dt>Locations</dt><dd>${site.areasLine}</dd></div><div><dt>Deposit</dt><dd>Due at signing</dd></div></dl><h2>When to book</h2><p class="qis">Availability, by how long before your event you book</p><ol class="qib">${BOOKING.map(([t, a, n]) => `<li><span class="qt">${esc(t)}</span><span class="qm" aria-hidden="true">${[0, 1, 2, 3, 4, 5].map((k) => `<i${k < n ? ' class="on"' : ''}></i>`).join('')}</span><span class="qa">${esc(a)}</span></li>`).join('')}</ol>`;
  const rate = `<p class="rating">${STARS}Based on 87+ <a href="/reviews">Reviews on Google</a></p>`;
  const cont = `<p class="qc"><a href="tel:${site.phone}">${site.phone}</a><a href="mailto:${site.email}">${site.email}</a></p>`;
  const tiles = cards.map((c) => `<label class="q5t"><input type="checkbox" name="services" value="${esc(c.name)}"><span class="q5b">${pic(c.img[1], { alt: '', sizes: '6rem' })}<span>${inline(c.name)}</span></span></label>`).join('');
  const F = [
    ['q-name', 'Full Name', '<input name="name" autocomplete="name" required>', true],
    ['q-email', 'Email', '<input name="email" type="email" autocomplete="email" required>', true],
    ['q-date', 'Event Date', '<input name="eventDate" type="date">', false],
    ['q-venue', 'What is your venue?', '<input name="venue">', false],
    ['q-vision', 'Tell us about yourself, your vision, and where you are in your event planning process.', '<textarea name="details" rows="5"></textarea>', false, 'w'],
    ['q-ref', 'How did you find us?', '<input name="howDidYouFindUs">', false],
    ['q-files', 'Photos or inspiration (optional)', '<input name="files" type="file" multiple accept="image/*,application/pdf">', false, 'w'],
  ];
  const fields = F.map(([id, label, input, req, cls = '']) => `<p class="${cls}"><label for="${id}">${label}${req ? ' <span aria-hidden="true">*</span>' : ''}</label>${input.replace(/^<(input|textarea)/, `<$1 id="${id}"`)}</p>`).join('');
  // Hidden from people; a filled value marks the submission as spam.
  const trap = '<p class="trap" aria-hidden="true"><label for="q-company">Company</label><input id="q-company" name="company" tabindex="-1" autocomplete="off"></p>';
  const form = `<form class="quote" action="/api/quote" method="post" enctype="multipart/form-data"><div class="q3h"><img src="/img/badge.webp" alt="" width="480" height="480"><span>RICHMOND | CHARLOTTESVILLE | DC | BOSTON</span></div><fieldset class="q6s"><legend>Services <span>Select all that apply</span></legend><div class="q5g">${tiles}</div></fieldset><div class="q3g">${fields}${trap}</div><div class="q3f"><p><button class="btn solid" type="submit">Submit</button></p></div></form>`;
  const rvs = `<section class="rvs"><h2>GLOWING REVIEWS</h2><div class="rsl">${QUOTE_REVIEWS.map(([n, q], i) => `<figure class="rs rs${i + 1}"><blockquote><p>${esc(q)}</p></blockquote><figcaption>${STARS}<span>${esc(n)}</span></figcaption></figure>`).join('')}</div><div class="rvd">${QUOTE_REVIEWS.map((_, i) => `<input type="radio" name="rvs" id="rv${i + 1}" aria-label="Review ${i + 1} of ${QUOTE_REVIEWS.length}"${i === 0 ? ' checked' : ''}>`).join('')}<a href="/reviews">Reviews on Google</a></div></section>`;
  const D = cards.filter((c) => QUOTE_SERVICE_PHOTOS[c.name] && photoUrl(QUOTE_SERVICE_PHOTOS[c.name][0])).map((c) => { const [id, alt] = QUOTE_SERVICE_PHOTOS[c.name]; return [photoUrl(id), alt ?? photos[id].alt ?? '', c.name, c.href]; });
  const svs = D.length ? `<section class="svs" data-s="${esc(JSON.stringify(D))}"><h2>Services</h2><div class="svw"><div class="svp"><img src="${D[0][0]}" alt="${esc(D[0][1])}" loading="lazy" decoding="async"><img alt="" decoding="async"><input class="hp" type="checkbox" aria-label="Pause photo changes"></div><p class="svn"><a href="${D[0][3]}">${esc(D[0][2])}</a></p></div></section>` : '';
  // First eight questions from /faq, in two columns.
  const fe = entries.get('/faq');
  const fb = blocks(fe.body);
  const hs = fb.map((b, i) => (b[0] === 'h' ? i : -1)).filter((i) => i >= 0);
  const fq = hs.slice(1, 9).map((n, a) => `<details><summary><h3>${inline(fb[n][2])}</h3></summary>${prose(fb.slice(n + 1, hs[a + 2] ?? fb.length - 1))}</details>`);
  const half = Math.ceil(fq.length / 2);
  const faqBand = `<div class="faq bfq"><h2>FAQ</h2><div class="fqc"><div>${fq.slice(0, half).join('')}</div><div>${fq.slice(half).join('')}</div></div><p><a class="btn" href="/faq">FAQ</a></p></div>`;
  const head = `<${h.tag}${h.tag === 'h1' ? '' : ' class="h1"'}>${inline(h.text)}</${h.tag}>`;
  const html = `<div class="q1 q6"><div class="q1a">${crumbs(trail)}${head}<div class="q1d qi">${info}</div>${rate}${cont}</div><div class="q6f">${form}${rvs}<div class="q6d qi">${info}</div></div>${svs}<i class="svcut" aria-hidden="true"></i></div><div class="qbands"><div class="fband">${featured()}</div>${faqBand}</div>${D.length ? QUOTE_JS : ''}`;
  return { html, bodyClass: 'qf qf6', closing: false, quoteBar: false };
}

// ---- pictures by venue: every venue by area on the left, a wall of the venues we have photos of
const VENUES = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'content/venues.json'), 'utf8'));
const venuePhotos = (v) => v.photos.filter((x) => photos[x.id]);
/** Venues that have at least one photo we hold, most photos first. Each gets its own page at /venue/<slug>. */
export const venuesWithPhotos = () => VENUES.venues.filter((v) => venuePhotos(v).length).sort((a, b) => venuePhotos(b).length - venuePhotos(a).length);
const byName = (a, b) => a.name.toLowerCase().replace('the ', '').localeCompare(b.name.toLowerCase().replace('the ', ''));
function venues(entry, trail, h) {
  let side = '';
  let label = null;
  for (const { region, district } of VENUES.order) {
    const vs = VENUES.venues.filter((v) => v.region === region && v.district === district).sort(byName);
    if (!vs.length) continue;
    const group = district ? region : 'Further afield';
    if (group !== label) { side += `<p class="vg-lab">${esc(group)}</p>`; label = group; }
    const items = vs.map((v) => {
      const n = venuePhotos(v).length;
      return n ? `<li><a href="/venue/${v.slug}">${esc(v.name)}<span>${n}</span></a></li>` : `<li class="np">${esc(v.name)}</li>`;
    }).join('');
    side += `<details><summary><h2>${esc(district || region)}</h2><span>${vs.length}</span></summary><ul>${items}</ul></details>`;
  }
  const wall = venuesWithPhotos().map((v, k) => {
    const ph = venuePhotos(v);
    return `<li class="vg-t"><a href="/venue/${v.slug}">${pic(ph[0].id, { alt: ph[0].alt, sizes: '(min-width: 62rem) 24rem, 50vw', eager: k < 2 })}<span class="vg-n">${esc(v.name)}</span><span class="vg-c">${ph.length}</span></a></li>`;
  }).join('');
  const html = `${pageHead(h.text, trail, { tag: h.tag })}<div class="vg-split"><nav class="vg-side" aria-label="Venues by area">${side}</nav><ul class="vg-grid vg-big">${wall}</ul></div>`;
  return { html, bodyClass: 'vgp vg9' };
}
/** Markup for one venue's page. */
export function venuePage(v) {
  const trail = [{ name: 'Home', path: '/' }, { name: 'Pictures', path: '/venue' }, { name: v.name, path: `/venue/${v.slug}` }];
  const figs = venuePhotos(v).map((x, k) => `<figure>${pic(x.id, { alt: x.alt, sizes: '(min-width: 62rem) 28rem, 100vw', eager: k === 0 })}${x.alt ? `<figcaption>${esc(x.alt)}</figcaption>` : ''}</figure>`).join('');
  return `${pageHead(v.name, trail)}<div class="vg-ven">${figs}</div><p class="kcat-b"><a class="btn" href="/venue">Pictures by Venue</a></p>`;
}

const BY_PATH = {
  '/': home,
  '/services': services,
  '/reviews': reviews,
  '/venue': venues,
  '/get-a-quote': quote,
  '/catalog': catalog,
  '/chandelier-pendant-catalog': chandeliers,
  '/about-wedding-lighting-co': about,
  '/faq': faq,
  '/wedding-decor-package-cost': packages,
  '/contact-us': contact,
};
const BY_TEMPLATE = {
  product,
  post,
  'blog-index': postListing,
  'blog-category': postListing,
  'blog-tag': postListing,
  'store-category': storeCategory,
};

export async function renderEntry(entry) {
  const entries = await allEntries();
  const trail = trailFor(entry, entries, site.nav);
  // One H1 per page: the first one the previous site had. A page that had none keeps
  // its heading as an H2 (styled the same) until the launch freeze on H1 text is lifted.
  const first = (entry.data.h1[0] || '').replace(/\u200b/g, '').trim();
  const h = first ? { text: first, tag: 'h1' } : { text: trail[trail.length - 1]?.name || entry.data.title.split(' | ')[0], tag: 'h2' };
  // Service pages: the ones in the Services menu plus every page a card on /services links to.
  const servicePaths = new Set([...SERVICE_PATHS, ...serviceCards(blocks(entries.get('/services')?.body)).map((c) => c.href)]);
  const fn = BY_PATH[entry.data.path] || (servicePaths.has(entry.data.path) && entry.data.template === 'page' ? service : BY_TEMPLATE[entry.data.template]);
  let out = fn ? await fn(entry, trail, h) : null;
  if (!out && ['page', 'catalog'].includes(entry.data.template)) out = await productList(entry, trail, h);
  return { trail, h, ...(out || {}), bespoke: Boolean(out) };
}
