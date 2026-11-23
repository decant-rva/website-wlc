// POST /api/quote. The order matters: the request is saved before the visitor
// sees the confirmation page, and the lead intake post and notification email
// happen afterwards, with retries.
//
// Environment (besides the delivery settings in lib/deliver.js):
//   DATABASE_URL       Postgres connection string. Without it the route answers
//                      with the "call or email us" page and saves nothing.
//   TURNSTILE_SECRET   optional. When set, the cf-turnstile-response field is verified.
//                      Do not set it until the form shows the Turnstile widget: without
//                      the widget no visitor can pass the check.
//   CF_ORIGIN_SECRET   see clientIp() below.
import fs from 'node:fs';
import path from 'node:path';
import multipart from '@fastify/multipart';
import { deliver, retryPass } from './lib/deliver.js';
import { safePhoto } from './lib/images.js';
import { setServiceList } from './lib/quote-email.js';

const MAX_FILES = 5;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT = 5;                 // submissions per address
const RATE_WINDOW = 10 * 60 * 1000;   // in ten minutes
// Retries only matter when GigFriend or the mail server is failing; the first delivery runs at
// once. Ten minutes between passes lets the Neon database scale to zero (it waits 5 idle minutes).
const RETRY_EVERY = Number(process.env.RETRY_EVERY_MS || 10 * 60 * 1000);
// The hidden field bots fill in. Its name and label must not look like anything a browser or
// password manager fills in for a person (an earlier version used "company").
export const TRAP_FIELD = 'qz_extra';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
// Fields that are one line on the form stay one line, so nobody can add lines of their own to
// the plain-text email that the Gmail lead parser reads.
const oneLine = (v, max) => clean(v, max * 2).replace(/[\n\u0085\u2028\u2029]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
/** Today's date in New York, the day GigFriend files the lead under. */
export const newYorkDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);

/** A real calendar date in the form YYYY-MM-DD. */
export const isDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && d.getUTCFullYear() >= 2000;
};

export function validate(f) {
  const s = {
    name: oneLine(f.name, 200), email: oneLine(f.email, 200), eventDate: oneLine(f.eventDate, 40),
    howDidYouFindUs: oneLine(f.howDidYouFindUs, 300), venue: oneLine(f.venue, 300), details: clean(f.details, 5000),
    services: [].concat(f.services || []).map((x) => oneLine(x, 80)).filter(Boolean).slice(0, 20),
  };
  const bad = {};
  if (!s.name) bad['q-name'] = 'Enter your full name.';
  if (!/^[^\s@,;:<>()[\]\\"?&=]+@[^\s@,;:<>()[\]\\"?&=]+\.[^\s@,;:<>()[\]\\"?&=]+$/.test(s.email)) bad['q-email'] = 'Enter an email address we can reply to.';
  if (s.eventDate && !isDate(s.eventDate)) bad['q-date'] = 'Enter the date as year, month, day.';
  return { s, bad };
}

/** The quote page again, with the visitor's answers kept and the problems marked. */
export function formWithErrors(html, s, bad, extra = '') {
  // Every insertion goes through a function: a replacement string would read "$&", "$`" and "$'"
  // in what the visitor typed as instructions to copy parts of the page.
  const put = (text) => () => text;
  const list = Object.values(bad).concat(extra ? [extra] : []);
  const summary = `<div class="qerr" role="alert"><p>Please check the form:</p><ul>${list.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
  let out = html.replace('<form class="quote"', put(`${summary}<form class="quote"`));
  const values = { 'q-name': s.name, 'q-email': s.email, 'q-date': s.eventDate, 'q-venue': s.venue, 'q-ref': s.howDidYouFindUs };
  for (const [id, value] of Object.entries(values)) {
    const marker = `<input id="${id}"`;
    if (bad[id]) out = out.replace(new RegExp(`<p class="([^"]*)">(<label for="${id}")`), (_, cls, label) => `<p class="${cls} bad">${label}`);
    out = out.replace(marker, put(`${marker}${bad[id] ? ' aria-invalid="true"' : ''} value="${esc(value)}"`));
  }
  out = out.replace(/(<textarea id="q-vision"[^>]*>)/, (tag) => `${tag}${esc(s.details)}`);
  for (const name of s.services) out = out.replace(`name="services" value="${esc(name)}"`, put(`name="services" value="${esc(name)}" checked`));
  return out;
}

/**
 * The visitor's address, for the rate limit and Turnstile. Never taken from X-Forwarded-For,
 * which anyone can write.
 * - Through Cloudflare: CF-Connecting-IP, trusted only when the request carries the
 *   X-Origin-Secret header that a Cloudflare Transform Rule adds (value CF_ORIGIN_SECRET).
 *   Without that proof the header could be forged by going to the fly.dev address directly.
 * - Otherwise Fly-Client-IP, which Fly's proxy sets on every request, then the socket address.
 * Until CF_ORIGIN_SECRET is configured, requests through Cloudflare all show Cloudflare's own
 * addresses here, so configure it before Cloudflare is put in front.
 */
