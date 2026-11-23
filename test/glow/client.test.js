// node --test test/glow/client.test.js   (no network beyond a fake hub on 127.0.0.1)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient, cleanText, parseJson, splitLimits, checkLimits, engineFor, HUB, MACHINES } from '../../tools/glow/client.js';
import { fakeHub } from './fake-hub.js';

const ENGINES = {
  roles: {
    write: { machine: 'mac', model: 'mistral-medium-3.5:latest', think: false, budget: 6000, timeout: 300 },
    label: { machine: 'mac', model: 'gpt-oss:20b', think: 'low', budget: 6000, timeout: 120 },
  },
};

async function withHub(init, fn) {
  const h = await fakeHub(init);
  try { await fn(h, createClient({ hub: h.hub, project: 'Website WLC', requester: 'claude' })); } finally { await h.close(); }
}

test('defaults: the hub on this PC and its four machines', () => {
  assert.equal(HUB, 'http://127.0.0.1:8790');
  assert.deepEqual([...MACHINES].sort(), ['mac', 'mac36', 'rtx', 'studio']);
});

test('cleanText strips end tokens and normalises non-breaking hyphens and spaces', () => {
  assert.equal(cleanText('Poly‑silk drape, 10 ft‐wide<|eot|>'), 'Poly-silk drape, 10 ft-wide');
  assert.equal(cleanText('  a<|eot_id|><|endoftext|><|im_end|><|end|>  '), 'a');
  assert.equal(cleanText(null), '');
  assert.equal(cleanText(undefined), '');
});

test('parseJson reads the first object through fences, preamble and end tokens', () => {
  assert.deepEqual(parseJson('```json\n{"alt": "x"}\n```<|eot|>'), { alt: 'x' });
  assert.deepEqual(parseJson('Sure! {"a": {"b": 1}} thanks'), { a: { b: 1 } });
  assert.deepEqual(parseJson('{"t": "non‑breaking"}'), { t: 'non-breaking' });
  assert.equal(parseJson(''), null);
  assert.equal(parseJson('no json'), null);
  assert.equal(parseJson('{broken'), null);
});

test('splitLimits removes length limits from a schema and lists them; checkLimits applies them', () => {
  const schema = {
    type: 'object',
    properties: {
      alt: { type: 'string', maxLength: 125, minLength: 10 },
      tags: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 20 } },
      ok: { type: 'boolean' },
    },
    required: ['alt'],
  };
  const { schema: s, limits } = splitLimits(schema);
  assert.equal(schema.properties.alt.maxLength, 125, 'the input schema is not changed');
  assert.deepEqual(s, {
    type: 'object',
    properties: { alt: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, ok: { type: 'boolean' } },
    required: ['alt'],
  });
  assert.deepEqual(limits, [
    { path: 'alt', key: 'maxLength', value: 125 },
    { path: 'alt', key: 'minLength', value: 10 },
    { path: 'tags', key: 'maxItems', value: 3 },
    { path: 'tags[]', key: 'maxLength', value: 20 },
  ]);
  assert.deepEqual(checkLimits({ alt: 'Amber uplighting on drapes', tags: ['a'] }, limits), []);
  assert.deepEqual(checkLimits({ alt: 'x'.repeat(130), tags: ['a', 'b', 'c', 'd'] }, limits), [
    'alt: 130 characters, over 125',
    'tags: 4 items, over 3',
  ]);
  assert.deepEqual(checkLimits({ alt: 'short', tags: ['y'.repeat(21)] }, limits), [
    'alt: 5 characters, under 10',
    'tags[0]: 21 characters, over 20',
  ]);
  assert.deepEqual(checkLimits({}, limits), [], 'missing fields are the schema\'s business, not a length problem');
});

test('engineFor gives a role\'s machine and model, and refuses an unknown role', () => {
  assert.deepEqual(engineFor('label', ENGINES), ENGINES.roles.label);
  assert.throws(() => engineFor('nope', ENGINES), /unknown role "nope"/);
});

