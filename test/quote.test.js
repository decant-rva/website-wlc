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
import { quoteEmail, daysUntil } from '../server/lib/quote-email.js';
import { validate, newYorkDate } from '../server/quote.js';

async function setup({ intakeFails = false, emailFails = false } = {}) {
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
  const app = build({ quote: { store, deliverOpts } });
  return { app, store, pool, sent, deliverOpts };
}
const form = (o) => new URLSearchParams(o).toString();
const post = (app, body, ip = '10.0.0.1') => app.inject({
  method: 'POST', url: '/api/quote', payload: form(body), remoteAddress: ip,
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
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
  const res = await post(app, { ...good, company: 'Spam Ltd' });
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
