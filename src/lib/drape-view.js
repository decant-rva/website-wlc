// The drape swatchbook's markup. Pure string builders with no imports: the page template
// calls them for the first render, and the page script (which inlines this file with its
// `export` keywords removed) calls them again after each tap. M is src/lib/drape-model.js.
//
// st = { fab: 'all' | fabric id, fam: family index, sel: pair key | null, mix: [pair keys], light: index }

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const LIGHTS = [
  ['Off', 'transparent', '#4A5578'],
  ['Amber', 'rgba(255,182,39,0.5)', '#FFB627'],
  ['Blue', 'rgba(94,147,251,0.5)', '#5E93FB'],
  ['Magenta', 'rgba(214,36,159,0.5)', '#D6249F'],
];
const TILTS = [-3, 2, -1.5, 3, -2, 1, -3, 2.5, -1, 2];
const SWAGS = [[-6, 80, 2], [30, 82, 10], [-10, 120, 8]];
const pressed = (on) => ` aria-pressed="${on ? 'true' : 'false'}"`;
// A textured swatch: the fabric's weave comes from its class; sheers sit over a striped backing.
const tx = (fabric, hex, sheer, extra = '') => `class="dsw-tx dsw-t-${esc(fabric)}${sheer ? ' dsw-see' : ''}${extra}" style="--c:${esc(hex)}"`;

function line(M, data, st) {
  const items = [{ id: 'all', name: 'All fabrics', feel: 'a bit of everything' }, ...data.fabrics];
  const dy = M.sag(items.length);
  const stripes = `linear-gradient(90deg,${data.fabrics.map((f, k) => `${data.colors[f.sample]} ${(k * 100 / data.fabrics.length).toFixed(1)}% ${((k + 1) * 100 / data.fabrics.length).toFixed(1)}%`).join(',')})`;
  const lis = items.map((f, i) => {
    const on = f.id === st.fab;
    const n = f.id === 'all' ? '' : ` · ${f.colors.length}`;
    const cloth = f.id === 'all' ? `class="dsw-tx dsw-t-all" style="--c:${stripes}"` : tx(f.id, data.colors[f.sample], f.sheer);
    return `<li style="--dy:${dy[i]}px;--r:${on ? 0 : TILTS[i % TILTS.length]}deg"><button type="button" class="dsw-s${on ? ' dsw-on' : ''}" data-act="fab" data-v="${esc(f.id)}"${pressed(on)}><span class="dsw-hang"><span class="dsw-pin"></span><span ${cloth.replace('class="', 'class="dsw-cl ')}><span class="dsw-fold"></span><span class="dsw-tag">${esc(f.name)}${n}</span></span></span><span class="dsw-feel">${esc(f.feel)}</span></button></li>`;
  }).join('');
  const f = data.fabrics.find((x) => x.id === st.fab);
  const note = f
    ? `<strong>${esc(f.name)}</strong> <span class="dsw-k">${esc(f.feel)}</span> · ${esc(f.blurb)} ${f.sheer ? 'Lets light through.' : 'Opaque.'}`
    : `<strong>All fabrics</strong> <span class="dsw-k">${data.fabrics.length} textures</span> · Every drape we stock, from airy sheer to heavy velour. Pull one off the line to narrow the fan.`;
  return `<div class="dsw-line"><div class="dsw-hd"><h2 class="dsw-k">feel the fabric</h2><p>Tap a sample to pull it off the line</p></div><div class="dsw-scroll"><div class="dsw-rope"><svg viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 14 Q500 62 1000 14"/></svg><ul class="dsw-ss">${lis}</ul></div></div><p class="dsw-fn">${note}</p></div>`;
}

function families(M, data, st) {
  const lis = data.families.map((g, i) => {
    const on = i === st.fam;
    const all = M.fan(data, i);
    const grad = `linear-gradient(90deg,${all.map((p) => p.hex).join(',')})`;
    return `<li><button type="button" class="dsw-fam${on ? ' dsw-on' : ''}" data-act="fam" data-v="${i}"${pressed(on)}><span class="dsw-gr" style="--g:${grad}"></span><span class="dsw-fl">${esc(g.name)} <b>${M.fabricCount(data, i, st.fab)}</b></span></button></li>`;
  }).join('');
  return `<div class="dsw-fams"><h2 class="dsw-k">then pick a color family</h2><ul>${lis}</ul></div>`;
}

/** The pair the fan and detail card show: the one picked, if it is in this fan, else the first. */
export function current(M, data, st) {
  const list = M.fan(data, st.fam, st.fab);
  return { list, sel: list.find((p) => p.key === st.sel) || list[0] || null };
}

