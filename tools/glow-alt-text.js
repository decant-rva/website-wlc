#!/usr/bin/env node
// Alt text for the photos that have none, drafted by Glow and approved by the owner.
//
//   node tools/glow-alt-text.js prepare <work-dir>               find the photos, their page context, and download them
//   node "<local-llm>\describe-photo.js" <work-dir>\photos        Glow's photo lane (muse-glimmer:30b on Beam) describes each one
//   node tools/glow-alt-text.js draft <work-dir> [options]       Glow's writing lane turns each description into alt text
//   node tools/glow-alt-text.js proposals <work-dir> <vault-dir> one proposal note per page, a tick box per photo
//   node tools/glow-alt-text.js apply <vault-dir> [--mark-applied]  ticked lines of approved notes go into the content files
//   node tools/glow-alt-text.js apply --decisions <dir|file>      or: approved decisions from the Glow Alt Text Review page
//
// draft options: --url <chat endpoint> (default the hub's http://127.0.0.1:8790/ollama/mac/api/chat), --model
// (default mistral-medium-3.5), --header "Name: value" (repeatable), --limit <n>, --timeout <seconds>,
// --redo <id or file,...> or --redo-page <page path> to draft those photos again. proposals --only <page path> --force rewrites just those pages' notes.
// The endpoint may speak Ollama's /api/chat or the OpenAI /v1/chat/completions format.
//
// Every step can be re-run: done work is kept and skipped. Nothing reaches the website until the owner sets a
// proposal to `approved` and Claude runs `apply` on a branch, where CI runs the usual checks.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEntries, cleanAlt, safeName, noteBase, FOLDER } from './vault-sync.js';
import { createClient, MACHINES } from './glow/client.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(readText(f)) : fallback);
const oneLine = (s) => String(s ?? '').replace(/​/g, '').replace(/\s+/g, ' ').trim();
const WIX = (id, w = 1200) => `https://static.wixstatic.com/media/${encodeURI(id)}/v1/fit/w_${w},h_${w},q_85/file.jpg`;
const PHOTO_RE = /!\[([^\]]*)\]\(wix:([^)\s]+)\)/g;
const ICON_MAX = 320; // a PNG this small is a service icon or a logo: decorative, alt left empty
const MAX_ALT = 125;
const BANNED = ['image of', 'photo of', 'picture of', 'stunning', 'breathtaking', 'magical', 'elevate', 'seamless', 'curated', 'nestled', 'truly', 'delve', 'myriad'];
const fileFor = (id) => `${id.replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_-]+/g, '-')}.jpg`;

const decodeId = (raw) => { try { return decodeURIComponent(raw); } catch { return raw; } };
const titleOf = (e) => (['blog-category', 'blog-tag'].includes(e.data.template) ? '' : cleanAlt(e.data.h1?.[0])) || oneLine(String(e.data.title || '').split(' | ')[0]) || e.data.path;
const noteId = (e) => `Site/${FOLDER[e.data.template] || 'Pages'}/${noteBase(e.data.path)}`;

