// Cloudflare Turnstile on the quote form. Never calls Cloudflare: fetchFn is a fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { registerQuote, turnstileRule } from '../server/quote.js';

const DIST = new URL('../dist/', import.meta.url).pathname;
const good = { name: 'Test Person', email: 'test@example.com', eventDate: '2027-05-01', venue: 'Dover Hall', details: 'Lights' };

// A copy of the built quote page with or without the widget, as a build with a site key makes it.
function distWith(widget) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wlc-ts-'));
  let quote = fs.readFileSync(path.join(DIST, 'get-a-quote.html'), 'utf8');
  if (widget && !quote.includes('class="cf-turnstile"')) {
    quote = quote.replace('<div class="q3f">', '<div class="q3f"><div class="cf-turnstile" data-sitekey="1x00000000000000000000AA" data-theme="light"></div>');
  }
  if (!widget) quote = quote.replace(/<div class="cf-turnstile"[^>]*><\/div>/, '');
  fs.writeFileSync(path.join(dir, 'get-a-quote.html'), quote);
  fs.copyFileSync(path.join(DIST, 'quote-problem.html'), path.join(dir, 'quote-problem.html'));
  return dir;
}

let n = 0;
async function app({ widget, env, verify }) {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const calls = [];
  const fetchFn = async (url, opts) => { calls.push(opts.body.get('response')); return verify(opts.body.get('response')); };
  const store = { save: async () => 1, load: async () => null, due: async () => [], stuck: async () => [] };
  const a = Fastify();
  registerQuote(a, { dist: distWith(widget), store, fetchFn, deliverOpts: { intake: async () => {}, email: async () => {} } });
  await a.ready();
  const post = (extra = {}) => a.inject({
    method: 'POST', url: '/api/quote', remoteAddress: `10.9.0.${++n}`,
    payload: new URLSearchParams({ ...good, details: `Lights ${n}`, ...extra }).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  return { post, calls, done: async () => { await a.close(); process.env = saved; } };
}
const pass = async (t) => ({ json: async () => ({ success: t === 'good-token' }) });

test('the Turnstile rule cannot lock everyone out by a setting', () => {
  assert.equal(turnstileRule({ secret: '', required: true, pageHasWidget: true }), 'off');
  assert.equal(turnstileRule({ secret: 's', required: false, pageHasWidget: true }), 'verify-if-sent');
  assert.equal(turnstileRule({ secret: 's', required: true, pageHasWidget: false }), 'verify-if-sent', 'required without a widget is ignored');
  assert.equal(turnstileRule({ secret: 's', required: true, pageHasWidget: true }), 'required');
});

test('Turnstile: secret set and required, page without the widget, no answer: accepted', async () => {
  const t = await app({ widget: false, env: { TURNSTILE_SECRET: 's', TURNSTILE_REQUIRED: '1' }, verify: pass });
  assert.equal((await t.post()).statusCode, 303);
  assert.equal(t.calls.length, 0);
  await t.done();
});

test('Turnstile: required and widget built, no answer: refused, answers kept, widget shown again', async () => {
  const t = await app({ widget: true, env: { TURNSTILE_SECRET: 's', TURNSTILE_REQUIRED: '1' }, verify: pass });
  const res = await t.post();
  assert.equal(res.statusCode, 422);
  assert.match(res.body, /could not confirm you are a person/);
  assert.match(res.body, /id="q-venue" value="Dover Hall"/);
  assert.match(res.body, /class="cf-turnstile"/);
  await t.done();
});

test('Turnstile: widget built but not required, no answer: accepted', async () => {
  const t = await app({ widget: true, env: { TURNSTILE_SECRET: 's', TURNSTILE_REQUIRED: undefined }, verify: pass });
  assert.equal((await t.post()).statusCode, 303);
  assert.equal(t.calls.length, 0);
  await t.done();
});

test('Turnstile: a wrong answer is refused, a right one accepted, an outage accepted', async () => {
  const t = await app({ widget: true, env: { TURNSTILE_SECRET: 's', TURNSTILE_REQUIRED: '1' }, verify: pass });
  assert.equal((await t.post({ 'cf-turnstile-response': 'bad-token' })).statusCode, 422);
  assert.equal((await t.post({ 'cf-turnstile-response': 'good-token' })).statusCode, 303);
  assert.deepEqual(t.calls, ['bad-token', 'good-token']);
  await t.done();
  const down = await app({ widget: true, env: { TURNSTILE_SECRET: 's', TURNSTILE_REQUIRED: '1' }, verify: async () => { throw new Error('timeout'); } });
  assert.equal((await down.post({ 'cf-turnstile-response': 'any' })).statusCode, 303);
  await down.done();
});

test('Turnstile: no secret, nothing is checked', async () => {
  const t = await app({ widget: true, env: { TURNSTILE_SECRET: undefined, TURNSTILE_REQUIRED: '1' }, verify: pass });
  assert.equal((await t.post({ 'cf-turnstile-response': 'bad-token' })).statusCode, 303);
  assert.equal(t.calls.length, 0);
  await t.done();
});
