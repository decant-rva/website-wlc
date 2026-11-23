// Run after `npm run build`:  node --test
// The database is an in-memory Postgres (pg-mem); the lead intake and the email are fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import sharp from 'sharp';
import { safePhoto } from '../server/lib/images.js';
import { build } from '../server/server.js';
import { migrate, quoteStore } from '../server/lib/store.js';
import nodemailer from 'nodemailer';
import { deliver, retryPass, backoff, quoteMessage, sendEmail } from '../server/lib/deliver.js';
import { LEASE_MS } from '../server/lib/store.js';
import { quoteEmail, daysUntil } from '../server/lib/quote-email.js';
import { validate, newYorkDate, formWithErrors, TRAP_FIELD } from '../server/quote.js';

async function setup({ intakeFails = false, emailFails = false, fetchFn } = {}) {
  const { Pool } = newDb().adapters.createPg();
  const pool = new Pool();
  await migrate(pool);
  const store = quoteStore(pool);
  const sent = { intake: [], email: [], alert: [] };
  const deliverOpts = {
    intake: async (row) => { if (intakeFails) throw new Error('intake down'); sent.intake.push(row); },
    email: async (row, files) => { if (emailFails) throw new Error('email down'); sent.email.push({ row, files }); },
    alert: async (stuck) => { sent.alert.push(stuck); },
  };
  const app = build({ quote: { store, deliverOpts, ...(fetchFn ? { fetchFn } : {}) } });
  return { app, store, pool, sent, deliverOpts };
}
const form = (o) => new URLSearchParams(o).toString();
const post = (app, body, ip = '10.0.0.1', headers = {}) => app.inject({
  method: 'POST', url: '/api/quote', payload: form(body), remoteAddress: ip,
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
});
const settle = () => new Promise((r) => setTimeout(r, 50));
const good = { name: 'Test Person', email: 'test@example.com', eventDate: '2027-05-01', venue: 'Dover Hall', howDidYouFindUs: 'Google', details: 'String lights over the patio.' };

test('a valid request is saved, confirmed, posted to the intake and emailed', async () => {
  const { app, pool, sent } = await setup();
  const res = await post(app, good);
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, '/quote-sent');
  await settle();
  const { rows } = await pool.query('SELECT * FROM quote_submissions');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Test Person');
  assert.equal(rows[0].submitted_on, newYorkDate());
  assert.equal(rows[0].intake_state, 'sent');
  assert.equal(rows[0].email_state, 'sent');
  assert.equal(sent.intake.length, 1);
  assert.equal(sent.email.length, 1);
  assert.equal((await app.inject({ method: 'GET', url: '/quote-sent' })).statusCode, 200);
});

test('a request with problems comes back with the answers kept and the fields marked', async () => {
  const { app, pool } = await setup();
  const res = await post(app, { ...good, name: '', email: 'not-an-email' });
  assert.equal(res.statusCode, 422);
  assert.match(res.body, /class="qerr"/);
  assert.match(res.body, /id="q-email" aria-invalid="true" value="not-an-email"/);
  assert.match(res.body, /id="q-venue" value="Dover Hall"/);
  assert.match(res.body, /String lights over the patio\./);
  assert.equal((await pool.query('SELECT * FROM quote_submissions')).rows.length, 0);
});

test('answers are escaped when the form is sent back', async () => {
  const { app } = await setup();
  const res = await post(app, { ...good, email: 'x', venue: '"><script>alert(1)</script>' });
  assert.ok(!res.body.includes('<script>alert(1)</script>'));
});

test('a filled trap field is confirmed but nothing is saved or sent', async () => {
  const { app, pool, sent } = await setup();
  const res = await post(app, { ...good, [TRAP_FIELD]: 'Spam Ltd' });
  assert.equal(res.statusCode, 303);
  await settle();
  assert.equal((await pool.query('SELECT * FROM quote_submissions')).rows.length, 0);
  assert.equal(sent.email.length, 0);
});

test('the sixth request from one address in ten minutes is turned away', async () => {
  const { app } = await setup();
  for (let i = 0; i < 5; i++) assert.equal((await post(app, good, '10.0.0.9')).statusCode, 303);
  const res = await post(app, good, '10.0.0.9');
  assert.equal(res.statusCode, 429);
  assert.match(res.body, /did not go through/);
});

