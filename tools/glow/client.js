// The Glow suite's one way to reach the local models: the hub on the owner's PC, in Ollama's format only.
//
// What it builds in (docs/glow/GLOW-SURVEY.md, sections 4, 10 and 11):
// - Only the hub routes the suite needs. Model pull, delete, copy, create and push, Bright mode's switch and the
//   referee's drain are refused before anything is sent.
// - Every request is labelled with X-LLM-Requester, X-LLM-Project and (for model calls) X-LLM-Task.
// - The loaded model's context size from /api/ps, so a job never forces a reload on another project's job.
// - With a JSON schema: think "low", and length limits taken out of the schema and checked in code (Ollama truncates a
//   string at maxLength mid-word). think: false is kept, so a model that only thinks when asked stays quiet.
// - An empty or unparseable reply is retried once with a bigger budget and think "low".
// - End tokens stripped, non-breaking hyphens and spaces made plain.
// - preflight(): the hub answers, the model is installed, Beam is not in Bright mode, and no other project is using a
//   model this job would push out of memory; a long run can reserve the machine.
// First drafted by glow-autofix (Qwen 3.6 coder, then gpt-oss:20b: 22 of 29 tests), finished by Claude.

export const HUB = 'http://127.0.0.1:8790';
export const MACHINES = new Set(['mac', 'mac36', 'studio', 'rtx']);

const END_TOKENS = /<\|(eot|eot_id|endoftext|im_end|end)\|>/g;
const LIMIT_KEYS = ['maxLength', 'minLength', 'maxItems', 'minItems'];
const sameModel = (a, b) => a === b || a === `${b}:latest` || `${a}:latest` === b;

/** Model text made safe to store and compare: end tokens removed, non-breaking hyphens and spaces made plain. */
export function cleanText(s) {
  return String(s ?? '')
    .replace(END_TOKENS, '')
    .replace(/[‐‑]/g, '-')
    .replace(/[  ]/g, ' ')
    .trim();
}

