// Proves the quote storage works against the real database named in DATABASE_URL:
// applies the migrations, saves a request with a photo, reads it back, records a
// delivery, then removes what it wrote.
//
//   npm run check:db            connect the way the server does (Postgres protocol, `pg`)
//   npm run check:db -- --http  connect over HTTPS with Neon's serverless driver, for
//                               places that only allow web traffic (some CI and sandboxes)
import fs from 'node:fs';
import path from 'node:path';
import { quoteStore } from '../server/lib/store.js';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set. Run `neon env pull` or set it.'); process.exit(1); }
const http = process.argv.includes('--http');
const MIGRATIONS = path.resolve(import.meta.dirname, '..', 'migrations');

let db;
let close = async () => {};
if (http) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  // The HTTP driver returns rows directly and takes one statement per call.
  db = { query: async (text, params = []) => ({ rows: await sql.query(text, params) }) };
} else {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || url });
  await client.connect();
  db = client;
  close = () => client.end();
}

const step = (name, detail = '') => console.log(`ok  ${name}${detail ? `: ${detail}` : ''}`);
try {
  const v = await db.query('select version() as v, current_database() as d');
  step('connected', `${v.rows[0].v.split(' ').slice(0, 2).join(' ')}, database ${v.rows[0].d}, over ${http ? 'HTTPS' : 'the Postgres protocol'}`);

  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const text = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    const statements = text.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(/;\s*(?:\n|$)/).map((x) => x.trim()).filter(Boolean);
    for (const s of statements) await db.query(s);
    step('migration applied', `${file} (${statements.length} statements)`);
  }

  const store = quoteStore(db);
  const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 0xff, 0xd9]);
  const id = await store.save({
    submittedAt: '2026-11-23', name: 'Database check', email: 'check@example.com', eventDate: '2027-10-16',
    howDidYouFindUs: 'db-check', venue: 'Dover Hall', details: 'Written by tools/db-check.js', services: ['Uplighting', 'Drapes'], ip: '127.0.0.1',
  }, [{ filename: 'photo-1.jpg', mime: 'image/jpeg', bytes: photo }]);
  step('request saved', `id ${id}`);

  const found = await store.load(id);
  const back = Buffer.from(found.files[0].bytes);
  if (found.row.name !== 'Database check' || found.row.services !== 'Uplighting, Drapes') throw new Error('the row read back does not match what was saved');
  if (!back.equals(photo)) throw new Error('the photo bytes read back do not match what was saved');
  step('request and photo read back intact', `${back.length} bytes, states ${found.row.intake_state}/${found.row.email_state}`);

  const due = await store.due(new Date(Date.now() + 1000));
  if (!due.map(String).includes(String(id))) throw new Error('the new request is not listed as awaiting delivery');
  step('listed as awaiting delivery');

  await store.record(id, { intake: 'sent', email: 'sent', error: '', nextTryAt: new Date() });
  const after = await store.load(id);
  if (after.row.intake_state !== 'sent' || after.row.email_state !== 'sent' || after.row.attempts !== 1) throw new Error('the delivery record was not stored');
  step('delivery recorded', `attempts ${after.row.attempts}`);

  await db.query('DELETE FROM quote_submissions WHERE id = $1', [id]);
  const left = await db.query('SELECT count(*)::int AS n FROM quote_files WHERE submission_id = $1', [id]);
  if (left.rows[0].n !== 0) throw new Error('the photo was not removed with its request');
  step('test request removed, photo removed with it');
  // The same thing through the website itself: post the quote form to the running app
  // and find the request in the database. The lead intake and the email are stand-ins here,
  // so nothing is sent to GigFriend or to the inbox.
  const { build } = await import('../server/server.js');
  const sent = { intake: 0, email: 0 };
  const app = build({ quote: { store, deliverOpts: { intake: async () => { sent.intake += 1; }, email: async () => { sent.email += 1; } } } });
  const res = await app.inject({
    method: 'POST', url: '/api/quote', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ name: 'Route check', email: 'route@example.com', eventDate: '2027-10-16', venue: 'Dover Hall', details: 'Posted by tools/db-check.js', services: 'Uplighting' }).toString(),
  });
  if (res.statusCode !== 303 || res.headers.location !== '/quote-sent') throw new Error(`the form post answered ${res.statusCode}`);
  step('form posted to the app', `answered ${res.statusCode} to ${res.headers.location}`);
  let row;
  for (let i = 0; i < 40 && !(row && row.email_state === 'sent'); i++) {
    await new Promise((r) => setTimeout(r, 250));
    row = (await db.query("SELECT * FROM quote_submissions WHERE email = 'route@example.com' ORDER BY id DESC LIMIT 1")).rows[0];
  }
  if (!row) throw new Error('the posted request is not in the database');
  if (row.intake_state !== 'sent' || row.email_state !== 'sent') throw new Error(`deliveries were not recorded: ${row.intake_state}/${row.email_state}`);
  step('posted request found in the database', `id ${row.id}, ${row.name}, ${row.venue}, deliveries ${row.intake_state}/${row.email_state} (stand-ins called ${sent.intake}/${sent.email})`);
  await db.query('DELETE FROM quote_submissions WHERE id = $1', [row.id]);
  await app.close();
  step('posted request removed');
  console.log('\nDatabase check passed.');
} catch (e) {
  console.error(`\nFAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await close();
}
