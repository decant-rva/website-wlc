// Run after `npm run build`:  node --test
// The database is an in-memory Postgres (pg-mem); the lead intake and the email are fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { build } from '../server/server.js';
import { migrate, quoteStore } from '../server/lib/store.js';
import { deliver, retryPass, backoff } from '../server/lib/deliver.js';
import { quoteEmail } from '../server/lib/quote-email.js';
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

test('an uploaded photo is stored and passed to the email', async () => {
  const { app, pool, sent } = await setup();
  const b = '----t';
  const part = (n, v) => `--${b}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`;
  const payload = Buffer.concat([
    Buffer.from(Object.entries(good).map(([k, v]) => part(k, v)).join('') + part('services', 'Uplighting') + part('services', 'Drapes')
      + `--${b}\r\nContent-Disposition: form-data; name="files"; filename="idea.png"\r\nContent-Type: image/png\r\n\r\n`),
    Buffer.from([137, 80, 78, 71, 1, 2, 3]), Buffer.from(`\r\n--${b}--\r\n`),
  ]);
  const res = await app.inject({ method: 'POST', url: '/api/quote', payload, headers: { 'content-type': `multipart/form-data; boundary=${b}` } });
  assert.equal(res.statusCode, 303);
  await settle();
  const files = (await pool.query('SELECT filename, mime FROM quote_files')).rows;
  assert.deepEqual(files, [{ filename: 'idea.png', mime: 'image/png' }]);
  assert.equal((await pool.query('SELECT services FROM quote_submissions')).rows[0].services, 'Uplighting, Drapes');
  assert.equal(sent.email[0].files.length, 1);
});

test('the email keeps the subject and labels the inbox already expects', () => {
  const { subject, text, html } = quoteEmail({ name: 'A <b>', email: 'a@example.com', referral: 'Google', event_date: '2027-05-01', venue: 'Dover Hall', details: 'Hi', services: '' });
  assert.equal(subject, 'New RFQ: A <b> filled out Get a Quote Form');
  assert.equal(text, 'Name: A <b>\nEmail: a@example.com\nReferral Source: Google\nEvent Date: 2027-05-01\nVenue: Dover Hall\nVision: Hi');
  assert.ok(html.includes('A &lt;b&gt;'));
});

test('validation and backoff', () => {
  assert.deepEqual(Object.keys(validate({ name: ' ', email: 'a@b' }).bad), ['q-name', 'q-email']);
  assert.equal(Object.keys(validate(good).bad).length, 0);
  assert.equal(backoff(0), 60000);
  assert.equal(backoff(20), 3600000);
});