test('every request carries the X-LLM headers; control calls also carry x-glow', async () => {
  await withHub({}, async (h, c) => {
    await c.health();
    await c.reserve('mac', 5);
    await c.chat({ machine: 'mac', model: 'gpt-oss:20b', messages: [{ role: 'user', content: 'hi' }], task: 'label: test', numCtx: false });
    for (const call of h.calls) {
      assert.equal(call.headers['x-llm-requester'], 'claude', call.path);
      assert.equal(call.headers['x-llm-project'], 'Website WLC', call.path);
    }
    assert.equal(h.calls.find((x) => x.path === '/api/referee/reserve').headers['x-glow'], '1');
    assert.deepEqual(h.calls.find((x) => x.path === '/api/referee/reserve').body, { node: 'mac', project: 'Website WLC', minutes: 5, exclusive: false });
    assert.equal(h.chatCalls()[0].headers['x-llm-task'], 'label: test');
  });
});

test('only the routes the suite needs: no pull, delete, copy, create or unknown machines', async () => {
  await withHub({}, async (h, c) => {
    for (const p of ['/ollama/mac/api/pull', '/ollama/mac/api/delete', '/ollama/mac/api/copy', '/ollama/mac/api/create', '/ollama/mac/api/push', '/ollama/mac/v1/chat/completions', '/api/bright/start', '/api/bright/stop', '/api/referee/drain', '/ollama/nope/api/chat']) {
      await assert.rejects(c.request('POST', p, {}), /route not allowed/, p);
      await assert.rejects(c.request('GET', p), /route not allowed/, p);
    }
    assert.equal(h.calls.length, 0, 'nothing refused reached the hub');
    await assert.rejects(c.chat({ machine: 'nope', model: 'x', messages: [] }), /route not allowed/);
    await c.request('GET', '/ollama/mac36/api/tags');
    assert.equal(h.calls.length, 1);
  });
});

test('chat sends Ollama\'s format with the loaded model\'s context size', async () => {
  await withHub({ reply: () => 'Bistro lights over a tent at dusk<|eot|>' }, async (h, c) => {
    const r = await c.chat({ machine: 'mac', model: 'gpt-oss:120b', messages: [{ role: 'user', content: 'x' }], task: 't' });
    assert.equal(r.ok, true);
    assert.equal(r.text, 'Bistro lights over a tent at dusk');
    assert.equal(r.model, 'gpt-oss:120b');
    assert.equal(r.machine, 'mac');
    assert.equal(r.attempts, 1);
    assert.deepEqual(r.tokens, { prompt: 11, output: 7 });
    assert.equal(typeof r.ms, 'number');
    assert.match(r.at, /^\d{4}-\d\d-\d\dT/);
    const [call] = h.chatCalls();
    assert.equal(call.path, '/ollama/mac/api/chat');
    assert.equal(call.body.stream, false);
    assert.equal(call.body.options.num_ctx, 131072);
    assert.equal(call.body.options.num_predict, 6000);
    assert.equal(call.body.options.temperature, 0.2);
    assert.equal('think' in call.body, false);
    assert.equal('format' in call.body, false);
  });
});

test('chat leaves num_ctx out when the model is not loaded, or when told not to look', async () => {
  await withHub({}, async (h, c) => {
    await c.chat({ machine: 'mac', model: 'gpt-oss:20b', messages: [] });
    assert.equal('num_ctx' in h.chatCalls()[0].body.options, false);
    const before = h.calls.length;
    await c.chat({ machine: 'mac', model: 'gpt-oss:120b', messages: [], numCtx: false });
    assert.equal(h.calls.length, before + 1, 'numCtx: false makes no /api/ps call');
    assert.equal('num_ctx' in h.chatCalls()[1].body.options, false);
    await c.chat({ machine: 'mac', model: 'gpt-oss:120b', messages: [], numCtx: 16384 });
    assert.equal(h.chatCalls()[2].body.options.num_ctx, 16384);
  });
});

test('loadedContext matches a tag with or without :latest', async () => {
  await withHub({ ps: { mac: [{ name: 'mistral-medium-3.5:latest', context_length: 32768 }] } }, async (h, c) => {
    assert.equal(await c.loadedContext('mac', 'mistral-medium-3.5'), 32768);
    assert.equal(await c.loadedContext('mac', 'mistral-medium-3.5:latest'), 32768);
    assert.equal(await c.loadedContext('mac', 'gpt-oss:20b'), null);
  });
});