/** Known venue names, longest first, matched as whole words without a leading "The". */
function venueMatcher(venues) {
  // A venue is also known by the part of its name before " - " or " (": "Jefferson Hotel - Empire Ballroom" is the Jefferson Hotel.
  const names = [...new Set(venues.map((v) => v.name).filter(Boolean).flatMap((n) => [n, n.split(/ - | \(/)[0].trim()]))].sort((a, b) => b.length - a.length);
  const key = (n) => n.toLowerCase().replace(/^the\s+/, '').replace(/[’']/g, "'");
  return (text) => {
    const t = ` ${String(text || '').toLowerCase().replace(/[’']/g, "'")} `;
    const found = [];
    for (const n of names) {
      const k = key(n);
      if (k.length < 5) continue;
      const re = new RegExp(`[^a-z0-9]${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z0-9]`);
      if (re.test(t) && !found.some((f) => key(f).includes(k))) found.push(n);
    }
    return found;
  };
}

// ---------------------------------------------------------------- prepare

/**
 * Every photo with an empty alt somewhere on the site, with the context a writer needs:
 * the page, the nearest heading and paragraph, the alt text of the photos around it,
 * alt text the same photo has elsewhere, and the venues those name.
 */
export function collect(root = REPO) {
  const photos = readJson(path.join(root, 'content/photos.json'), {});
  const unavailable = readJson(path.join(root, 'content/photos-unavailable.json'), { photos: {} }).photos || {};
  const venues = readJson(path.join(root, 'content/venues.json'), { venues: [] }).venues || [];
  const venuesIn = venueMatcher(venues);
  const entries = readEntries(root);
  const jobs = new Map();
  const altElsewhere = new Map();
  const job = (id) => {
    if (!jobs.has(id)) {
      const p = photos[id];
      jobs.set(id, {
        id, file: fileFor(id), width: p?.width ?? null, height: p?.height ?? null,
        skip: unavailable[id] ? 'not served by the previous host' : !p ? 'not in the photo manifest'
          : /\.png$/i.test(id) && p.width <= ICON_MAX && p.height <= ICON_MAX ? 'icon' : null,
        uses: [],
      });
    }
    return jobs.get(id);
  };
  const seen = (id, alt) => { if (alt) altElsewhere.set(id, [...new Set([...(altElsewhere.get(id) || []), alt])]); };

  for (const e of entries) {
    const body = e.body || '';
    const refs = [...body.matchAll(PHOTO_RE)].map((m) => {
      // Text after the photo on the same line is its caption: on /venue it is the venue's name.
      const end = body.indexOf('\n', m.index + m[0].length);
      const rest = body.slice(m.index + m[0].length, end < 0 ? undefined : end).replace(/^\]\([^)]*\)/, '');
      const caption = oneLine(rest.replace(/\\$/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_]/g, '')).slice(0, 120);
      return { id: decodeId(m[2]), alt: cleanAlt(m[1]), at: m.index, caption };
    });
    refs.forEach((r) => seen(r.id, r.alt));
    refs.forEach((r, i) => {
      if (r.alt) return;
      const before = body.slice(0, r.at);
      const heading = [...before.matchAll(/^#{1,4}\s*(.+)$/gm)].pop()?.[1] || '';
      const para = before.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith('!') && !p.startsWith('#') && !p.startsWith('<') && !p.startsWith('[!')).pop() || '';
      const near = [...refs.slice(Math.max(0, i - 3), i), ...refs.slice(i + 1, i + 4)].map((x) => x.alt).filter(Boolean);
      job(r.id).uses.push({
        path: e.data.path, file: e.file, note: noteId(e), page: titleOf(e), template: e.data.template,
        heading: oneLine(heading.replace(/[*_#]/g, '')).slice(0, 120),
        text: oneLine(para.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')).slice(0, 400),
        nearby: [...new Set(near)].slice(0, 6),
        caption: r.caption,
      });
    });
  }
  for (const v of venues) {
    for (const x of v.photos || []) {
      const alt = cleanAlt(x.alt);
      seen(x.id, alt);
      if (!alt) job(x.id).uses.push({ path: `/venue/${v.slug}`, file: 'content/venues.json', note: `Site/Venues/${safeName(v.slug)}`, page: v.name, venue: v.name, heading: '', text: oneLine(v.description).slice(0, 400), nearby: [] });
    }
  }
  for (const j of jobs.values()) {
    j.elsewhere = [...new Set([...(altElsewhere.get(j.id) || []), cleanAlt(photos[j.id]?.alt)].filter(Boolean))];
    // Venue evidence for this photo only: not the photos around it, which in a gallery are often at other venues.
    const ctx = j.uses.flatMap((u) => [u.page, u.heading, u.text]).join(' \n ');
    const strong = venuesIn([...j.uses.flatMap((u) => [u.venue || '', u.caption || '']), ...j.elsewhere].join(' \n '));
    const mentioned = venuesIn(ctx);
    // Strong evidence names the venue. Otherwise a venue counts only when it is the one venue mentioned around the photo.
    j.venues = strong.length ? strong : mentioned.length === 1 ? mentioned : [];
    j.venuesMentioned = mentioned;
  }
  return [...jobs.values()].sort((a, b) => a.uses[0].path.localeCompare(b.uses[0].path) || a.id.localeCompare(b.id));
}

export async function prepare(work, { root = REPO, download = true, fetchImpl = fetch } = {}) {
  const jobs = collect(root);
  const dir = path.join(work, 'photos');
  fs.mkdirSync(dir, { recursive: true });
  let got = 0;
  let had = 0;
  const failed = [];
  for (const j of jobs) {
    if (j.skip || !download) continue;
    const dest = path.join(dir, j.file);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { had++; continue; }
    // A JPEG at most 1200 px from the previous host; the local original (often 5000 px) only if that fails.
    const local = path.join(root, '.media', 'originals', j.id);
    try {
      const res = await fetchImpl(WIX(j.id));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      got++;
    } catch (err) {
      if (fs.existsSync(local) && /\.jpe?g$/i.test(j.id)) { fs.copyFileSync(local, dest); got++; } else failed.push(`${j.id}: ${err.message}`);
    }
  }
  fs.writeFileSync(path.join(work, 'jobs.json'), `${JSON.stringify({ prepared: new Date().toISOString(), root, jobs }, null, 1)}\n`);
  return { jobs, got, had, failed, toDescribe: jobs.filter((j) => !j.skip).length };
}

// ---------------------------------------------------------------- draft

/** describe-photo.js writes one JSON object per line; take the file name and the description, whatever the keys. */
export function readDescriptions(work) {
  const out = new Map();
  for (const f of [path.join(work, 'photos', 'descriptions.jsonl'), path.join(work, 'descriptions.jsonl')]) {
    if (!fs.existsSync(f)) continue;
    for (const line of readText(f).split('\n')) {
      if (!line.trim()) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      // describe-photo.js also writes failed photos, with `error` set (sometimes beside a cut-off description),
      // and retries them on the next run; only a clean line counts, and the last one wins.
      if (o.error) continue;
      const file = o.file ?? o.photo ?? o.path ?? o.image ?? o.name ?? o.filename;
      const text = o.description ?? o.text ?? o.response ?? o.output ?? o.content;
      if (file && typeof text === 'string' && text.trim()) out.set(path.basename(String(file).replace(/\\/g, '/')), stripTokens(text));
    }
  }
  return out;
}

const stripTokens = (s) => String(s).replace(/<\|(eot|eot_id|endoftext|im_end|end)\|>/g, '').trim();

export function promptFor(j, description) {
  const uses = j.uses.slice(0, 4).map((u) => [
    `Page: ${u.page} (${u.path})`,
    u.heading && `Section heading: ${u.heading}`,
    u.caption && `Caption beside the photo: ${u.caption}`,
    u.text && `Nearby text: ${u.text}`,
    u.nearby.length && `Alt text of the photos around it, for style only (they may be at other venues): ${u.nearby.map((n) => `"${n}"`).join('; ')}`,
  ].filter(Boolean).join('\n')).join('\n\n');
  return `Write alt text for one photo on the Wedding Lighting Co website (event lighting, drapes, decor and AV in Richmond, Virginia).

Rules:
- Say what the photo shows: the lighting or decor first, then the setting, then the venue, but name a venue only if it is listed under VENUES below.
- 6 to 16 words and under ${MAX_ALT} characters. Sentence case, no full stop at the end.
- Do not start with "image of", "photo of" or "picture of". No dashes of any kind. No sales words such as stunning, beautiful, elegant or magical.
- Describe what can be seen in the photo. Use the page text to name things that are visible, never to add things that are not.
- Never guess a venue, a city, a brand, a colour you were not told, or a number.
- Set "decorative" to true and leave "alt" empty only for an icon or ornament that tells the reader nothing. A logo strip, a rating, a badge or a graphic with words is NOT decorative: say what it tells the reader (the names in the logos, the rating, the headline of the text).

DESCRIPTION (from a vision model; it can be wrong about names):
${description}

CONTEXT
${uses || '(none)'}
Alt text this photo already has elsewhere: ${j.elsewhere.length ? j.elsewhere.map((a) => `"${a}"`).join('; ') : '(none)'}
VENUES: ${j.venues.length ? j.venues.join('; ') : j.venuesMentioned?.length > 1 ? '(none: the page mentions several venues and nothing says which one this is, so do not name one)' : '(none: do not name a venue)'}

Reply with only this JSON object:
{"alt": "...", "decorative": false, "venue": "the venue you named, or empty", "confidence": "high, medium or low", "note": "anything the reviewer should check, or empty"}`;
}

/** The first JSON object in a model's reply, after end tokens and code fences are removed. */
export function parseReply(text) {
  const s = stripTokens(text).replace(/```(json)?/gi, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

/** Deterministic checks on a draft. Each problem is a short reason; any problem leaves the box unticked. */
export function check(j, draft, venuesIn) {
  const flags = [];
  // gpt-oss writes non-breaking hyphens and spaces, which break search and copy-paste.
  const alt = oneLine(String(draft?.alt ?? '').replace(/[\u2010\u2011]/g, '-').replace(/[\u00a0\u202f]/g, ' '));
  if (draft?.decorative) return { alt: '', flags: ['the model says it is decorative'] };
  if (!alt) return { alt: '', flags: ['no alt text in the reply'] };
  const words = alt.split(' ').length;
  if (alt.length > MAX_ALT) flags.push(`${alt.length} characters, over ${MAX_ALT}`);
  if (words < 4) flags.push(`only ${words} words`);
  if (/[—–]|\s-\s/.test(alt)) flags.push('has a dash');
  const low = alt.toLowerCase();
  for (const w of BANNED) if (low.includes(w)) flags.push(`uses "${w}"`);
  const named = venuesIn(alt);
  const unsupported = named.filter((n) => !j.venues.includes(n));
  if (unsupported.length) flags.push(`names ${unsupported.join(', ')}, which the context does not`);
  if (String(draft?.confidence || '').toLowerCase().startsWith('low')) flags.push('the model is not confident');
  return { alt: alt.replace(/\.$/, ''), flags };
}

/** { origin, machine } when `url` is a Glow hub chat route, such as http://127.0.0.1:8790/ollama/mac/api/chat; else null. */
export function hubRoute(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const m = u.pathname.match(/^\/ollama\/([^/]+)\/api\/chat\/?$/);
  return m && MACHINES.has(m[1]) ? { origin: u.origin, machine: m[1] } : null;
}

export async function draft(work, { url = 'http://127.0.0.1:8790/ollama/mac/api/chat', model = 'mistral-medium-3.5', headers = {}, limit = Infinity, timeout = 300, redo = [], redoPages = [], fetchImpl = fetch, log = console.log } = {}) {
  const { jobs } = readJson(path.join(work, 'jobs.json'), { jobs: [] });
  const descriptions = readDescriptions(work);
  const outFile = path.join(work, 'drafts.jsonl');
  // --redo: forget these photos' drafts (by ID or file name) so they are drafted again.
  // --redo-page: every photo used on those pages.
  redo = [...redo, ...jobs.filter((j) => j.uses.some((u) => redoPages.includes(u.path))).map((j) => j.id)];
  if (redo.length && fs.existsSync(outFile)) {
    const drop = new Set(redo);
    const fileOf = new Map(jobs.map((j) => [j.id, j.file]));
    const keep = readText(outFile).split('\n').filter(Boolean).filter((l) => { try { const o = JSON.parse(l); return !drop.has(o.id) && !drop.has(fileOf.get(o.id)); } catch { return true; } });
    fs.writeFileSync(outFile, keep.length ? `${keep.join('\n')}\n` : '');
  }
  const done = new Set(fs.existsSync(outFile) ? readText(outFile).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).id; } catch { return null; } }) : []);
  const hub = hubRoute(url);
  // A hub URL (/ollama/<machine>/api/chat) goes through the shared Glow client. Any other URL (the OpenAI format, or
  // Ollama called directly) keeps the call below, as before the client existed.
  const client = hub && createClient({ hub: hub.origin, fetchImpl, headers, timeout });
  const openai = /\/chat\/completions\/?$/.test(url);
  let n = 0;
  const report = { drafted: 0, skipped: 0, noDescription: 0, failed: 0 };
  for (const j of jobs) {
    if (j.skip) { report.skipped++; continue; }
    if (done.has(j.id)) continue;
    const description = descriptions.get(j.file);
    if (!description) { report.noDescription++; continue; }
    if (n++ >= limit) break;
    const prompt = promptFor(j, description);
    let reply = null;
    let raw = '';
    if (client) {
      // The same request as before: 6,000 tokens, then once more at 12,000 with nothing else changed (retryThink: null),
      // and no num_ctx (numCtx: false), so the hub sizes it as it always has.
      const r = await client.chat({
        machine: hub.machine, model, budget: 6000, retryBudget: 12000, retryThink: null, numCtx: false, temperature: 0.2,
        task: `alt text: ${j.file}`, parse: parseReply,
        messages: [{ role: 'system', content: 'Answer immediately, minimal reasoning. Output only the JSON object. No preamble.' }, { role: 'user', content: prompt }],
      });
      reply = r.ok ? r.json : null;
      raw = r.ok ? '' : r.error && !/^(empty|unparseable) reply$/.test(r.error) ? `error: ${r.error}` : r.text;
    }
    for (const budget of client ? [] : [6000, 12000]) {
      const body = openai
        ? { model, stream: false, max_tokens: budget, temperature: 0.2, messages: [{ role: 'system', content: 'Answer immediately, minimal reasoning. Output only the JSON object. No preamble.' }, { role: 'user', content: prompt }] }
        : { model, stream: false, options: { num_predict: budget, temperature: 0.2 }, messages: [{ role: 'system', content: 'Answer immediately, minimal reasoning. Output only the JSON object. No preamble.' }, { role: 'user', content: prompt }] };
      try {
        const ctrl = AbortSignal.timeout(timeout * 1000);
        // The hub labels each job on Beam's card from these, as describe-photo.js does.
        const hubHeaders = { 'X-LLM-Requester': 'claude', 'X-LLM-Project': 'Website WLC', 'X-LLM-Task': `alt text: ${j.file}` };
        const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...hubHeaders, ...headers }, body: JSON.stringify(body), signal: ctrl });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        raw = openai ? data.choices?.[0]?.message?.content ?? '' : data.message?.content ?? data.response ?? '';
        reply = parseReply(raw);
        if (reply) break;
      } catch (err) {
        raw = `error: ${err.message}`;
      }
    }
    const rec = { id: j.id, model, at: new Date().toISOString(), description, reply, raw: reply ? undefined : String(raw).slice(0, 2000) };
    fs.appendFileSync(outFile, `${JSON.stringify(rec)}\n`);
    if (reply) report.drafted++; else report.failed++;
    log(`${reply ? 'ok  ' : 'FAIL'} ${j.id}${reply ? `: ${oneLine(reply.alt) || '(decorative)'}` : `: ${String(raw).slice(0, 120)}`}`);
  }
  return report;
}

// ---------------------------------------------------------------- proposals

const fm = (o) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)}`).join('\n')}\n---\n`;
const day = (d) => d.toISOString().slice(0, 10);

export function proposals(work, vault, { root = REPO, now = new Date(), force = false, only = [] } = {}) {
  const { jobs } = readJson(path.join(work, 'jobs.json'), { jobs: [] });
  const venues = readJson(path.join(root, 'content/venues.json'), { venues: [] }).venues || [];
  const venuesIn = venueMatcher(venues);
  const drafts = new Map();
  const f = path.join(work, 'drafts.jsonl');
  if (fs.existsSync(f)) for (const l of readText(f).split('\n')) { if (!l.trim()) continue; try { const o = JSON.parse(l); if (o.reply) drafts.set(o.id, o); } catch { /* skip */ } }

  const pages = new Map();
  for (const j of jobs) {
    for (const u of j.uses) {
      const k = `${u.file}\u0000${u.path}`;
      if (!pages.has(k)) pages.set(k, { ...u, items: [] });
      pages.get(k).items.push(j);
    }
  }
  const dir = path.join(vault, 'Curation', 'Proposals');
  fs.mkdirSync(dir, { recursive: true });
  // --only with --force rewrites the notes for those pages: their alt text notes still in draft are removed first,
  // so a page with nothing left to propose loses its stale note. Notes the owner has moved past draft are kept.
  const removed = [];
  if (only.length && force) {
    for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const head = readText(path.join(dir, n)).match(/^---\n([\s\S]*?)\n---\n/)?.[1] || '';
      const get = (k) => (head.match(new RegExp(`^${k}:\\s*"?([^"\\n]*)"?$`, 'm')) || [])[1];
      if (get('field') === 'alt' && get('status') === 'draft' && only.includes(get('target'))) { fs.rmSync(path.join(dir, n)); removed.push(n); }
    }
  }
  const written = [];
  const kept = [];
  const tally = { ticked: 0, flagged: 0, decorative: 0, skipped: 0, waitingPages: 0 };
  const models = new Set([...drafts.values()].map((d) => d.model));
  const names = new Set();
  for (const p of [...pages.values()].sort((a, b) => a.path.localeCompare(b.path)).filter((x) => !only.length || only.includes(x.path))) {
    // Named for the page; two pages with the same heading get the URL added, so neither note is lost.
    const kind = p.file === 'content/venues.json' ? ' (venue)' : p.template === 'blog-tag' ? ' (blog tag)' : p.template === 'blog-category' ? ' (blog category)' : '';
    let name = `${day(now)} Alt text - ${safeName(p.page).slice(0, 70)}${kind}.md`;
    if (names.has(name.toLowerCase())) name = name.replace(/\.md$/, ` - ${noteBase(p.path)}.md`);
    names.add(name.toLowerCase());
    const target = path.join(dir, name);
    if (fs.existsSync(target) && !force) { kept.push(name); continue; }
    // A page is written only once every photo on it has a draft, so a later run never meets a half-done note.
    if (p.items.some((j) => !j.skip && !drafts.has(j.id))) { tally.waitingPages++; continue; }
    if (p.items.every((j) => j.skip)) { tally.skipped += p.items.length; continue; }
    const lines = [];
    const later = [];
    for (const j of p.items) {
      const preview = `![|240](${WIX(j.id, 480)})`;
      if (j.skip) {
        later.push(`- \`${j.id}\`: ${j.skip === 'icon' ? 'an icon or logo; leave the alt text empty (decorative)' : `${j.skip}; nothing to describe`}`);
        tally.skipped++;
        continue;
      }
      const d = drafts.get(j.id);
      const { alt, flags } = check(j, d.reply, venuesIn);
      if (!alt) { later.push(`- \`${j.id}\`: ${flags.join('; ')}. Leave empty, or write one by hand\n\t${preview}`); tally.decorative++; continue; }
      const tick = flags.length ? ' ' : 'x';
      flags.length ? tally.flagged++ : tally.ticked++;
      const also = j.uses.filter((u) => u.path !== p.path).map((u) => `\`${u.path}\``);
      lines.push([
        `- [${tick}] \`${j.id}\`: ${alt}`,
        `\t${preview}`,
        flags.length ? `\t**Check:** ${flags.join('; ')}.` : '',
        d.reply.note ? `\tModel's note: ${oneLine(d.reply.note)}` : '',
        also.length ? `\tAlso on ${also.join(', ')}, which have their own proposals.` : '',
        `\t*Description:* ${oneLine(d.description).slice(0, 600)}`,
      ].filter(Boolean).join('\n'));
    }
    const md = `${fm({
      type: 'proposal', status: 'draft', target: p.path, file: p.file, field: 'alt', freeze: false, author: 'glow',
      model: [...models].join(', ') || 'not drafted yet', described_by: 'muse-glimmer:30b (describe-photo.js)', created: day(now),
      sources: [`[[${p.note}]]`, '[[Site/Photos]]'], photos: p.items.length, pr: '',
    })}# Alt text: ${p.page}

## Change

Add alt text to the photos on \`${p.path}\` that have none. Each line is one photo: a ticked box will be applied, an empty one will not. Edit the words after the photo ID to change them. When the list is right, set \`status: approved\`.

Boxes start ticked when the draft passed every check. A line marked **Check** failed one and starts unticked.

## Proposed

${lines.join('\n\n') || 'Nothing to propose.'}
${later.length ? `\n## Not proposed\n\n${later.join('\n')}\n` : ''}
## Why

Screen readers read alt text aloud, and search engines use it to understand the photos. These photos have none.

## Sources

- [[${p.note}]]
- [[Site/Photos]]
- Descriptions: muse-glimmer:30b on Beam. Alt text: ${[...models].join(', ') || 'not drafted yet'}. Both can be wrong; look at each photo.

## Questions for the owner

## Review

- Checked by:
- Findings:
- Owner's decision:
`;
    fs.writeFileSync(target, md);
    written.push(name);
  }
  const report = `${fm({ type: 'report', created: day(now) })}# Alt text run, ${day(now)}

Glow drafted alt text for the photos on the site that have none. One proposal per page in \`Curation/Proposals/\`, named "${day(now)} Alt text - <page>".

| | |
|---|---|
| Photos with no alt text | ${jobs.length} |
| Drafted and passed every check (ticked) | ${tally.ticked} |
| Drafted but flagged (unticked) | ${tally.flagged} |
| Decorative or no usable draft | ${tally.decorative} |
| Icons, or photos the old host no longer serves | ${tally.skipped} |
| Pages waiting for a description or a draft (no note yet) | ${tally.waitingPages} |
| Proposal notes written | ${written.length} |
| Kept as they were (already there) | ${kept.length} |

Counts are per photo per page, so a photo on two pages counts twice.

Models: descriptions by muse-glimmer:30b; alt text by ${[...models].join(', ') || 'none yet'}.

## Next

1. Claude checks each proposal against its photo and sets \`status: checked\`.
2. The owner reviews, unticks or edits lines, and sets \`status: approved\`.
3. Claude runs \`node tools/glow-alt-text.js apply <vault>\` on a branch of the website and opens a pull request.

## Proposals

${written.concat(kept).sort().map((n) => `- [[Curation/Proposals/${n.replace(/\.md$/, '')}|${n.replace(/^\d{4}-\d\d-\d\d Alt text - /, '').replace(/\.md$/, '')}]]`).join('\n')}
`;
  fs.writeFileSync(path.join(vault, 'Curation', `Alt text run ${day(now)}.md`), report);
  return { written, kept, tally, removed };
}

// ---------------------------------------------------------------- apply

/** Ticked lines of approved alt text proposals, as { note, file, items: [{ id, alt }] }. */
export function approved(vault) {
  const dir = path.join(vault, 'Curation', 'Proposals');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
    const text = readText(path.join(dir, name));
    const head = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!head) continue;
    const meta = Object.fromEntries(head[1].split('\n').map((l) => l.match(/^([A-Za-z_]+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"(.*)"$/, '$1').trim()]));
    if (meta.type !== 'proposal' || meta.field !== 'alt' || meta.status !== 'approved') continue;
    const items = [...text.matchAll(/^- \[[xX]\] `([^`]+)`:\s*(.+)$/gm)].map((m) => ({ id: m[1], alt: oneLine(m[2]) })).filter((x) => x.alt);
    out.push({ note: name, file: meta.file, target: meta.target, items });
  }
  return out;
}

const mdAlt = (s) => s.replace(/\\/g, '').replace(/\[/g, '(').replace(/\]/g, ')');

/** Writes one page's ticked items into its content file. Never replaces alt text a photo already has. */
function applyGroup(root, g, report) {
  const abs = path.join(root, ...String(g.file).split('/'));
  if (!g.file || !fs.existsSync(abs)) { report.notFound.push(`${g.label}: no file ${g.file}`); return 0; }
  let changed = 0;
  if (g.file === 'content/venues.json') {
    const data = JSON.parse(readText(abs));
    const slug = String(g.target || '').replace(/^\/venue\//, '');
    for (const it of g.items) {
      const hits = data.venues.filter((v) => v.slug === slug).flatMap((v) => v.photos || []).filter((x) => x.id === it.id);
      if (!hits.length) { report.notFound.push(`${g.label}: ${it.id}`); continue; }
      for (const h of hits) { if (cleanAlt(h.alt)) report.alreadyHadAlt++; else { h.alt = it.alt; changed++; } }
    }
    if (changed) fs.writeFileSync(abs, JSON.stringify(data, null, 1));
  } else {
    let text = fs.readFileSync(abs, 'utf8');
    for (const it of g.items) {
      let hit = false;
      text = text.replace(PHOTO_RE, (all, alt, raw) => {
        if (decodeId(raw) !== it.id) return all;
        hit = true;
        if (cleanAlt(alt)) { report.alreadyHadAlt++; return all; }
        changed++;
        return `![${mdAlt(it.alt)}](wix:${raw})`;
      });
      if (!hit) report.notFound.push(`${g.label}: ${it.id}`);
    }
    if (changed) fs.writeFileSync(abs, text);
  }
  report.applied += changed;
  return changed;
}

export function apply(vault, { root = REPO, markApplied = false } = {}) {
  const report = { notes: 0, applied: 0, alreadyHadAlt: 0, notFound: [] };
  for (const p of approved(vault)) {
    report.notes++;
    const changed = applyGroup(root, { ...p, label: p.note }, report);
    if (markApplied && changed) {
      const nf = path.join(vault, 'Curation', 'Proposals', p.note);
      fs.writeFileSync(nf, readText(nf).replace(/^status: "?approved"?$/m, 'status: "applied"'));
    }
  }
  return report;
}

/**
 * Decisions from the Glow Alt Text Review page: a folder of `<photo id>.json` documents (as the
 * artifact database tool saves them) or one JSON file holding an array of `{id, status, alt}`.
 */
export function readDecisions(src) {
  const out = [];
  const take = (id, o) => { const d = o && o.data && typeof o.data === 'object' ? o.data : o; if (id && d) out.push({ id: String(id), status: d.status, alt: oneLine(d.alt) }); };
  if (fs.statSync(src).isDirectory()) {
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(dir, e.name));
        else if (e.name.endsWith('.json')) { const o = JSON.parse(readText(path.join(dir, e.name))); take(o.id || e.name.replace(/\.json$/, ''), o); }
      }
    };
    walk(src);
  } else {
    const o = JSON.parse(readText(src));
    for (const x of Array.isArray(o) ? o : o.documents || o.docs || []) take(x.id, x);
  }
  return out;
}

/** Approved decisions go onto every page where that photo has no alt text yet. */
export function applyDecisions(decisions, { root = REPO } = {}) {
  const report = { decisions: decisions.length, approved: 0, applied: 0, alreadyHadAlt: 0, notFound: [] };
  const jobs = new Map(collect(root).map((j) => [j.id, j]));
  const groups = new Map();
  for (const d of decisions) {
    if (d.status !== 'approved' || !d.alt) continue;
    report.approved++;
    const j = jobs.get(d.id);
    if (!j) { report.notFound.push(`${d.id}: no page has it without alt text`); continue; }
    for (const u of j.uses) {
      const k = `${u.file}\u0000${u.path}`;
      if (!groups.has(k)) groups.set(k, { file: u.file, target: u.path, label: u.path, items: [] });
      groups.get(k).items.push({ id: d.id, alt: d.alt });
    }
  }
  for (const g of groups.values()) applyGroup(root, g, report);
  return report;
}

// ---------------------------------------------------------------- command line

async function main(argv) {
  const [cmd, ...rest] = argv;
  const opts = { headers: {} };
  const pos = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--url') opts.url = rest[++i];
    else if (a === '--model') opts.model = rest[++i];
    else if (a === '--header') { const [k, ...v] = rest[++i].split(':'); opts.headers[k.trim()] = v.join(':').trim(); }
    else if (a === '--limit') opts.limit = Number(rest[++i]);
    else if (a === '--timeout') opts.timeout = Number(rest[++i]);
    else if (a === '--no-download') opts.download = false;
    else if (a === '--force') opts.force = true;
    else if (a === '--redo') opts.redo = [...(opts.redo || []), ...rest[++i].split(',').map((x) => x.trim()).filter(Boolean)];
    else if (a === '--only') opts.only = [...(opts.only || []), rest[++i]];
    else if (a === '--redo-page') opts.redoPages = [...(opts.redoPages || []), rest[++i]];
    else if (a === '--mark-applied') opts.markApplied = true;
    else if (a === '--decisions') opts.decisions = rest[++i];
    else pos.push(a);
  }
  if (cmd === 'prepare' && pos[0]) {
    const r = await prepare(path.resolve(pos[0]), { download: opts.download !== false });
    const skips = r.jobs.filter((j) => j.skip).reduce((m, j) => ({ ...m, [j.skip]: (m[j.skip] || 0) + 1 }), {});
    console.log(`${r.jobs.length} photos with no alt text on ${new Set(r.jobs.flatMap((j) => j.uses.map((u) => u.path))).size} pages. To describe: ${r.toDescribe}. Skipped: ${JSON.stringify(skips)}.`);
    console.log(`Downloaded ${r.got}, already there ${r.had}, failed ${r.failed.length}.${r.failed.length ? `\n${r.failed.join('\n')}` : ''}`);
    console.log(`Next: node "<local-llm>\\describe-photo.js" "${path.join(path.resolve(pos[0]), 'photos')}"`);
  } else if (cmd === 'draft' && pos[0]) {
    const r = await draft(path.resolve(pos[0]), opts);
    console.log(`Drafted ${r.drafted}, failed ${r.failed}, no description yet ${r.noDescription}, skipped ${r.skipped}.`);
  } else if (cmd === 'proposals' && pos[1]) {
    const r = proposals(path.resolve(pos[0]), path.resolve(pos[1]), { force: opts.force, only: opts.only || [] });
    console.log(`Proposal notes written ${r.written.length}, kept ${r.kept.length}. ${JSON.stringify(r.tally)}`);
  } else if (cmd === 'apply' && opts.decisions) {
    const r = applyDecisions(readDecisions(path.resolve(opts.decisions)));
    console.log(`Decisions ${r.decisions}, approved ${r.approved}; alt text added to ${r.applied} photo uses; ${r.alreadyHadAlt} already had alt text and were left alone.${r.notFound.length ? `\nNot found:\n${r.notFound.join('\n')}` : ''}`);
  } else if (cmd === 'apply' && pos[0]) {
    const r = apply(path.resolve(pos[0]), { markApplied: opts.markApplied });
    console.log(`Approved notes ${r.notes}; alt text added to ${r.applied} photos; ${r.alreadyHadAlt} already had alt text and were left alone.${r.notFound.length ? `\nNot found:\n${r.notFound.join('\n')}` : ''}`);
  } else {
    console.log('Usage:\n  node tools/glow-alt-text.js prepare <work-dir> [--no-download]\n  node tools/glow-alt-text.js draft <work-dir> [--url <chat url>] [--model <name>] [--header "Name: value"] [--limit n] [--timeout s] [--redo id,id] [--redo-page /page/path]\n  node tools/glow-alt-text.js proposals <work-dir> <vault-dir> [--force] [--only /page/path ...]\n  node tools/glow-alt-text.js apply <vault-dir> [--mark-applied]\n  node tools/glow-alt-text.js apply --decisions <folder or file from the review page>');
    process.exit(cmd ? 1 : 0);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main(process.argv.slice(2)).catch((err) => { console.error(err.stack || err.message); process.exit(1); });
}
