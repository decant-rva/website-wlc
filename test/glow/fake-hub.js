// A stand-in for the Glow hub, for tests: no network beyond 127.0.0.1, no real models.
// `state` holds what each route answers; every request is recorded in `calls`.
import http from 'node:http';

export async function fakeHub(init = {}) {
  const state = {
    health: { ok: true, version: 'test' },
    bright: { mode: 'off' },
    referee: { draining: false, reservations: [], running: [], waiting: [], idle: true },
    tags: { mac: ['gpt-oss:20b', 'gpt-oss:120b', 'qwen3.6:35b-a3b-coding-mtp-q4_K_M', 'mistral-medium-3.5:latest', 'muse-glimmer:30b', 'nomic-embed-text:latest'], mac36: ['gpt-oss:20b'] },
    sizes: {},
    ps: { mac: [{ name: 'gpt-oss:120b', context_length: 131072, size: 65e9 }] },
    reserve: { ok: true, until: 0 },
    // reply(body, n) returns the model's text for the n-th chat call (0-based), or { status, error } to fail it.
    reply: () => '{"ok": true}',
    ...init,
  };
  const calls = [];
  let chats = 0;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      const url = new URL(req.url, 'http://x');
      calls.push({ method: req.method, path: url.pathname, headers: req.headers, body });
      const send = (status, obj) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
      const p = url.pathname;
      if (p === '/api/health') return send(200, state.health);
      if (p === '/api/bright') return send(200, state.bright);
      if (p === '/api/referee') return send(200, state.referee);
      if (p === '/api/state') return send(200, { nodes: [] });
      if (p === '/api/referee/reserve') return send(state.reserve.ok ? 200 : 409, state.reserve);
      if (p === '/api/referee/release') return send(200, { released: true });
      const m = p.match(/^\/ollama\/([^/]+)\/api\/(\w+)$/);
      if (!m) return send(404, { error: 'not found' });
      const [, node, call] = m;
      if (call === 'tags') return send(200, { models: (state.tags[node] || []).map((name) => ({ name, model: name, size: state.sizes[name] ?? 1e9 })) });
      if (call === 'ps') return send(200, { models: state.ps[node] || [] });
      if (call === 'version') return send(200, { version: '0.0.0' });
      if (call === 'show') return send(200, { capabilities: ['completion'] });
      if (call === 'embed') return send(200, { embeddings: [[0.1, 0.2]] });
      if (call === 'chat' || call === 'generate') {
        const out = state.reply(body, chats++);
        if (out && typeof out === 'object') return send(out.status || 500, { error: out.error || 'failed' });
        return send(200, call === 'chat'
          ? { model: body.model, message: { role: 'assistant', content: out }, prompt_eval_count: 11, eval_count: 7 }
          : { model: body.model, response: out, prompt_eval_count: 11, eval_count: 7 });
      }
      return send(404, { error: 'not found' });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    hub: `http://127.0.0.1:${port}`,
    state,
    calls,
    chatCalls: () => calls.filter((c) => /\/api\/(chat|generate)$/.test(c.path)),
    close: () => new Promise((r) => server.close(r)),
  };
}