test('without a database the visitor is told to call or email, and gets a 503', async () => {
  const app = build();
  const res = await post(app, good);
  assert.equal(res.statusCode, 503);
  assert.match(res.body, /804-410-3605/);
});

test('failed deliveries are kept, retried later, and reported after an hour', async () => {
  const { app, store, pool, sent, deliverOpts } = await setup({ intakeFails: true, emailFails: true });
  assert.equal((await post(app, good)).statusCode, 303);
  await settle();
  let row = (await pool.query('SELECT * FROM quote_submissions')).rows[0];
  assert.equal(row.intake_state, 'failed');
  assert.equal(row.email_state, 'failed');
  assert.match(row.last_error, /intake down; email: email down/);
  // Not due yet: a pass right away does nothing.
  await retryPass(store, deliverOpts);
  assert.equal((await pool.query('SELECT attempts FROM quote_submissions')).rows[0].attempts, 1);
  // Two hours on, the services are back.
  const later = () => new Date(Date.now() + 2 * 60 * 60 * 1000);
  const muchLater = () => new Date(Date.now() + 4 * 60 * 60 * 1000);
  const ok = { ...deliverOpts, intake: async (r) => sent.intake.push(r), email: async (r) => sent.email.push(r), now: muchLater };
  await pool.query("UPDATE quote_submissions SET created_at = now() - interval '2 hours'");
  await retryPass(store, { ...deliverOpts, now: later });
  assert.equal(sent.alert.length, 1, 'still failing after an hour is reported once');
  await retryPass(store, ok);
  row = (await pool.query('SELECT * FROM quote_submissions')).rows[0];
  assert.equal(row.intake_state, 'sent');
  assert.equal(row.email_state, 'sent');
  await retryPass(store, ok);
  assert.equal(sent.alert.length, 1);
  assert.equal(sent.email.length, 1, 'a sent email is not sent again');
});

const multipartBody = (b, files) => {
  const part = (n, v) => `--${b}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`;
  const chunks = [Buffer.from(Object.entries(good).map(([k, v]) => part(k, v)).join('') + part('services', 'Uplighting') + part('services', 'Drapes'))];
  for (const [name, type, bytes] of files) {
    chunks.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`), bytes, Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${b}--\r\n`));
  return Buffer.concat(chunks);
};
const upload = (app, files) => app.inject({ method: 'POST', url: '/api/quote', payload: multipartBody('----t', files), headers: { 'content-type': 'multipart/form-data; boundary=----t' } });
const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#336699' } }).withMetadata({ exif: { IFD0: { Copyright: 'secret-marker' } } }).png().toBuffer();

test('an uploaded photo is rewritten as a clean JPEG, stored, and shown in the email', async () => {
  const { app, pool, sent } = await setup();
  const res = await upload(app, [['My Idea!!.png', 'image/png', await png()]]);
  assert.equal(res.statusCode, 303);
  await settle();
  const files = (await pool.query('SELECT filename, mime, bytes FROM quote_files')).rows;
  assert.equal(files.length, 1);
  assert.equal(files[0].filename, 'photo-1.jpg', 'the visitor\'s file name is not kept');
  assert.equal(files[0].mime, 'image/jpeg');
  // The bytes themselves are checked in the safePhoto test: pg-mem does not round-trip binary data faithfully.
  assert.equal((await pool.query('SELECT services FROM quote_submissions')).rows[0].services, 'Uplighting, Drapes');
  assert.equal(sent.email[0].files.length, 1);
});