test('with a JSON schema: think "low", limits out of the schema and checked on the reply', async () => {
  const schema = { type: 'object', properties: { alt: { type: 'string', maxLength: 20 } }, required: ['alt'] };
  await withHub({ reply: () => '{"alt": "Amber uplighting on ivory drapes"}' }, async (h, c) => {
    const r = await c.chat({ machine: 'mac', model: 'gpt-oss:120b', messages: [], format: schema, think: 'high' });
    const [call] = h.chatCalls();
    assert.equal(call.body.think, 'low');
    assert.deepEqual(call.body.format, { type: 'object', properties: { alt: { type: 'string' } }, required: ['alt'] });
    assert.deepEqual(r.json, { alt: 'Amber uplighting on ivory drapes' });
    assert.deepEqual(r.problems, ['alt: 32 characters, over 20']);
    assert.equal(r.ok, true, 'a length problem is reported, not retried');
  });
});

test('with a schema, think: false stays false (a model that thinks when asked is not switched on)', async () => {
  const schema = { type: 'object', properties: { a: { type: 'string' } } };
  await withHub({ reply: (b, n) => (n === 0 ? '' : '{"a":"x"}') }, async (h, c) => {
    await c.chat({ machine: 'mac', model: 'mistral-medium-3.5', messages: [], format: schema, think: false, numCtx: false });
    assert.deepEqual(h.chatCalls().map((x) => x.body.think), [false, false]);
  });
});

test('a role\'s budget, retry budget and temperature come from the engines unless given', async () => {
  const engines = { roles: { review: { machine: 'mac', model: 'gpt-oss:120b', think: 'high', budget: 16000, retryBudget: 24000, temperature: 0.1 } } };
  await withHub({ reply: (b, n) => (n === 0 ? '' : 'x') }, async (h) => {
    const c = createClient({ hub: h.hub, engines });
    await c.chat({ role: 'review', messages: [], numCtx: false });
    const [a, b] = h.chatCalls().map((x) => x.body);
    assert.deepEqual([a.options.num_predict, b.options.num_predict, a.options.temperature], [16000, 24000, 0.1]);
    assert.deepEqual([a.think, b.think], ['high', 'low']);
  });
});

test('format "json" passes through as is', async () => {
  await withHub({ reply: () => '{"a":1}' }, async (h, c) => {
    const r = await c.chat({ machine: 'mac', model: 'gpt-oss:20b', messages: [], format: 'json', numCtx: false });
    assert.equal(h.chatCalls()[0].body.format, 'json');
    assert.deepEqual(r.json, { a: 1 });
  });
});

test('an empty reply is retried once at 12,000 tokens with think "low"', async () => {
  await withHub({ reply: (b, n) => (n === 0 ? '<|eot|>' : 'done') }, async (h, c) => {
    const r = await c.chat({ machine: 'mac', model: 'gpt-oss:20b', messages: [], think: 'high', numCtx: false });
    assert.equal(r.ok, true);
    assert.equal(r.text, 'done');
    assert.equal(r.attempts, 2);
    const [a, b] = h.chatCalls();
    assert.equal(a.body.options.num_predict, 6000);
    assert.equal(a.body.think, 'high');
    assert.equal(b.body.options.num_predict, 12000);
    assert.equal(b.body.think, 'low');
  });
});

test('retryThink: null keeps the first attempt\'s think; no think stays absent', async () => {
  await withHub({ reply: (b, n) => (n === 0 ? '' : 'done') }, async (h, c) => {
    await c.chat({ machine: 'mac', model: 'mistral-medium-3.5', messages: [], retryThink: null, numCtx: false });
    const [, b] = h.chatCalls();
    assert.equal(b.body.options.num_predict, 12000);
    assert.equal('think' in b.body, false);
  });
});

test('two empty replies: not ok, and no third call', async () => {
  await withHub({ reply: () => '' }, async (h, c) => {
    const r = await c.chat({ machine: 'mac', model: 'gpt-oss:20b', messages: [], numCtx: false });
    assert.equal(r.ok, false);
    assert.equal(r.attempts, 2);
    assert.equal(h.chatCalls().length, 2);
    assert.match(r.error, /empty/);
  });
});

