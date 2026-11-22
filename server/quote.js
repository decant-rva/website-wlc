// POST /api/quote. The order matters: the request is saved before the visitor
// sees the confirmation page, and the lead intake post and notification email
// happen afterwards, with retries.
//
// Environment (besides the delivery settings in lib/deliver.js):
//   DATABASE_URL       Postgres connection string. Without it the route answers
//                      with the "call or email us" page and saves nothing.
//   TURNSTILE_SECRET   optional. When set, the cf-turnstile-response field is verified.
import fs from 'node:fs';
import path from 'node:path';
import multipart from '@fastify/multipart';
import { deliver, retryPass } from './lib/deliver.js';

const MAX_FILES = 5;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT = 5;                 // submissions per address
const RATE_WINDOW = 10 * 60 * 1000;   // in ten minutes
const FILE_TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max);
/** Today's date in New York, the day GigFriend files the lead under. */
export const newYorkDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);

export function validate(f) {
  const s = {
    name: clean(f.name, 200), email: clean(f.email, 200), eventDate: clean(f.eventDate, 40),
    howDidYouFindUs: clean(f.howDidYouFindUs, 300), venue: clean(f.venue, 300), details: clean(f.details, 5000),
    services: [].concat(f.services || []).map((x) => clean(x, 80)).filter(Boolean).slice(0, 20),
  };
  const bad = {};
  if (!s.name) bad['q-name'] = 'Enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) bad['q-email'] = 'Enter an email address we can reply to.';
  if (s.eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(s.eventDate)) bad['q-date'] = 'Enter the date as year, month, day.';
  return { s, bad };
}

/** The quote page again, with the visitor's answers kept and the problems marked. */
export function formWithErrors(html, s, bad, extra = '') {
  const list = Object.values(bad).concat(extra ? [extra] : []);
  const summary = `<div class="qerr" role="alert"><p>Please check the form:</p><ul>${list.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
  let out = html.replace('<form class="quote"', `${summary}<form class="quote"`);
  const values = { 'q-name': s.name, 'q-email': s.email, 'q-date': s.eventDate, 'q-venue': s.venue, 'q-ref': s.howDidYouFindUs };
  for (const [id, value] of Object.entries(values)) {
    const marker = `<input id="${id}"`;
    if (bad[id]) out = out.replace(new RegExp(`<p class="([^"]*)">(<label for="${id}")`), '<p class="$1 bad">$2');
    out = out.replace(marker, `${marker}${bad[id] ? ' aria-invalid="true"' : ''} value="${esc(value)}"`);
  }
  out = out.replace(/(<textarea id="q-vision"[^>]*>)/, `$1${esc(s.details)}`);
  for (const name of s.services) out = out.replace(`name="services" value="${esc(name)}"`, `name="services" value="${esc(name)}" checked`);
  return out;
}

export function registerQuote(app, { dist, store, deliverOpts = {}, fetchFn = fetch, now = () => new Date() }) {
  const page = (name) => fs.readFileSync(path.join(dist, `${name}.html`), 'utf8');
  const hits = new Map();
  const limited = (ip) => {
    const t = now().getTime();
    const recent = (hits.get(ip) || []).filter((x) => t - x < RATE_WINDOW);
    recent.push(t);
    hits.set(ip, recent);
    return recent.length > RATE_LIMIT;
  };

  // The form posts multipart. A plain urlencoded post is accepted too.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 100000 }, (req, body, done) => {
    const out = {};
    for (const [k, v] of new URLSearchParams(body)) {
      if (k === 'services') (out.services ||= []).push(v); else out[k] = v;
    }
    done(null, out);
  });
  app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES, fields: 40, fieldSize: 20000 } });

  app.post('/api/quote', async (req, reply) => {
    const html = (code, body) => reply.code(code).header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(body);
    const fields = {};
    const files = [];
    let tooBig = false;
    try {
      if (req.isMultipart()) {
        for await (const part of req.parts()) {
          if (part.type === 'file') {
            const bytes = await part.toBuffer();
            if (part.file.truncated) tooBig = true;
            else if (bytes.length && FILE_TYPES.test(part.mimetype)) files.push({ filename: clean(part.filename, 200) || 'file', mime: part.mimetype, bytes });
          } else if (part.fieldname === 'services') (fields.services ||= []).push(part.value);
          else fields[part.fieldname] = part.value;
        }
      } else Object.assign(fields, req.body || {});
    } catch (e) {
      if (e.code === 'FST_REQ_FILE_TOO_LARGE' || e.code === 'FST_FILES_LIMIT') tooBig = true; else throw e;
    }

    // A filled trap field is a bot. It gets the same confirmation and nothing is kept.
    if (fields.company) return reply.redirect('/quote-sent', 303);

    const { s, bad } = validate(fields);
    const extra = tooBig ? `Send up to ${MAX_FILES} files of ${MAX_FILE_BYTES / 1024 / 1024} MB or less each.` : '';
    if (Object.keys(bad).length || extra) return html(422, formWithErrors(page('get-a-quote'), s, bad, extra));
    if (limited(req.ip)) return html(429, page('quote-problem'));

    if (process.env.TURNSTILE_SECRET) {
      const res = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: fields['cf-turnstile-response'] || '', remoteip: req.ip }),
      }).then((r) => r.json()).catch(() => ({ success: false }));
      if (!res.success) return html(422, formWithErrors(page('get-a-quote'), s, {}, 'We could not confirm you are a person. Please try again.'));
    }

    if (!store) return html(503, page('quote-problem'));
    let id;
    try {
      id = await store.save({ ...s, submittedAt: newYorkDate(now()), ip: req.ip }, files);
    } catch (e) {
      req.log.error(e, 'quote request could not be saved');
      return html(503, page('quote-problem'));
    }
    // The visitor does not wait on the intake post or the email.
    reply.redirect('/quote-sent', 303);
    deliver(store, id, deliverOpts).catch((e) => req.log.error(e, 'quote delivery failed'));
    return reply;
  });

  if (store) {
    const timer = setInterval(() => retryPass(store, deliverOpts).catch(() => {}), 60 * 1000);
    timer.unref();
    app.addHook('onClose', async () => clearInterval(timer));
  }
}