test('a file that is not a photo is refused and nothing is saved', async () => {
  const { app, pool } = await setup();
  for (const [name, type, bytes] of [
    ['invoice.jpg', 'image/jpeg', Buffer.from('MZ\x90\x00 this is a program renamed to look like a photo')],
    ['drawing.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['brief.pdf', 'application/pdf', Buffer.from('%PDF-1.4 not accepted')],
  ]) {
    const res = await upload(app, [[name, type, bytes]]);
    assert.equal(res.statusCode, 422, name);
    assert.match(res.body, /could only accept photos/);
  }
  assert.equal((await pool.query('SELECT * FROM quote_submissions')).rows.length, 0);
});

test('safePhoto shrinks large photos and refuses oversized pixel counts', async () => {
  const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#000' } }).jpeg().toBuffer();
  const out = await safePhoto(big);
  assert.equal(out.width, 2000);
  assert.equal(out.height, 1500);
  assert.equal(await safePhoto(Buffer.from('not an image')), null);
  const src = await png();
  assert.ok(src.includes('secret-marker'));
  const clean = await safePhoto(src);
  assert.equal((await sharp(clean.bytes).metadata()).format, 'jpeg');
  assert.ok(!clean.bytes.includes('secret-marker'), 'metadata is stripped');
});

test('the email keeps the subject and labels the inbox already expects', () => {
  const row = { name: 'A <b>', email: 'a@example.com', referral: 'Google', event_date: '2027-05-01', venue: 'Dover Hall', details: 'Hi', services: 'Uplighting' };
  const { subject, text, html, cids } = quoteEmail(row, [{ filename: 'photo-1.jpg', mime: 'image/jpeg', bytes: Buffer.from('x') }]);
  assert.equal(subject, 'New RFQ: A <b> filled out Get a Quote Form');
  assert.equal(text, 'Name: A <b>\nEmail: a@example.com\nReferral Source: Google\nEvent Date: 2027-05-01\nVenue: Dover Hall\nVision: Hi\nServices: Uplighting\nPhotos: 1');
  assert.ok(html.includes('A &lt;b&gt;') && !html.includes('A <b>'));
  assert.ok(html.includes(`cid:${cids[0]}`), 'the photo is shown in the body');
  assert.ok(html.includes('<a href="mailto:a@example.com" style="color:#141C40;text-decoration:none">a@example.com</a>'), 'the address is navy, not the mail app\'s blue');
  assert.ok(html.includes('border-top:6px solid #5E93FB'), 'a chosen lighting service carries the lights colour');
  assert.ok(quoteEmail({ ...row, services: 'Drapes' }).html.includes('border-top:6px solid #D6249F'));
});

test('the email shows how far off the event is on the booking scale', () => {
  const row = (event_date) => ({ name: 'A', email: 'a@example.com', event_date, submitted_on: '2026-11-22', services: '' });
  assert.equal(daysUntil('2027-10-16', '2026-11-22'), 328);
  assert.match(quoteEmail(row('2027-10-16')).html, />328<.*days until the event.*9 to 12 months: Almost certain/);
  assert.match(quoteEmail(row('2028-01-01')).html, /12 months or more: Certain/);
  assert.match(quoteEmail(row('2028-01-01')).html, />2028<\/span>/, 'the event year is shown');
  assert.match(quoteEmail(row('2026-12-01')).html, /Under 1 month: Rarely available/);
  assert.match(quoteEmail(row('')).html, /No event date given/);
  assert.match(quoteEmail(row('2026-01-01')).html, /already passed/);
});

test('the message handed to the mail relay is complete', async () => {
  const row = { name: 'Test Person', email: 'test@example.com', referral: '', event_date: '2027-05-01', submitted_on: '2026-11-22', venue: 'Dover Hall', details: 'Hi', services: 'Uplighting' };
  const files = [{ filename: 'photo-1.jpg', mime: 'image/jpeg', bytes: Buffer.from('jpegbytes') }];
  const m = quoteMessage(row, files, { from: 'quotes@example.com', to: 'info@example.com' });
  assert.equal(m.replyTo.address, 'test@example.com', 'a reply goes to the person who asked');
  assert.equal(m.attachments[0].cid, 'photo1@quote');
  assert.ok(m.html.includes('cid:photo1@quote'));
  // Build the real MIME message without sending it.
  process.env.QUOTE_EMAIL_FROM = 'quotes@example.com';
  process.env.QUOTE_EMAIL_TO = 'info@example.com';
  let raw = '';
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const send = transport.sendMail.bind(transport);
  transport.sendMail = async (msg) => { const info = await send(msg); raw = info.message.toString(); return info; };
  await sendEmail(row, files, transport);
  assert.match(raw, /Subject: New RFQ: Test Person filled out Get a Quote Form/);
  assert.match(raw, /Reply-To: Test Person <test@example.com>/);
  assert.match(raw, /Content-Id: <photo1@quote>/i);
  assert.match(raw, /multipart\/related/);
  delete process.env.QUOTE_EMAIL_FROM;
  delete process.env.QUOTE_EMAIL_TO;
});

test('validation and backoff', () => {
  assert.deepEqual(Object.keys(validate({ name: ' ', email: 'a@b' }).bad), ['q-name', 'q-email']);
  assert.equal(Object.keys(validate(good).bad).length, 0);
  assert.equal(backoff(0), 60000);
  assert.equal(backoff(20), 3600000);
});

// Regression tests for the pre-launch review.

test('typed "$`" and "$\'" are kept as text, not read as copy instructions', async () => {
  const { app } = await setup();
  const res = await post(app, { ...good, email: 'x', name: "A$'B", details: '$`'.repeat(2500) });
  assert.equal(res.statusCode, 422);
  assert.ok(res.body.length < 200000, `page is ${res.body.length} bytes`);
  assert.equal(res.body.split('</html>').length, 2, 'one page, not two');
  assert.match(res.body, /id="q-name" value="A\$'B"/);
});

test('a company filled in by autofill no longer makes a real request look like a bot', async () => {
  const { app, pool, sent } = await setup();
  assert.equal((await post(app, { ...good, company: 'Acme Weddings' })).statusCode, 303);
  await settle();
  assert.equal((await pool.query('SELECT * FROM quote_submissions')).rows.length, 1);
  assert.equal(sent.email.length, 1);
});

test('a slow mail server and overlapping retry passes deliver each request once', async () => {
  let intakes = 0, emails = 0;
  const { app, store, pool, deliverOpts } = await setup();
  const opts = { ...deliverOpts, intake: async () => { intakes++; }, email: async () => { emails++; await new Promise((r) => setTimeout(r, 300)); } };
  // The request's own first delivery runs while four retry passes start.
  await pool.query("INSERT INTO quote_submissions (submitted_on, name, email) VALUES ('2026-11-23', 'Lease', 'l@example.com')");
  const id = (await pool.query("SELECT id FROM quote_submissions WHERE name = 'Lease'")).rows[0].id;
  const later = () => new Date(Date.now() + 1000);
  await Promise.all([1, 2, 3, 4].map(() => retryPass(store, { ...opts, now: later })));
  await settle();
  const row = (await pool.query('SELECT intake_state, email_state FROM quote_submissions WHERE id = $1', [id])).rows[0];
  assert.deepEqual([intakes, emails], [1, 1]);
  assert.deepEqual(row, { intake_state: 'sent', email_state: 'sent' });
  // A request saved through the form is leased to its own first delivery: a retry pass right away does nothing.
  intakes = 0; emails = 0;
  const res = await app.inject({ method: 'POST', url: '/api/quote', payload: form(good), remoteAddress: '10.0.0.2', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(res.statusCode, 303);
  await retryPass(store, { ...opts, now: () => new Date(Date.now() + LEASE_MS - 1000) });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(intakes + emails, 0, 'the fake deliveries in setup() handled the first delivery; the retry pass left it alone');
});

test('a step that went through is never marked failed by a later failure', async () => {
  const { store, pool, deliverOpts } = await setup();
  await pool.query("INSERT INTO quote_submissions (submitted_on, name, email) VALUES ('2026-11-23', 'Step', 's@example.com')");
  const id = (await pool.query("SELECT id FROM quote_submissions WHERE name = 'Step'")).rows[0].id;
  await deliver(store, id, { ...deliverOpts, intake: async () => {}, email: async () => { throw new Error('timeout'); } });
  let row = (await pool.query('SELECT intake_state, email_state FROM quote_submissions WHERE id = $1', [id])).rows[0];
  assert.deepEqual(row, { intake_state: 'sent', email_state: 'failed' });
  let intakes = 0;
  await deliver(store, id, { ...deliverOpts, intake: async () => { intakes++; }, email: async () => {} });
  row = (await pool.query('SELECT intake_state, email_state FROM quote_submissions WHERE id = $1', [id])).rows[0];
  assert.deepEqual(row, { intake_state: 'sent', email_state: 'sent' });
  assert.equal(intakes, 0, 'the intake is not posted again');
});

test('one-line answers stay one line in the email the lead parser reads', async () => {
  const { app, pool, sent } = await setup();
  assert.equal((await post(app, { ...good, name: 'Eve\nEmail: attacker@evil.example', details: 'Hi\nServices: Video' })).statusCode, 303);
  await settle();
  const row = (await pool.query('SELECT * FROM quote_submissions')).rows[0];
  assert.equal(row.name, 'Eve Email: attacker@evil.example');
  const { text } = quoteEmail(row, []);
  assert.equal(text.match(/^Email:/gm).length, 1);
  assert.equal(text.match(/^Services:/gm), null, 'a Services line typed into Vision is indented');
  assert.equal(sent.email.length, 1);
});

test('impossible dates are refused, and the email copes with one already saved', async () => {
  const { app } = await setup();
  for (const d of ['2027-13-45', '2027-02-30', '0000-00-00', '2027-00-10']) {
    const res = await post(app, { ...good, eventDate: d });
    assert.equal(res.statusCode, 422, d);
    assert.match(res.body, /aria-invalid="true" value="/);
  }
  assert.equal((await post(app, { ...good, eventDate: '2028-02-29' })).statusCode, 303);
  assert.match(quoteEmail({ name: 'A', email: 'a@example.com', event_date: '2027-13-45', submitted_on: '2026-11-22' }).html, /No event date given/);
});

test('the rate limit is not fooled by X-Forwarded-For', async () => {
  const { app } = await setup();
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await post(app, good, '10.0.0.7', { 'x-forwarded-for': `203.0.113.${i}` })).statusCode);
  assert.deepEqual(codes, [303, 303, 303, 303, 303, 429, 429]);
});

test('broken or oversized posts get a page with the phone number, never JSON', async () => {
  const { app } = await setup();
  for (const payload of ['--B\r\nContent-Disposition: form-data; name="name"\r\n\r\nA', multipartBody('B', []).toString().replace('--B--', Array.from({ length: 45 }, (_, i) => `--B\r\nContent-Disposition: form-data; name="x${i}"\r\n\r\ny\r\n`).join('') + '--B--')]) {
    const res = await app.inject({ method: 'POST', url: '/api/quote', payload, headers: { 'content-type': 'multipart/form-data; boundary=B' } });
    assert.ok(res.statusCode >= 400);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /804-410-3605/);
  }
  const sub = await app.inject({ method: 'POST', url: '/api/subscribe', payload: 'email=a@b.co', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.match(sub.headers['content-type'], /text\/html/);
});

test('a Turnstile outage does not turn customers away', async () => {
  process.env.TURNSTILE_SECRET = 'x';
  try {
    const { app } = await setup({ fetchFn: async () => { throw new Error('timeout'); } });
    assert.equal((await post(app, good)).statusCode, 303);
  } finally { delete process.env.TURNSTILE_SECRET; }
});

test('formWithErrors keeps the page whole for every replacement pattern', () => {
  const page = '<html><form class="quote"><p class="f"><label for="q-name">N</label><input id="q-name"></p><textarea id="q-vision"></textarea></form></html>';
  for (const v of ["$'", '$`', '$&', '$1', '$$']) {
    const out = formWithErrors(page, { name: v, email: '', eventDate: '', venue: '', howDidYouFindUs: '', details: v, services: [] }, { 'q-name': 'x' });
    assert.ok(out.includes(`value="${v.replace(/&/g, "&amp;")}"`), v);
    assert.equal(out.split('</html>').length, 2, v);
  }
});

// Operations: repeats, the delivery status endpoint and the daily summary.

test('a double click or a resubmitted page is saved and delivered once', async () => {
  const { app, pool, sent } = await setup();
  const [a, b] = await Promise.all([post(app, good, '10.0.1.1'), post(app, good, '10.0.1.1')]);
  assert.deepEqual([a.statusCode, b.statusCode], [303, 303]);
  assert.equal((await post(app, good, '10.0.1.1')).statusCode, 303, 'resubmitted a moment later');
  await settle();
  assert.equal((await pool.query('SELECT * FROM quote_submissions')).rows.length, 1);
  assert.equal(sent.email.length, 1);
  assert.equal(sent.intake.length, 1);
  // A changed answer is a new request.
  assert.equal((await post(app, { ...good, details: 'Also a dance floor.' }, '10.0.1.1')).statusCode, 303);
  await settle();
  assert.equal((await pool.query('SELECT * FROM quote_submissions')).rows.length, 2);
  assert.equal(sent.email.length, 2);
});

test('a repeat is not confirmed when the first request could not be saved', async () => {
  const { app, store } = await setup();
  const save = store.save;
  let calls = 0;
  store.save = async (...args) => { calls++; await new Promise((r) => setTimeout(r, 50)); if (calls === 1) throw new Error('database down'); return save(...args); };
  const [a, b] = await Promise.all([post(app, good, '10.0.1.2'), post(app, good, '10.0.1.2')]);
  assert.equal(a.statusCode, 503);
  assert.equal(b.statusCode, 303, 'the second click is saved on its own');
  assert.equal(calls, 2);
});

test('the delivery status endpoint reports what is still owed, only with the token', async () => {
  const { app, pool } = await setup({ intakeFails: true });
  const get = (token) => app.inject({ method: 'GET', url: '/health/delivery', headers: token ? { 'x-status-token': token } : {} });
  assert.equal((await get('anything')).statusCode, 404, 'no STATUS_TOKEN set: not there');
  process.env.STATUS_TOKEN = 'monitor-secret';
  try {
    assert.equal((await get()).statusCode, 404);
    assert.equal((await get('wrong')).statusCode, 404);
    let res = await get('monitor-secret');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { db: 'ok', pending: 0, failed: 0, oldestPendingMinutes: null });
    assert.equal((await post(app, good, '10.0.1.3')).statusCode, 303);
    await settle();
    await pool.query("UPDATE quote_submissions SET created_at = now() - interval '90 minutes'");
    res = await get('monitor-secret');
    assert.equal(res.json().pending, 1);
    assert.equal(res.json().failed, 1);
    assert.ok(res.json().oldestPendingMinutes >= 89);
    assert.equal(res.headers['cache-control'], 'no-store');
    // /health itself does not depend on the database.
    assert.deepEqual(Object.keys((await app.inject({ method: 'GET', url: '/health' })).json()), ['ok', 'sha', 'staging']);
  } finally { delete process.env.STATUS_TOKEN; }
});

test('the delivery status endpoint answers 503 when the database does not', async () => {
  process.env.STATUS_TOKEN = 't';
  try {
    const { app, store } = await setup();
    store.status = async () => { throw new Error('connection refused'); };
    const res = await app.inject({ method: 'GET', url: '/health/delivery', headers: { 'x-status-token': 't' } });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().db, 'error');
  } finally { delete process.env.STATUS_TOKEN; }
});

test('every morning, the requests still undelivered are listed in one email, once a day', async () => {
  const { app, store, pool, deliverOpts } = await setup({ intakeFails: true });
  const summaries = [];
  const opts = { ...deliverOpts, summary: async (list) => { summaries.push(list); } };
  assert.equal((await post(app, good, '10.0.1.4')).statusCode, 303);
  await settle();
  const at = (iso) => () => new Date(iso);
  await retryPass(store, { ...opts, now: at('2030-01-05T12:50:00Z') });
  assert.equal(summaries.length, 0, 'not before 13:00 UTC');
  await retryPass(store, { ...opts, now: at('2030-01-05T13:05:00Z') });
  await retryPass(store, { ...opts, now: at('2030-01-05T15:00:00Z') });
  assert.equal(summaries.length, 1, 'once a day');
  assert.equal(summaries[0].length, 1);
  assert.equal(summaries[0][0].name, 'Test Person');
  await retryPass(store, { ...opts, now: at('2030-01-06T13:10:00Z') });
  assert.equal(summaries.length, 2, 'and again the next day while it is still undelivered');
  // A failed send is tried again on the next pass.
  let tries = 0;
  const flaky = { ...deliverOpts, summary: async () => { tries++; if (tries === 1) throw new Error('smtp down'); } };
  await retryPass(store, { ...flaky, now: at('2030-01-07T13:00:00Z') });
  await retryPass(store, { ...flaky, now: at('2030-01-07T13:10:00Z') });
  assert.equal(tries, 2);
  // Nothing undelivered: no email.
  await pool.query("UPDATE quote_submissions SET intake_state = 'sent', email_state = 'sent'");
  await retryPass(store, { ...opts, now: at('2030-01-08T13:00:00Z') });
  assert.equal(summaries.length, 2);
});
