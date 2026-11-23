// What the Glow hub and each engine can do right now, written to <work-dir>/capabilities.json.
//
//   node tools/glow/probe.js <work-dir> [--try] [--hub <url>]
//
// It only reads: the hub's status routes, and each machine's version, installed models (tags), loaded models (ps) and
// each role's model card (show). It never pulls, deletes or loads a model and never switches Bright mode.
// --try also sends one short prompt to each role whose model is already loaded (so nothing is pushed out of memory),
// and one embedding. For that it reserves Beam only for the length of the probe, and releases it before it exits.
// The work folder must be outside this repository: what the hub reports (other projects' names) stays on the PC.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, MACHINES } from './client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
export const ENGINES = JSON.parse(fs.readFileSync(path.join(HERE, 'engines.json'), 'utf8'));

const sameModel = (a, b) => a === b || a === `${b}:latest` || `${a}:latest` === b;
const err = (e) => String(e?.message || e);

/** True when `dir` is this repository or inside it. */
export function insideRepo(dir, repo = REPO) {
  const rel = path.relative(path.resolve(repo), path.resolve(dir));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Probe the hub. Returns the capabilities object; writes nothing. */
export async function probe({ client, engines = ENGINES, tryModels = false } = {}) {
  const out = { at: new Date().toISOString(), hub: client.hub, health: null, bright: null, referee: null, machines: {}, roles: {}, reservation: null };
  try { out.health = await client.health(); } catch (e) { out.health = { ok: false, error: err(e) }; return out; }
  try { const b = await client.bright(); out.bright = { mode: b.mode, model: b.model ?? null }; } catch (e) { out.bright = { error: err(e) }; }
  try {
    const r = await client.referee();
    out.referee = { running: r.running?.length ?? 0, waiting: r.waiting?.length ?? 0, reservations: (r.reservations || []).map((x) => ({ node: x.node, project: x.project })), jobs: [...(r.running || []), ...(r.waiting || [])].map((j) => ({ node: j.node, model: j.model, project: j.project })) };
  } catch (e) { out.referee = { error: err(e) }; }

  for (const m of MACHINES) {
    const info = { name: engines.machines?.[m]?.name ?? m, ok: false };
    try {
      info.version = (await client.version(m)).version;
      info.installed = ((await client.tags(m)).models || []).map((x) => ({ name: x.name, size: x.size }));
      info.loaded = ((await client.ps(m)).models || []).map((x) => ({ name: x.name, contextLength: x.context_length ?? null, size: x.size ?? null }));
      info.ok = true;
    } catch (e) { info.error = err(e); }
    out.machines[m] = info;
  }

  for (const [role, e] of Object.entries(engines.roles)) {
    const mach = out.machines[e.machine] || {};
    const installed = (mach.installed || []).some((x) => sameModel(x.name, e.model));
    const loaded = (mach.loaded || []).find((x) => sameModel(x.name, e.model)) || null;
    const r = { machine: e.machine, model: e.model, installed, loaded: !!loaded, contextLength: loaded?.contextLength ?? null };
    if (installed) {
      try { r.capabilities = (await client.show(e.machine, e.model)).capabilities ?? null; } catch (x) { r.capabilities = { error: err(x) }; }
    }
    if (e.fallback) r.fallback = { machine: e.fallback, installed: (out.machines[e.fallback]?.installed || []).some((x) => sameModel(x.name, e.model)) };
    out.roles[role] = r;
  }

  if (!tryModels) return out;
  const beamUsed = Object.entries(out.roles).some(([, r]) => r.machine === 'mac' && r.loaded);
  if (out.bright?.mode !== 'off') { out.tried = { skipped: `Bright mode is "${out.bright?.mode}"` }; return out; }
  try {
    if (beamUsed) out.reservation = await client.reserve('mac', 10);
    for (const [role, e] of Object.entries(engines.roles)) {
      const r = out.roles[role];
      if (!r.loaded) { r.try = { skipped: 'not loaded; the probe never loads a model' }; continue; }
      const t0 = Date.now();
      try {
        if (role === 'embed') {
          const v = await client.embed(e.machine, e.model, ['uplighting on ivory drapes']);
          r.try = { ok: Array.isArray(v?.[0]), dimensions: v?.[0]?.length ?? null, ms: Date.now() - t0 };
          continue;
        }
        const schema = { type: 'object', properties: { answer: { type: 'string', maxLength: 10 } }, required: ['answer'] };
        const useSchema = e.format === 'schema';
        const c = await client.chat({
          role, task: `probe: ${role}`, budget: e.budget, retryBudget: e.retryBudget, timeout: e.timeout,
          messages: [{ role: 'user', content: 'Reply with only this JSON object: {"answer": "ok"}' }],
          ...(useSchema ? { format: schema } : { think: e.think === 'high' ? 'low' : e.think, parse: undefined }),
        });
        r.try = { ok: c.ok, schema: useSchema, attempts: c.attempts, ms: c.ms, tokens: c.tokens, numCtxSent: r.contextLength, reply: c.text.slice(0, 80), problems: c.problems, error: c.error };
      } catch (x) { r.try = { ok: false, error: err(x) }; }
    }
  } finally {
    if (out.reservation?.ok) { try { out.released = (await client.release('mac')).released; } catch (x) { out.released = { error: err(x) }; } }
  }
  return out;
}

async function main(argv) {
  const pos = [];
  let tryModels = false;
  let hub = ENGINES.hub;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--try') tryModels = true;
    else if (argv[i] === '--hub') hub = argv[++i];
    else pos.push(argv[i]);
  }
  if (!pos[0]) { console.log('Usage: node tools/glow/probe.js <work-dir outside the repository> [--try] [--hub <url>]'); process.exit(1); }
  const dir = path.resolve(pos[0]);
  if (insideRepo(dir)) { console.error(`Refusing to write inside the repository (${dir}): it is public. Choose a work folder elsewhere.`); process.exit(1); }
  const client = createClient({ hub, engines: ENGINES });
  const cap = await probe({ client, tryModels });
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'capabilities.json');
  fs.writeFileSync(file, `${JSON.stringify(cap, null, 2)}\n`);
  const up = Object.entries(cap.machines).map(([m, x]) => `${m} ${x.ok ? 'up' : 'down'}`).join(', ');
  const roles = Object.entries(cap.roles).map(([k, r]) => `${k} ${r.installed ? (r.loaded ? 'loaded' : 'installed') : 'MISSING'}${r.try ? (r.try.skipped ? '' : r.try.ok ? ' (tried ok)' : ' (tried FAILED)') : ''}`).join(', ');
  console.log(`Hub ${cap.health?.ok ? 'up' : 'DOWN'}; Bright mode ${cap.bright?.mode ?? '?'}. Machines: ${up}.\nRoles: ${roles}.${cap.reservation ? `\nBeam reserved for the probe: ${cap.reservation.ok ? 'yes' : 'no'}; released: ${cap.released}.` : ''}\nWrote ${file}`);
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}