test('an unparseable reply is retried when a parser is given; its result is json', async () => {
  await withHub({ reply: (b, n) => (n === 0 ? 'thinking out loud' : '{"alt":"ok"}') }, async (h, c) => {
    const r = await c.chat({ machine: 'mac', model: 'gpt-oss:20b', messages: [], numCtx: false, parse: parseJson });
    assert.equal(r.attempts, 2);
    assert.deepEqual(r.json, { alt: 'ok' });
    assert.equal(r.text, '{"alt":"ok"}');
  });
});

test('an HTTP error is retried once, then reported with the hub\'s message', async () => {
  await withHub({ reply: () => ({ status: 503, error: 'Beam is in Bright mode' }) }, async (h, c) => {
    const r = await c.chat({ machine: 'mac', model: 'gpt-oss:20b', messages: [], numCtx: false });
    assert.equal(r.ok, false);
    assert.equal(h.chatCalls().length, 2);
    assert.match(r.error, /HTTP 503/);
    assert.match(r.error, /Bright mode/);
  });
});

test('budget, retryBudget and temperature can be set', async () => {
  await withHub({ reply: (b, n) => (n === 0 ? '' : 'x') }, async (h, c) => {
    await c.chat({ machine: 'mac', model: 'gpt-oss:20b', messages: [], numCtx: false, budget: 8000, retryBudget: 16000, temperature: 0 });
    const [a, b] = h.chatCalls();
    assert.equal(a.body.options.num_predict, 8000);
    assert.equal(b.body.options.num_predict, 16000);
    assert.equal(a.body.options.temperature, 0);
  });
});

test('chat with a role takes machine, model and think from the engines', async () => {
  await withHub({ reply: () => 'x' }, async (h) => {
    const c = createClient({ hub: h.hub, engines: ENGINES });
    const r = await c.chat({ role: 'label', messages: [], numCtx: false });
    const [call] = h.chatCalls();
    assert.equal(call.path, '/ollama/mac/api/chat');
    assert.equal(call.body.model, 'gpt-oss:20b');
    assert.equal(call.body.think, 'low');
    assert.equal(r.model, 'gpt-oss:20b');
  });
});

test('a request that hangs times out', async () => {
  const c = createClient({ hub: 'http://127.0.0.1:9', fetchImpl: (u, o) => new Promise((resolve, reject) => o.signal.addEventListener('abort', () => reject(o.signal.reason))) });
  const r = await c.chat({ machine: 'mac', model: 'm', messages: [], numCtx: false, timeout: 0.05 });
  assert.equal(r.ok, false);
  assert.equal(r.attempts, 2);
});

test('preflight passes when the hub is up, the model installed, Bright off and nobody would be pushed out', async () => {
  await withHub({}, async (h, c) => {
    const r = await c.preflight({ machine: 'mac', model: 'gpt-oss:120b' });
    assert.deepEqual(r.problems, []);
    assert.equal(r.ok, true);
    assert.equal(r.numCtx, 131072);
    assert.equal(r.reservation, null);
    assert.ok(!h.calls.some((x) => x.path.startsWith('/api/referee/')), 'no reservation unless asked');
  });
});

test('preflight: hub down stops at once', async () => {
  const c = createClient({ hub: 'http://127.0.0.1:9', fetchImpl: async () => { throw new Error('connect ECONNREFUSED'); } });
  const r = await c.preflight({ machine: 'mac', model: 'gpt-oss:20b' });
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /hub/i);
});

test('preflight: a model that is not installed', async () => {
  await withHub({}, async (h, c) => {
    const r = await c.preflight({ machine: 'mac36', model: 'mistral-medium-3.5' });
    assert.equal(r.ok, false);
    assert.match(r.problems.join(), /mistral-medium-3\.5.*not installed on mac36/);
  });
});