function stage(M, data, st) {
  const { list, sel } = current(M, data, st);
  const angles = M.fanAngles(list.length);
  const chips = list.map((p, i) => {
    const on = sel && p.key === sel.key;
    const m = st.mix.indexOf(p.key);
    return `<button type="button" class="dsw-c${on ? ' dsw-on' : ''}" style="--a:${angles[i]}deg;--z:${on ? 99 : i}" data-act="sel" data-v="${esc(p.key)}"${pressed(on)} aria-label="${esc(`${p.color}, ${p.fabricName}`)}"><span class="dsw-cn">${esc(p.color)}<small>${esc(p.fabricName)}</small></span><span ${tx(p.fabric, p.hex, p.sheer, ' dsw-cs')}></span>${m >= 0 ? `<span class="dsw-cm">${m + 1}</span>` : ''}<span class="dsw-rv"></span></button>`;
  }).join('');
  const fabName = (data.fabrics.find((f) => f.id === st.fab) || {}).name;
  const fan = list.length ? chips : `<p class="dsw-none">No ${esc(fabName)} in ${esc(data.families[st.fam].name.toLowerCase())}. Try another family, or all fabrics.</p>`;
  let det = '';
  if (sel) {
    const f = data.fabrics.find((x) => x.id === sel.fabric);
    const fam = data.families[M.familyIndexOf(data, sel.color)];
    const inMix = st.mix.includes(sel.key);
    const full = M.mixFull(st.mix);
    const label = inMix ? 'In your mix' : full ? 'Your mix is full' : 'Add to my mix';
    det = `<div class="dsw-det"><span ${tx(sel.fabric, sel.hex, sel.sheer, ' dsw-big')}></span><div class="dsw-di"><p class="dsw-ey">${esc(f.name)} · ${esc(fam ? fam.name : '')}</p><h3>${esc(sel.color)}</h3><p>${esc(f.blurb)} <span class="dsw-sz"><strong>Sizes:</strong> ${esc(f.sizes)}.</span></p></div><div class="dsw-da"><button type="button" class="btn solid" data-act="add" data-v="${esc(sel.key)}"${inMix || full ? ' disabled' : ''}>${label}</button><a class="btn" href="/get-a-quote">Ask for a real swatch</a></div></div>`;
  }
  return `<div class="dsw-stage"><div class="dsw-fan">${fan}</div><div aria-live="polite">${det}</div></div>`;
}

function mixPanel(M, data, st) {
  const all = M.pairs(data);
  const mix = st.mix.map((k) => all.find((p) => p.key === k)).filter(Boolean);
  const [base, ...rest] = mix;
  const swags = rest.map((p, i) => `<span class="dsw-sw dsw-t-${esc(p.fabric)}${p.sheer ? ' dsw-swsee' : ''}" style="--c:${esc(p.hex)};--l:${SWAGS[i][0]}%;--w:${SWAGS[i][1]}%;--t:${SWAGS[i][2]}%"></span>`).reverse().join('');
  const desc = mix.length ? `Rough preview: ${mix.map((p) => `${p.color} ${p.fabricName}`).join(', ')}` : 'Rough preview of a backdrop, empty until you add a color';
  const pv = `<div class="dsw-pv" role="img" aria-label="${esc(desc)}" style="--glow:${LIGHTS[st.light][1]}">${base ? `<span ${tx(base.fabric, base.hex, base.sheer, ' dsw-pb')}></span>` : '<span class="dsw-pb dsw-pe"></span>'}${swags}<span class="dsw-floor"></span><span class="dsw-bar"></span>${mix.length ? '' : '<span class="dsw-pt dsw-k">add a color from the fan to start your mix</span>'}</div>`;
  const lights = LIGHTS.map((l, i) => `<button type="button" class="dsw-lb${i === st.light ? ' dsw-on' : ''}" data-act="light" data-v="${i}"${pressed(i === st.light)}><span style="--d:${l[2]}"></span>${l[0]}</button>`).join('');
  const rows = mix.map((p, i) => `<li><span class="dsw-dot" style="--c:${esc(p.hex)}"></span><span class="dsw-mn"><strong>${esc(p.color)}</strong> · ${esc(p.fabricName)}<small>${i ? `Swag ${i}` : 'Backdrop'}</small></span>${i ? `<button type="button" class="dsw-mb" data-act="lead" data-v="${esc(p.key)}">Make backdrop</button>` : ''}<button type="button" class="dsw-mb dsw-x" data-act="rm" data-v="${esc(p.key)}" aria-label="Remove ${esc(`${p.color} ${p.fabricName}`)}">×</button></li>`).join('');
  return `<section class="dsw-mix" aria-labelledby="dsw-mix-h"><div class="dsw-mh"><h2 id="dsw-mix-h">Your mix</h2><span class="dsw-k">${mix.length} of 4</span></div><div class="dsw-mw"><div class="dsw-ml">${pv}<div class="dsw-lt" role="group" aria-label="Light the preview"><span>Light it:</span>${lights}</div></div><div class="dsw-mr"><ul>${rows}</ul><p class="dsw-fine">The first color is the backdrop and the rest hang as swags. Screen colors are close, not exact, so we'll bring real swatches to your walkthrough.</p><a class="btn solid dsw-send" href="${esc(M.quoteHref(st.mix))}">Send my mix with a quote</a></div></div></section>`;
}

function looks(M, data, st) {
  const hexes = st.mix.map((k) => M.pairs(data).find((p) => p.key === k)).filter(Boolean).map((p) => p.hex);
  const cards = data.looks.map((g, i) => `<li style="--c:${hexes.length ? esc(hexes[i % hexes.length]) : '#D6249F'}"><h3>${esc(g.name)}</h3><ul>${g.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></li>`).join('');
  return `<section class="dsw-looks"><h2>Looks we build from your mix</h2><ul>${cards}</ul></section>`;
}

/** Everything inside the swatchbook's root element; the page script swaps this on each tap. */
export function swatchbookInner(M, data, st) {
  return `${line(M, data, st)}${families(M, data, st)}${stage(M, data, st)}${mixPanel(M, data, st)}${looks(M, data, st)}`;
}

export const START = { fab: 'all', fam: 0, sel: null, mix: [], light: 1 };