export function clientIp(req) {
  const secret = process.env.CF_ORIGIN_SECRET;
  if (secret && req.headers['x-origin-secret'] === secret && req.headers['cf-connecting-ip']) return String(req.headers['cf-connecting-ip']);
  return String(req.headers['fly-client-ip'] || req.socket.remoteAddress || '');
}

export function registerQuote(app, { dist, store, deliverOpts = {}, fetchFn = fetch, now = () => new Date() }) {
  // The pages the route answers with never change while the server runs.
  const pages = new Map();
  const page = (name) => {
    if (!pages.has(name)) pages.set(name, fs.readFileSync(path.join(dist, `${name}.html`), 'utf8'));
    return pages.get(name);
  };
  // The email shows every service tile with the chosen ones lit, so it needs the full list.
  try { setServiceList([...page('get-a-quote').matchAll(/name="services" value="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))); } catch { /* quote page not built */ }
  const hits = new Map();
  const limited = (ip) => {
    const t = now().getTime();
    if (hits.size > 10000) for (const [k, v] of hits) if (t - v[v.length - 1] >= RATE_WINDOW) hits.delete(k);
    const recent = (hits.get(ip) || []).filter((x) => t - x < RATE_WINDOW);
    recent.push(t);
    hits.set(ip, recent);
    return recent.length > RATE_LIMIT;
  };
  // First deliveries still running, so a shutdown can wait for them.
  const running = new Set();

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
    const uploads = [];
    let tooBig = false;
    try {
      if (req.isMultipart()) {
        for await (const part of req.parts()) {
          if (part.type === 'file') {
            // Kept as sent for now. Decoding is the expensive part, so it waits until the request
            // has passed every cheaper check below.
            const bytes = await part.toBuffer();
            if (part.file.truncated) tooBig = true;
            else if (bytes.length) uploads.push(bytes);
          } else if (part.fieldname === 'services') (fields.services ||= []).push(part.value);
          else fields[part.fieldname] = part.value;
        }
      } else Object.assign(fields, req.body || {});
    } catch (e) {
      if (e.code === 'FST_REQ_FILE_TOO_LARGE' || e.code === 'FST_FILES_LIMIT') tooBig = true; else throw e;
    }

    // A filled trap field is a bot. It gets the same confirmation and nothing is kept. The log
    // line lets a person who was mistaken for a bot be found again.
    if (fields[TRAP_FIELD]) {
      req.log.warn({ email: oneLine(fields.email, 200) }, 'quote request dropped: trap field filled');
      return reply.redirect('/quote-sent', 303);
    }

    const { s, bad } = validate(fields);
    const tooMany = `Send up to ${MAX_FILES} photos of ${MAX_FILE_BYTES / 1024 / 1024} MB or less each.`;
    if (Object.keys(bad).length || tooBig) return html(422, formWithErrors(page('get-a-quote'), s, bad, tooBig ? tooMany : ''));
    const ip = clientIp(req);
    if (limited(ip)) return html(429, page('quote-problem'));

    if (process.env.TURNSTILE_SECRET) {
      const res = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: fields['cf-turnstile-response'] || '', remoteip: ip }),
      }).then((r) => r.json()).catch((e) => {
        // Cloudflare not answering is no reason to turn a customer away.
        req.log.error(e, 'Turnstile check could not be made; request accepted');
        return { success: true };
      });
      if (!res.success) return html(422, formWithErrors(page('get-a-quote'), s, {}, 'We could not confirm you are a person. Please try again.'));
    }

    // Never trust the name or type the browser sent. Each file is decoded and rewritten as a
    // plain JPEG; anything that is not a picture is refused. See lib/images.js.
    const files = [];
    let notPhotos = 0;
    for (const bytes of uploads) {
      const photo = await safePhoto(bytes);
      if (photo) files.push({ filename: `photo-${files.length + 1}.jpg`, mime: photo.mime, bytes: photo.bytes });
      else notPhotos += 1;
    }
    if (notPhotos) {
      return html(422, formWithErrors(page('get-a-quote'), s, {}, 'We could only accept photos (JPEG, PNG, WebP or GIF). One of your files was not a photo we could open. Please choose your photos again, or send the request without them.'));
    }

    if (!store) return html(503, page('quote-problem'));
    let id;
    try {
      id = await store.save({ ...s, submittedAt: newYorkDate(now()), ip }, files, now());
    } catch (e) {
      req.log.error(e, 'quote request could not be saved');
      return html(503, page('quote-problem'));
    }
    // The visitor does not wait on the intake post or the email.
    reply.redirect('/quote-sent', 303);
    const job = deliver(store, id, deliverOpts).catch((e) => req.log.error(e, 'quote delivery failed')).finally(() => running.delete(job));
    running.add(job);
    return reply;
  });

  if (store) {
    let pass = null;
    const timer = setInterval(() => {
      if (pass) return; // the previous pass is still running
      pass = retryPass(store, deliverOpts).catch((e) => console.error('retry pass failed:', e.message)).finally(() => { pass = null; });
    }, RETRY_EVERY);
    timer.unref();
    app.addHook('onClose', async () => {
      clearInterval(timer);
      await Promise.allSettled([...running, pass].filter(Boolean));
    });
  }
}