test('preflight: Bright mode on Beam stops a Beam run, not a Shine run', async () => {
  for (const mode of ['on', 'starting', 'stopping']) {
    await withHub({ bright: { mode } }, async (h, c) => {
      const r = await c.preflight({ machine: 'mac', model: 'gpt-oss:20b' });
      assert.equal(r.ok, false, mode);
      assert.match(r.problems.join(), new RegExp(`Bright mode is "${mode}"`));
      assert.equal((await c.preflight({ machine: 'mac36', model: 'gpt-oss:20b' })).ok, true);
    });
  }
});

test('preflight: another project using a loaded model ours would push out', async () => {
  const referee = { reservations: [], waiting: [], running: [{ id: 1, node: 'mac', model: 'gpt-oss:120b', cls: 'normal', project: 'Another Project' }] };
  await withHub({ referee, sizes: { 'mistral-medium-3.5:latest': 80e9 } }, async (h, c) => {
    const r = await c.preflight({ machine: 'mac', model: 'mistral-medium-3.5', capacityGiB: 110 });
    assert.equal(r.ok, false);
    assert.match(r.problems.join(), /push out gpt-oss:120b, which Another Project is using/);
  });
  // Our own project's jobs, the same model, or a model that fits beside the others are no problem.
  for (const [model, running, sizes] of [
    ['mistral-medium-3.5', [{ ...referee.running[0], project: 'Website WLC' }], { 'mistral-medium-3.5:latest': 80e9 }],
    ['gpt-oss:120b', referee.running, {}],
    ['gpt-oss:20b', referee.running, { 'gpt-oss:20b': 13e9 }],
  ]) {
    await withHub({ referee: { ...referee, running }, sizes }, async (h, c) => {
      const r = await c.preflight({ machine: 'mac', model, capacityGiB: 110 });
      assert.deepEqual(r.problems, [], model);
    });
  }
  // With no capacity given, any other project's model on the machine counts.
  await withHub({ referee }, async (h, c) => {
    assert.equal((await c.preflight({ machine: 'mac', model: 'gpt-oss:20b' })).ok, false);
  });
});

test('preflight: waiting jobs count too, and another project\'s reservation is a warning', async () => {
  const referee = { reservations: [{ node: 'mac', project: 'Third Project', until: 1 }], running: [], waiting: [{ id: 2, node: 'mac', model: 'gpt-oss:120b', cls: 'normal', project: 'Fourth Project' }] };
  await withHub({ referee, ps: { mac: [] } }, async (h, c) => {
    const r = await c.preflight({ machine: 'mac', model: 'mistral-medium-3.5' });
    assert.match(r.problems.join(), /Fourth Project/);
    assert.match(r.warnings.join(), /Third Project/);
  });
});

test('preflight reserves the machine for a long run, and reports a refusal', async () => {
  await withHub({ reserve: { ok: true, until: 123 } }, async (h, c) => {
    const r = await c.preflight({ machine: 'mac', model: 'gpt-oss:120b', reserveMinutes: 90 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.reservation, { ok: true, until: 123 });
    const call = h.calls.find((x) => x.path === '/api/referee/reserve');
    assert.deepEqual(call.body, { node: 'mac', project: 'Website WLC', minutes: 90, exclusive: false });
    await c.release('mac');
    assert.deepEqual(h.calls.at(-1).body, { node: 'mac', project: 'Website WLC' });
  });
  await withHub({ reserve: { ok: false, heldBy: 'Third Project', until: 5 } }, async (h, c) => {
    const r = await c.preflight({ machine: 'mac', model: 'gpt-oss:120b', reserveMinutes: 90 });
    assert.equal(r.ok, false);
    assert.match(r.problems.join(), /reserved by Third Project/);
  });
});

test('preflight does not reserve when another check already failed', async () => {
  await withHub({ bright: { mode: 'on' } }, async (h, c) => {
    await c.preflight({ machine: 'mac', model: 'gpt-oss:120b', reserveMinutes: 90 });
    assert.ok(!h.calls.some((x) => x.path === '/api/referee/reserve'));
  });
});

test('embed calls /api/embed and returns the vectors', async () => {
  await withHub({}, async (h, c) => {
    assert.deepEqual(await c.embed('mac', 'nomic-embed-text', ['a']), [[0.1, 0.2]]);
    assert.deepEqual(h.calls[0].body, { model: 'nomic-embed-text', input: ['a'] });
  });
});
