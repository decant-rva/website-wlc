// node --test test/glow/probe.test.js   (a fake hub on 127.0.0.1; no real models)
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '../../tools/glow/client.js';
import { probe, insideRepo, ENGINES } from '../../tools/glow/probe.js';
import { fakeHub } from './fake-hub.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('engines.json names a machine and model for every role the suite uses', () => {
  for (const role of ['vision', 'write', 'review', 'code', 'label', 'embed']) {
    const e = ENGINES.roles[role];
    assert.ok(e, role);
    assert.ok(['mac', 'mac36', 'studio', 'rtx'].includes(e.machine), role);
    assert.ok(e.model, role);
    if (e.budget) assert.ok(e.retryBudget > e.budget, `${role}: a retry never gets a smaller budget`);
  }
  assert.equal(ENGINES.roles.vision.format, 'prompt', 'a schema skews photo answers');
  assert.equal(ENGINES.roles.review.format, 'prompt', 'think "high" with a schema returns nothing');
  assert.equal(ENGINES.hub, 'http://127.0.0.1:8790', 'the hub on this PC only');
  assert.doesNotMatch(JSON.stringify({ ...ENGINES, hub: null }), /\d+\.\d+\.\d+\.\d+|[A-Za-z]:\\\\/, 'no machine addresses or folder paths in the public repository');
});

test('the work folder must be outside the repository', () => {
  assert.equal(insideRepo(REPO, REPO), true);
  assert.equal(insideRepo(path.join(REPO, 'tmp', 'probe'), REPO), true);
  assert.equal(insideRepo(path.join(REPO, '..', 'glow-work'), REPO), false);
});

test('probe reads only: status routes, tags, ps, show; no model call and no reservation', async () => {
  const h = await fakeHub({
    ps: { mac: [{ name: 'gpt-oss:20b', context_length: 131072, size: 13e9 }] },
  });
  try {
    const cap = await probe({ client: createClient({ hub: h.hub, engines: ENGINES }), engines: ENGINES });
    assert.equal(cap.health.ok, true);
    assert.equal(cap.bright.mode, 'off');
    assert.equal(cap.machines.mac.ok, true);
    assert.equal(cap.roles.label.loaded, true);
    assert.equal(cap.roles.label.contextLength, 131072);
    assert.equal(cap.roles.write.installed, true, 'mistral-medium-3.5:latest matches');
    assert.equal(cap.roles.write.loaded, false);
    assert.equal(cap.roles.label.fallback.installed, true);
    assert.equal(h.chatCalls().length, 0);
    assert.ok(h.calls.every((c) => c.method === 'GET' || /\/api\/show$/.test(c.path)), 'only reads');
  } finally { await h.close(); }
});

test('probe --try: reserves Beam, calls only loaded models, and releases', async () => {
  const h = await fakeHub({
    ps: { mac: [{ name: 'gpt-oss:20b', context_length: 131072, size: 13e9 }, { name: 'nomic-embed-text:latest', context_length: 2048, size: 3e8 }] },
    reply: () => '{"answer": "ok"}',
  });
  try {
    const cap = await probe({ client: createClient({ hub: h.hub, engines: ENGINES }), engines: ENGINES, tryModels: true });
    assert.equal(cap.reservation.ok, true);
    assert.equal(cap.released, true);
    const paths = h.calls.map((c) => c.path);
    assert.ok(paths.indexOf('/api/referee/reserve') < paths.indexOf('/ollama/mac/api/chat'));
    assert.equal(paths.at(-1), '/api/referee/release');
    assert.deepEqual(h.chatCalls().map((c) => c.body.model), ['gpt-oss:20b']);
    assert.equal(h.chatCalls()[0].body.options.num_ctx, 131072, 'the loaded size, so nothing reloads');
    assert.equal(cap.roles.label.try.ok, true);
    assert.equal(cap.roles.embed.try.dimensions, 2);
    assert.match(cap.roles.write.try.skipped, /not loaded/);
  } finally { await h.close(); }
});

test('probe --try releases Beam even when a model call blows up', async () => {
  const h = await fakeHub({ ps: { mac: [{ name: 'gpt-oss:20b', context_length: 8192 }] }, reply: () => ({ status: 500, error: 'boom' }) });
  try {
    const cap = await probe({ client: createClient({ hub: h.hub, engines: ENGINES }), engines: ENGINES, tryModels: true });
    assert.equal(cap.roles.label.try.ok, false);
    assert.equal(h.calls.at(-1).path, '/api/referee/release');
  } finally { await h.close(); }
});

test('probe --try does nothing to Beam in Bright mode', async () => {
  const h = await fakeHub({ bright: { mode: 'on' }, ps: { mac: [{ name: 'gpt-oss:20b', context_length: 8192 }] } });
  try {
    const cap = await probe({ client: createClient({ hub: h.hub, engines: ENGINES }), engines: ENGINES, tryModels: true });
    assert.match(cap.tried.skipped, /Bright/);
    assert.equal(h.chatCalls().length, 0);
    assert.ok(!h.calls.some((c) => c.path.startsWith('/api/referee/')));
  } finally { await h.close(); }
});

test('probe with the hub down says so and stops', async () => {
  const cap = await probe({ client: createClient({ hub: 'http://127.0.0.1:9', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } }), engines: ENGINES });
  assert.equal(cap.health.ok, false);
  assert.deepEqual(cap.machines, {});
});
