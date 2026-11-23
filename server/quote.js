// POST /api/quote. The order matters: the request is saved before the visitor
// sees the confirmation page, and the lead intake post and notification email
// happen afterwards, with retries.
//
// Environment (besides the delivery settings in lib/deliver.js):
//   DATABASE_URL       Postgres connection string. Without it the route answers
//                      with the "call or email us" page and saves nothing.
//   TURNSTILE_SECRET   optional. When set, a Turnstile answer that the form sends is checked
//                      with Cloudflare, and a wrong one is refused. See turnstileRule() below.
//   TURNSTILE_REQUIRED "1" also refuses a request that sends no answer at all. Honoured only
//                      when the built quote page has the widget (PUBLIC_TURNSTILE_SITEKEY at
//                      build time); without the widget nobody could send an answer.
//   CF_ORIGIN_SECRET   see clientIp() below.
//   STATUS_TOKEN       optional. When set, GET /health/delivery answers requests that send it
//                      in the X-Status-Token header with the delivery counts. Unset: 404.
import crypto from 'node:crypto';
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
const digest = (x) => crypto.createHash('sha256').update(String(x)).digest();
let warnedCf = 0;
export function clientIp(req) {
  const secret = process.env.CF_ORIGIN_SECRET;
  const cf = req.headers['cf-connecting-ip'];
  if (cf && secret && crypto.timingSafeEqual(digest(req.headers['x-origin-secret'] || ''), digest(secret))) return String(cf);
  // Through Cloudflare without the proof, every visitor would share Cloudflare's addresses and
  // one rate limit. Say so in the log (at most once a minute) so a missing rule is noticed.
  if (cf && Date.now() - warnedCf > 60000) {
    warnedCf = Date.now();
    console.warn(`request with CF-Connecting-IP but ${secret ? 'a wrong or missing X-Origin-Secret' : 'no CF_ORIGIN_SECRET set'}: rate limit uses the proxy address`);
  }
  return String(req.headers['fly-client-ip'] || req.socket.remoteAddress || '');
}

/**
 * When the Turnstile answer is checked. No setting can turn every customer away:
 * - TURNSTILE_SECRET unset: no check.
 * - Secret set: an answer the form sends is verified; a wrong answer is refused. If Cloudflare
 *   does not answer within 5 s the request is accepted.
 * - A request with no answer is refused only when TURNSTILE_REQUIRED=1 AND the built quote page
 *   contains the widget. Otherwise it is accepted and logged. Visitors without JavaScript cannot
 *   produce an answer, so TURNSTILE_REQUIRED is off by default.
 */
export function turnstileRule({ secret, required, pageHasWidget }) {
  if (!secret) return 'off';
  return required && pageHasWidget ? 'required' : 'verify-if-sent';
}