/** The first JSON object in a reply, through code fences and preamble; null if there is none. */
export function parseJson(s) {
  const t = cleanText(s).replace(/```(json)?/gi, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

/** A copy of a JSON schema without length limits, and the limits it had, to check in code. */
export function splitLimits(schema) {
  const limits = [];
  const copy = JSON.parse(JSON.stringify(schema));
  const walk = (node, at) => {
    if (!node || typeof node !== 'object') return;
    for (const key of LIMIT_KEYS) {
      if (key in node) { limits.push({ path: at, key, value: node[key] }); delete node[key]; }
    }
    if (node.properties && typeof node.properties === 'object') {
      for (const [k, v] of Object.entries(node.properties)) walk(v, at ? `${at}.${k}` : k);
    }
    if (node.items) walk(node.items, `${at}[]`);
  };
  walk(copy, '');
  return { schema: copy, limits };
}

/** The values a path reaches: [{ at, value }]. 'a.b' reads properties; a trailing '[]' on a part reads every element. */
function resolve(obj, path) {
  let found = [{ at: '', value: obj }];
  for (const part of path.split('.')) {
    const name = part.replace(/(\[\])+$/, '');
    const arrays = (part.length - name.length) / 2;
    const next = [];
    for (const f of found) {
      if (f.value == null || typeof f.value !== 'object') continue;
      const v = f.value[name];
      if (v === undefined) continue;
      let level = [{ at: f.at ? `${f.at}.${name}` : name, value: v }];
      for (let i = 0; i < arrays; i++) {
        level = level.flatMap((x) => (Array.isArray(x.value) ? x.value.map((el, j) => ({ at: `${x.at}[${j}]`, value: el })) : []));
      }
      next.push(...level);
    }
    found = next;
  }
  return found;
}

/** Problems with the length limits splitLimits took out, as short sentences. Missing values are not checked. */
export function checkLimits(obj, limits) {
  const problems = [];
  for (const { path, key, value } of limits) {
    for (const { at, value: v } of resolve(obj, path)) {
      let n = null;
      let unit = '';
      if (typeof v === 'string' && /Length$/.test(key)) { n = v.length; unit = 'characters'; }
      if (Array.isArray(v) && /Items$/.test(key)) { n = v.length; unit = 'items'; }
      if (n === null) continue;
      if (key.startsWith('max') && n > value) problems.push(`${at}: ${n} ${unit}, over ${value}`);
      if (key.startsWith('min') && n < value) problems.push(`${at}: ${n} ${unit}, under ${value}`);
    }
  }
  return problems;
}

/** A role's engine from engines.json: { machine, model, think, budget, ... }. */
export function engineFor(role, engines) {
  const e = engines?.roles?.[role];
  if (!e) throw new Error(`unknown role "${role}"`);
  return e;
}

/** Whether the client may send this request. Everything not listed is refused. */
function allowed(method, path) {
  if (method === 'GET' && ['/api/health', '/api/state', '/api/referee', '/api/bright'].includes(path)) return true;
  if (method === 'POST' && ['/api/referee/reserve', '/api/referee/release'].includes(path)) return true;
  const m = path.match(/^\/ollama\/([^/]+)\/api\/([a-z]+)$/);
  if (!m || !MACHINES.has(m[1])) return false;
  if (method === 'GET') return ['tags', 'ps', 'version'].includes(m[2]);
  if (method === 'POST') return ['show', 'chat', 'generate', 'embed'].includes(m[2]);
  return false;
}

/**
 * A client for the hub.
 * @param {object} [o]
 * @param {string} [o.hub] the hub's address (default the owner's PC)
 * @param {string} [o.project] X-LLM-Project
 * @param {string} [o.requester] X-LLM-Requester
 * @param {Function} [o.fetchImpl] fetch, or a stand-in for tests
 * @param {number} [o.timeout] seconds a request
 * @param {object} [o.headers] extra headers, sent last
 * @param {object} [o.engines] engines.json, for chat({ role })
 */
export function createClient({ hub = HUB, project = 'Website WLC', requester = 'claude', fetchImpl = fetch, timeout = 300, headers = {}, engines = null } = {}) {
  async function request(method, path, body, { task, timeout: t } = {}) {
    if (!allowed(method, path)) throw new Error(`route not allowed: ${method} ${path}`);
    const h = { 'X-LLM-Requester': requester, 'X-LLM-Project': project };
    if (task) h['X-LLM-Task'] = task;
    if (path.startsWith('/api/referee/')) h['x-glow'] = '1';
    if (method === 'POST') h['content-type'] = 'application/json';
    const res = await fetchImpl(hub + path, {
      method,
      headers: { ...h, ...headers },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      signal: AbortSignal.timeout((t ?? timeout) * 1000),
    });
    const text = await res.text();
    if (!res.ok) {
      const e = new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
      e.status = res.status;
      e.body = text;
      throw e;
    }
    return text ? JSON.parse(text) : null;
  }

  const health = () => request('GET', '/api/health');
  const state = () => request('GET', '/api/state');
  const referee = () => request('GET', '/api/referee');
  const bright = () => request('GET', '/api/bright');
  const tags = (m) => request('GET', `/ollama/${m}/api/tags`);
  const ps = (m) => request('GET', `/ollama/${m}/api/ps`);
  const version = (m) => request('GET', `/ollama/${m}/api/version`);
  const show = (m, model) => request('POST', `/ollama/${m}/api/show`, { model });

  /** The context size `model` is loaded with on machine `m`, or null when it is not loaded. */
  async function loadedContext(m, model) {
    const found = ((await ps(m))?.models || []).find((x) => sameModel(x.name, model));
    return found?.context_length ?? null;
  }

  /** Reserve a machine for this project. A machine held by another project answers { ok: false, heldBy }. */
  async function reserve(m, minutes, { exclusive = false } = {}) {
    try {
      return await request('POST', '/api/referee/reserve', { node: m, project, minutes, exclusive });
    } catch (e) {
      if (e.status === 409) { try { return JSON.parse(e.body); } catch { /* fall through */ } }
      throw e;
    }
  }

  const release = (m) => request('POST', '/api/referee/release', { node: m, project });

  async function embed(m, model, input) {
    return (await request('POST', `/ollama/${m}/api/embed`, { model, input }))?.embeddings;
  }

  /**
   * One chat call with one retry. Returns { ok, text, json, problems, error, model, machine, attempts, ms, tokens, at }.
   * numCtx: a number to send, false to send none, or left out to send the loaded model's size.
   * retryThink: think on the retry ('low'), or null to keep the first attempt's.
   */
  async function chat(o) {
    const e = o.role ? engineFor(o.role, engines) : {};
    const machine = o.machine ?? e.machine;
    const model = o.model ?? e.model;
    let think = 'think' in o ? o.think : e.think;
    const budget = o.budget ?? e.budget ?? 6000;
    const retryBudget = o.retryBudget ?? e.retryBudget ?? 12000;
    const retryThink = 'retryThink' in o ? o.retryThink : 'low';
    const temperature = o.temperature ?? e.temperature ?? 0.2;
    const t = o.timeout ?? e.timeout;
    let parse = o.parse;
    let limits = null;
    let format;
    if (o.format && typeof o.format === 'object') {
      ({ schema: format, limits } = splitLimits(o.format));
      if (think !== false) think = 'low';
      parse ??= parseJson;
    } else if (o.format === 'json') {
      format = 'json';
      parse ??= parseJson;
    }
    const path = `/ollama/${machine}/api/chat`;
    if (!allowed('POST', path)) throw new Error(`route not allowed: POST ${path}`);

    const options = { num_predict: budget, temperature };
    if (typeof o.numCtx === 'number') options.num_ctx = o.numCtx;
    else if (o.numCtx !== false) {
      try { const c = await loadedContext(machine, model); if (c) options.num_ctx = c; } catch { /* the hub will say */ }
    }
    const body = { model, stream: false, messages: o.messages, options };
    if (think !== undefined) body.think = think;
    if (format !== undefined) body.format = format;

    const start = Date.now();
    const out = { ok: false, text: '', json: null, problems: [], error: null, model, machine, attempts: 0, ms: 0, tokens: { prompt: null, output: null }, at: new Date(start).toISOString() };
    for (let i = 0; i < 2; i++) {
      out.attempts++;
      if (i === 1) {
        body.options = { ...body.options, num_predict: retryBudget };
        if (retryThink !== null && think !== false) body.think = format && typeof format === 'object' ? 'low' : retryThink;
      }
      try {
        const data = await request('POST', path, body, { task: o.task, timeout: t });
        out.text = cleanText(data?.message?.content ?? data?.response ?? '');
        out.json = parse ? parse(out.text) : null;
        out.tokens = { prompt: data?.prompt_eval_count ?? null, output: data?.eval_count ?? null };
        out.error = !out.text ? 'empty reply' : parse && out.json === null ? 'unparseable reply' : null;
      } catch (err) {
        out.text = '';
        out.json = null;
        out.error = err.message;
      }
      if (!out.error) { out.ok = true; break; }
    }
    out.problems = limits && out.json ? checkLimits(out.json, limits) : [];
    out.ms = Date.now() - start;
    return out;
  }

  /**
   * Checks before a run. Returns { ok, problems, warnings, numCtx, reservation }; nothing is reserved unless
   * reserveMinutes is given and every other check passed.
   */
  async function preflight({ machine, model, reserveMinutes, capacityGiB, exclusive = false }) {
    const problems = [];
    const warnings = [];
    let numCtx = null;
    let reservation = null;
    const done = () => ({ ok: problems.length === 0, problems, warnings, numCtx, reservation });
    try {
      const h = await health();
      if (!h?.ok) throw new Error('it does not say ok');
    } catch (err) {
      problems.push(`the hub at ${hub} is not answering: ${err.message}`);
      return done();
    }
    let installed = [];
    try { installed = (await tags(machine))?.models || []; } catch (err) { problems.push(`could not list the models on ${machine}: ${err.message}`); }
    const ours = installed.find((x) => sameModel(x.name, model));
    if (!ours && installed.length) problems.push(`${model} is not installed on ${machine}`);
    if (machine === 'mac') {
      try {
        const mode = (await bright())?.mode;
        if (mode !== 'off') problems.push(`Beam's Bright mode is "${mode}"; send the job to mac36 or wait`);
      } catch (err) { problems.push(`could not read Beam's Bright mode: ${err.message}`); }
    }
    let loaded = [];
    try { loaded = (await ps(machine))?.models || []; } catch (err) { problems.push(`could not read what ${machine} has loaded: ${err.message}`); }
    const ourLoaded = loaded.find((x) => sameModel(x.name, model));
    numCtx = ourLoaded?.context_length ?? null;
    let ref = null;
    try { ref = await referee(); } catch (err) { problems.push(`could not read the referee: ${err.message}`); }
    if (ref && !ourLoaded) {
      const others = [...(ref.running || []), ...(ref.waiting || [])]
        .filter((j) => j.node === machine && j.project !== project && !sameModel(j.model, model));
      const fits = capacityGiB && ours?.size != null
        && loaded.reduce((s, x) => s + (x.size || 0), 0) + ours.size <= capacityGiB * 2 ** 30;
      if (!fits) {
        for (const j of others) {
          const p = `loading ${model} on ${machine} could push out ${j.model}, which ${j.project} is using`;
          if (!problems.includes(p)) problems.push(p);
        }
      }
    }
    for (const r of ref?.reservations || []) {
      if (r.node === machine && r.project !== project) warnings.push(`${machine} is reserved by ${r.project}`);
    }
    if (reserveMinutes && problems.length === 0) {
      reservation = await reserve(machine, reserveMinutes, { exclusive });
      if (!reservation?.ok) problems.push(`${machine} is reserved by ${reservation?.heldBy ?? reservation?.error ?? 'someone else'}`);
    }
    return done();
  }

  return { hub, project, request, health, state, referee, bright, tags, ps, version, show, loadedContext, reserve, release, embed, chat, preflight };
}