// uploadBudget: bytes of uploads held in memory at once (tests pass a small one).
export function registerQuote(app, { dist, store, deliverOpts = {}, fetchFn = fetch, now = () => new Date(), uploadBudget = 96 * 1024 * 1024 }) {
  // The pages the route answers with never change while the server runs.
  const pages = new Map();
  const page = (name) => {
    if (!pages.has(name)) pages.set(name, fs.readFileSync(path.join(dist, `${name}.html`), 'utf8'));
    return pages.get(name);
  };
  // The email shows every service tile with the chosen ones lit, so it needs the full list.
  try { setServiceList([...page('get-a-quote').matchAll(/name="services" value="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))); } catch { /* quote page not built */ }
  let pageHasWidget = false;
  try { pageHasWidget = page('get-a-quote').includes('class="cf-turnstile"'); } catch { /* quote page not built */ }
  const turnstile = turnstileRule({ secret: process.env.TURNSTILE_SECRET, required: process.env.TURNSTILE_REQUIRED === '1', pageHasWidget });
  if (process.env.TURNSTILE_SECRET && process.env.TURNSTILE_REQUIRED === '1' && !pageHasWidget) {
    app.log.warn('TURNSTILE_REQUIRED=1 is ignored: the quote page was built without the Turnstile widget (PUBLIC_TURNSTILE_SITEKEY)');
  }
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
  // Resolves once no first delivery is running. Shutdown uses the same set; tests use this to
  // wait for the background delivery instead of guessing how long it takes.
  app.decorate('quoteDeliveriesSettled', async () => { while (running.size) await Promise.allSettled([...running]); });
  // Requests being saved right now, by content, so a double click's second request is not saved
  // twice before the first one reaches the database. The value resolves to true once saved.
  const inFlight = new Map();
  // Every answer and every photo is part of the key: a second request that adds photos or
  // corrects the venue is a new request, not a repeat.
  const contentKey = (s, uploads) => {
    const h = crypto.createHash('sha256').update(JSON.stringify([s.email, s.name, s.eventDate, s.venue, s.howDidYouFindUs, s.details, s.services]));
    for (const u of uploads) h.update(crypto.createHash('sha256').update(u).digest());
    return h.digest('hex');
  };
  // Uploads are read into memory before they can be checked. Instead of making requests wait for
  // a turn (a waiting request that is abandoned, or a deliberately slow one, can hold its place),
  // the server keeps a budget of upload bytes held at once. A request that would go over it is
  // read to the end without keeping its photos, and the visitor gets the form back with every
  // answer kept, asked to send again or without photos. Bytes are held until the response is
  // finished (or the connection closes), which covers decoding and saving too.
  const budget = uploadBudget;
  let held = 0;
  // No address may hold more than one full request's worth (5 x 8 MB), so one place cannot take
  // the whole budget and keep everyone else's photos out.
  const PER_ADDRESS_BYTES = MAX_FILES * MAX_FILE_BYTES;
  const heldBy = new Map();
  // A looser per-address count, taken before anything is read, keeps one address from sending
  // endless requests that fail validation and so never reach the main rate limit. A post refused
  // here is not counted, so a refused address recovers as the window moves on.
  const posts = new Map();
  const tooManyPosts = (ip) => {
    const t = now().getTime();
    if (posts.size > 10000) for (const [k, v] of posts) if (t - v[v.length - 1] >= RATE_WINDOW) posts.delete(k);
    const recent = (posts.get(ip) || []).filter((x) => t - x < RATE_WINDOW);
    if (recent.length >= RATE_LIMIT * 4) { posts.set(ip, recent); return true; }
    recent.push(t);
    posts.set(ip, recent);
    return false;
  };
  // Requests saved in the last two minutes, by content key, so the same request with photos sent
  // again after the first one finished (Back, then Submit) is still recognised as a repeat.
  const recentlySaved = new Map();
  const REPEAT_WINDOW = 2 * 60 * 1000;
  const savedRecently = (key) => {
    const t = now().getTime();
    for (const [k, at] of recentlySaved) if (t - at >= REPEAT_WINDOW) recentlySaved.delete(k);
    return recentlySaved.has(key);
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

  // The bytes a request holds are given back only when its handler has finished (photos decoded
  // and saved, or refused), not when the visitor hangs up: the handler keeps the photos in memory
  // until then. A handler always finishes: an abandoned upload makes reading the body throw, and
  // a stalled one is cut off by the server's request timeout.
  app.post('/api/quote', async (req, reply) => {
    const acct = { from: clientIp(req), mine: 0 };
    try {
      return await handleQuote(req, reply, acct);
    } finally {
      held -= acct.mine;
      const left = (heldBy.get(acct.from) || 0) - acct.mine;
      if (left > 0) heldBy.set(acct.from, left); else heldBy.delete(acct.from);
    }
  });

  async function handleQuote(req, reply, acct) {
    const html = (code, body) => reply.code(code).header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(body);
    const fields = {};
    const uploads = [];
    let tooBig = false;
    let busy = false;
    // Per-address limits need the visitor's own address: see clientIp() and CF_ORIGIN_SECRET.
    // (Skipping them when a CF-Connecting-IP header is unproven would let anyone bypass them by
    // sending that header to the fly.dev address.)
    const from = clientIp(req);
    if (tooManyPosts(from)) return html(429, page('quote-problem'));
    const take = (n) => { held += n; acct.mine += n; heldBy.set(from, (heldBy.get(from) || 0) + n); };
    try {
      if (req.isMultipart()) {
        for await (const part of req.parts()) {
          if (part.type === 'file') {
            // Kept as sent for now. Decoding is the expensive part, so it waits until the request
            // has passed every cheaper check below. Bytes are counted against the budget as they
            // arrive; once a file would go over it, the rest of that file is read and dropped.
            const chunks = [];
            let size = 0;
            for await (const c of part.file) {
              if (busy) continue;
              if (held + c.length > budget || (heldBy.get(from) || 0) + c.length > PER_ADDRESS_BYTES) { busy = true; take(-size); size = 0; chunks.length = 0; continue; }
              take(c.length); size += c.length; chunks.push(c);
            }
            if (part.file.truncated) { tooBig = true; take(-size); continue; }
            if (size) uploads.push(Buffer.concat(chunks, size));
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
    if (busy) {
      req.log.warn('quote request with photos refused: upload budget in use');
      return html(503, formWithErrors(page('get-a-quote'), s, {}, 'We are receiving a lot of photos right now and could not take yours. Please send your request again in a minute, or send it without photos.'));
    }
    const ip = clientIp(req);
    if (limited(ip)) return html(429, page('quote-problem'));

    const token = String(fields['cf-turnstile-response'] || '');
    const notPerson = () => html(422, formWithErrors(page('get-a-quote'), s, {}, 'We could not confirm you are a person. Please try again.'));
    if (turnstile !== 'off' && !token) {
      if (turnstile === 'required') return notPerson();
      req.log.warn('quote request without a Turnstile answer; accepted (TURNSTILE_REQUIRED is not on)');
    } else if (turnstile !== 'off') {
      const res = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: token, remoteip: ip }),
      }).then((r) => r.json()).catch((e) => {
        // Cloudflare not answering is no reason to turn a customer away.
        req.log.error(e, 'Turnstile check could not be made; request accepted');
        return { success: true };
      });
      if (!res.success) return notPerson();
    }

    // The same request again within two minutes (a double click, a resubmitted page) gets the
    // same confirmation and is not saved or delivered a second time.
    const key = contentKey(s, uploads);
    // A browser shows only the answer to the last click, so the second request waits for the
    // first and confirms only if the first was saved. Checking and marking happen with no await
    // in between, so two requests arriving together cannot both pass.
    if (savedRecently(key)) return reply.redirect('/quote-sent', 303);
    while (inFlight.has(key)) {
      if (await inFlight.get(key)) return reply.redirect('/quote-sent', 303);
    }
    let saved = () => {};
    inFlight.set(key, new Promise((r) => { saved = r; }));
    try {
      // The database check covers a resubmit after the first request finished. It cannot compare
      // photos (they are stored re-encoded), so a request with photos is only matched in memory.
      if (store?.findRepeat && !uploads.length) {
        const repeat = await store.findRepeat(s, now()).catch((e) => { req.log.error(e, 'repeat check failed'); return null; });
        if (repeat) {
          req.log.info({ id: repeat }, 'quote request repeated within two minutes; not saved again');
          saved(true);
          return reply.redirect('/quote-sent', 303);
        }
      }
      const out = await saveAndConfirm(req, reply, s, uploads, ip, html);
      saved(reply.statusCode === 303);
      if (reply.statusCode === 303) recentlySaved.set(key, now().getTime());
      return out;
    } catch (e) {
      saved(false);
      throw e;
    } finally {
      inFlight.delete(key);
    }
  }

  async function saveAndConfirm(req, reply, s, uploads, ip, html) {
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
  }

  // Delivery health for an outside monitor. Kept off /health, which Fly checks: a database
  // outage must not make Fly restart a machine that still serves every page.
  const digest = (x) => crypto.createHash('sha256').update(String(x)).digest();
  app.get('/health/delivery', async (req, reply) => {
    const token = process.env.STATUS_TOKEN;
    if (!token || !crypto.timingSafeEqual(digest(req.headers['x-status-token'] || ''), digest(token))) return reply.callNotFound();
    reply.header('Cache-Control', 'no-store');
    if (!store?.status) return reply.code(503).send({ db: 'not configured', pending: null, oldestPendingMinutes: null, failed: null });
    try {
      const counts = await Promise.race([
        store.status(now()),
        new Promise((_, no) => setTimeout(() => no(new Error('database did not answer within 3 seconds')), 3000).unref()),
      ]);
      return { db: 'ok', ...counts };
    } catch (e) {
      return reply.code(503).send({ db: 'error', error: e.message, pending: null, oldestPendingMinutes: null, failed: null });
    }
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
