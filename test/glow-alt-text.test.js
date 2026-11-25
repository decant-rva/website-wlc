// node --test test/glow-alt-text.test.js   (needs no build and no network)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { collect, prepare, draft, proposals, apply, approved, parseReply, check, promptFor, readDescriptions, readDecisions, applyDecisions } from '../tools/glow-alt-text.js';

const REPO = path.resolve(import.meta.dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wlc-alt-'));
const jobsAll = collect(REPO);

/** A copy of the content folder to apply changes to. */
function contentCopy() {
  const root = tmp();
  fs.cpSync(path.join(REPO, 'content'), path.join(root, 'content'), { recursive: true });
  return root;
}

/** A stand-in for the hub's chat route. `reply(prompt)` returns the model's text. */
async function fakeChat(reply, { openai = false } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const b = JSON.parse(body);
      calls.push({ headers: req.headers, body: b });
      const text = reply(b.messages.at(-1).content);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(openai ? { choices: [{ message: { content: text } }] } : { message: { role: 'assistant', content: text } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}${openai ? '/v1/chat/completions' : '/ollama/mac/api/chat'}`, calls, close: () => new Promise((r) => server.close(r)) };
}

/** prepare without the network: jobs.json plus a description for the first `n` photos to describe. */
async function prepared(n = Infinity) {
  const work = tmp();
  await prepare(work, { root: REPO, download: false });
  const todo = jobsAll.filter((j) => !j.skip).slice(0, n);
  fs.writeFileSync(path.join(work, 'photos', 'descriptions.jsonl'), todo.map((j) => JSON.stringify({ file: `C:\\work\\photos\\${j.file}`, description: `Warm amber uplighting on ivory drapes in a ballroom, round tables with candles.<|eot|>` })).join('\n'));
  return { work, todo };
}

test('finds every photo with no alt text, with its page and context', () => {
  assert.ok(jobsAll.length > 200);
  const ids = new Set(jobsAll.map((j) => j.id));
  assert.equal(ids.size, jobsAll.length);
  for (const j of jobsAll) {
    assert.ok(j.uses.length, j.id);
    for (const u of j.uses) assert.ok(u.path.startsWith('/') && u.file && u.note.startsWith('Site/'), j.id);
  }
  assert.ok(jobsAll.some((j) => j.skip === 'icon'));
  assert.ok(jobsAll.some((j) => j.skip === 'not served by the previous host'));
  // A venue is offered only on strong evidence or when it is the one venue mentioned.
  for (const j of jobsAll) assert.ok(j.venues.length <= Math.max(1, j.uses.filter((u) => u.venue).length + j.elsewhere.length), j.id);
});

test('the prompt carries the rules, the description and the context', () => {
  const j = jobsAll.find((x) => !x.skip && x.uses[0].nearby.length);
  const p = promptFor(j, 'A tent lit with bistro lights.');
  assert.match(p, /A tent lit with bistro lights\./);
  assert.match(p, new RegExp(j.uses[0].path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(p, /No dashes/);
  assert.match(p, /for style only/);
  assert.match(p, /NOT decorative/);
  assert.match(p, /never to add things that are not/);
  assert.match(p, /VENUES: /);
});

test('replies are parsed through end tokens and code fences', () => {
  assert.deepEqual(parseReply('```json\n{"alt": "Bistro lights over a tent"}\n```<|eot|>'), { alt: 'Bistro lights over a tent' });
  assert.deepEqual(parseReply('Sure! {"alt": "x", "decorative": true}'), { alt: 'x', decorative: true });
  assert.equal(parseReply(''), null);
  assert.equal(parseReply('no json here'), null);
});

test('checks flag long, dashed, salesy and unsupported-venue alt text', () => {
  const j = { venues: [], venuesMentioned: [] };
  const venuesIn = (t) => (/dover hall/i.test(t) ? ['Dover Hall'] : []);
  assert.deepEqual(check(j, { alt: 'Amber uplighting on drapes around a ballroom.', confidence: 'high' }, venuesIn), { alt: 'Amber uplighting on drapes around a ballroom', flags: [] });
  assert.match(check(j, { alt: 'Stunning lights — over the floor at night' }, venuesIn).flags.join(), /dash/);
  assert.match(check(j, { alt: 'Stunning lights over the dance floor at night' }, venuesIn).flags.join(), /stunning/);
  assert.match(check(j, { alt: 'Uplighting in the ballroom at Dover Hall' }, venuesIn).flags.join(), /Dover Hall/);
  assert.deepEqual(check({ venues: ['Dover Hall'] }, { alt: 'Uplighting in the ballroom at Dover Hall' }, venuesIn).flags, []);
  assert.match(check(j, { alt: 'x'.repeat(130) }, venuesIn).flags.join(), /over 125/);
  assert.deepEqual(check(j, { alt: '', decorative: true }, venuesIn), { alt: '', flags: ['the model says it is decorative'] });
  assert.deepEqual(check(j, { alt: 'Poly\u2011silk drape with\u00a0soft folds in a ballroom' }, venuesIn), { alt: 'Poly-silk drape with soft folds in a ballroom', flags: [] });
});

test('descriptions are matched by file name whatever path the describer wrote', async () => {
  const { work, todo } = await prepared(3);
  const d = readDescriptions(work);
  assert.equal(d.size, 3);
  assert.ok(!d.get(todo[0].file).includes('<|eot|>'));
});

test('a description line with an error is ignored, and a later clean line for the same photo wins', async () => {
  const { work, todo } = await prepared(0);
  const f = todo.length ? todo[0].file : jobsAll.find((j) => !j.skip).file;
  fs.writeFileSync(path.join(work, 'photos', 'descriptions.jsonl'), [
    JSON.stringify({ file: f, description: 'Warm uplighting on dra', error: 'cut off at the token cap', seconds: 30 }),
    JSON.stringify({ file: 'other.jpg', description: '', error: 'empty reply', seconds: 2 }),
    JSON.stringify({ file: f, description: 'Warm uplighting on drapes in a ballroom.', error: null, seconds: 21 }),
  ].join('\n'));
  const d = readDescriptions(work);
  assert.equal(d.get(f), 'Warm uplighting on drapes in a ballroom.');
  assert.ok(!d.has('other.jpg'));
  fs.writeFileSync(path.join(work, 'photos', 'descriptions.jsonl'), JSON.stringify({ file: f, description: 'Cut off', error: 'cut off at the token cap' }));
  assert.ok(!readDescriptions(work).has(f));
});

test('draft calls the chat route once per described photo, and a re-run does only what is left', async () => {
  const { work, todo } = await prepared(4);
  const chat = await fakeChat(() => '{"alt": "Amber uplighting on ivory drapes in a ballroom", "decorative": false, "venue": "", "confidence": "high", "note": ""}<|eot|>');
  try {
    const r = await draft(work, { url: chat.url, model: 'mistral-medium-3.5', headers: { 'x-requester': 'Glow alt text' }, limit: 2, log: () => {} });
    assert.equal(r.drafted, 2);
    assert.equal(chat.calls.length, 2);
    assert.equal(chat.calls[0].body.model, 'mistral-medium-3.5');
    assert.equal(chat.calls[0].body.stream, false);
    assert.ok(chat.calls[0].body.options.num_predict >= 6000);
    assert.equal(chat.calls[0].headers['x-requester'], 'Glow alt text');
    assert.equal(chat.calls[0].headers['x-llm-project'], 'Website WLC');
    assert.match(chat.calls[0].headers['x-llm-task'], /^alt text: .+\.jpg$/);
    const again = await draft(work, { url: chat.url, log: () => {} });
    assert.equal(again.drafted, 2);
    assert.equal(chat.calls.length, 4);
    const lines = fs.readFileSync(path.join(work, 'drafts.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => l.id).sort(), todo.map((j) => j.id).sort());
  } finally {
    await chat.close();
  }
});

test('draft speaks the OpenAI format too, and retries an empty reply with a bigger budget', async () => {
  const { work } = await prepared(1);
  let n = 0;
  const chat = await fakeChat(() => (n++ === 0 ? '' : '{"alt": "Bistro lights strung over a tent"}'), { openai: true });
  try {
    const r = await draft(work, { url: chat.url, log: () => {} });
    assert.equal(r.drafted, 1);
    assert.equal(chat.calls.length, 2);
    assert.ok(chat.calls[1].body.max_tokens > chat.calls[0].body.max_tokens);
  } finally {
    await chat.close();
  }
});

test('proposals: one note per fully drafted page, ticked when clean, and apply puts ticked lines into the content', async () => {
  const { work } = await prepared();
  const chat = await fakeChat((prompt) => (/\/about-wedding-lighting-co/.test(prompt)
    ? '{"alt": "Stunning amber uplighting on ivory drapes", "confidence": "high"}'
    : '{"alt": "Amber uplighting on ivory drapes in a ballroom", "confidence": "high"}'));
  const vault = tmp();
  const root = contentCopy();
  try {
    await draft(work, { url: chat.url, log: () => {} });
    const r = proposals(work, vault, { root: REPO, now: new Date('2026-11-23T12:00:00Z') });
    assert.ok(r.written.length > 50);
    assert.equal(r.tally.waitingPages, 0);
    const dir = path.join(vault, 'Curation', 'Proposals');
    const upl = fs.readFileSync(path.join(dir, '2026-11-23 Alt text - UPLIGHTING.md'), 'utf8');
    assert.match(upl, /^type: "proposal"$/m);
    assert.match(upl, /^field: "alt"$/m);
    assert.match(upl, /^status: "draft"$/m);
    assert.match(upl, /^- \[x\] `[^`]+`: Amber uplighting on ivory drapes in a ballroom$/m);
    const about = fs.readFileSync(path.join(dir, '2026-11-23 Alt text - About.md'), 'utf8');
    assert.match(about, /^- \[ \] `[^`]+`: Stunning amber uplighting on ivory drapes$/m);
    assert.match(about, /\*\*Check:\*\* uses "stunning"/);
    assert.ok(fs.existsSync(path.join(vault, 'Curation', 'Alt text run 2026-11-23.md')));

    // Nothing is applied until the owner approves.
    assert.equal(approved(vault).length, 0);
    assert.equal(apply(vault, { root }).applied, 0);

    // The owner approves the uplighting page and edits one line.
    const edited = upl.replace(/^status: "draft"$/m, 'status: approved').replace(/(^- \[x\] `[^`]+`: ).*$/m, '$1Warm uplighting on drapes, edited by the owner');
    fs.writeFileSync(path.join(dir, '2026-11-23 Alt text - UPLIGHTING.md'), edited);
    const ticked = [...edited.matchAll(/^- \[x\] `([^`]+)`/gm)].length;
    const res = apply(vault, { root, markApplied: true });
    assert.equal(res.notes, 1);
    assert.equal(res.applied, ticked);
    assert.deepEqual(res.notFound, []);
    const page = fs.readFileSync(path.join(root, 'content/pages/uplighting.md'), 'utf8');
    assert.match(page, /!\[Warm uplighting on drapes, edited by the owner\]\(wix:/);
    assert.match(fs.readFileSync(path.join(dir, '2026-11-23 Alt text - UPLIGHTING.md'), 'utf8'), /^status: "applied"$/m);
    // Applying again changes nothing: the note is no longer approved, and the photos now have alt text.
    assert.equal(apply(vault, { root }).applied, 0);

    // A second proposals run keeps the notes people have edited.
    const again = proposals(work, vault, { root: REPO, now: new Date('2026-11-23T12:00:00Z') });
    assert.equal(again.written.length, 0);
    assert.equal(again.kept.length, r.written.length);
  } finally {
    await chat.close();
    for (const d of [work, vault, root]) fs.rmSync(d, { recursive: true, force: true });
  }
});

test('apply never replaces alt text a photo already has, and handles venue photos', () => {
  const vault = tmp();
  const root = contentCopy();
  try {
    const venues = JSON.parse(fs.readFileSync(path.join(root, 'content/venues.json'), 'utf8'));
    const v = venues.venues.find((x) => x.photos.length);
    const had = v.photos[0];
    v.photos.push({ id: 'test_photo~mv2.jpg', alt: '' });
    fs.writeFileSync(path.join(root, 'content/venues.json'), JSON.stringify(venues));
    fs.mkdirSync(path.join(vault, 'Curation', 'Proposals'), { recursive: true });
    fs.writeFileSync(path.join(vault, 'Curation', 'Proposals', 'v.md'), `---\ntype: proposal\nstatus: approved\ntarget: "/venue/${v.slug}"\nfile: "content/venues.json"\nfield: alt\n---\n# x\n\n- [x] \`test_photo~mv2.jpg\`: Bistro lights over a lawn\n- [x] \`${had.id}\`: Something else\n- [ ] \`nope~mv2.jpg\`: Not ticked\n`);
    const r = apply(vault, { root });
    assert.equal(r.applied, 1);
    assert.equal(r.alreadyHadAlt, 1);
    const after = JSON.parse(fs.readFileSync(path.join(root, 'content/venues.json'), 'utf8')).venues.find((x) => x.slug === v.slug);
    assert.equal(after.photos.find((x) => x.id === 'test_photo~mv2.jpg').alt, 'Bistro lights over a lawn');
    assert.equal(after.photos[0].alt, had.alt);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a caption beside the photo is venue evidence: the /venue covers name their own venues, not Mount Ida', () => {
  const linden = jobsAll.find((j) => j.id === 'a16fb7_b571d98a3ae34ac58944940b6a11c133~mv2.jpg');
  assert.deepEqual(linden.venues, ['Linden Row Inn']);
  assert.ok(linden.uses.some((u) => u.path === '/venue' && u.caption === 'Linden Row Inn'));
  assert.match(promptFor(linden, 'A brick courtyard.'), /Caption beside the photo: Linden Row Inn/);
  // Only Mount Ida's own photo may name it.
  assert.deepEqual(jobsAll.filter((j) => j.venues.includes('Mount Ida Event Barn')).map((j) => j.id), []);
  assert.deepEqual(jobsAll.find((j) => j.id.startsWith('a16fb7_6296c7d7')).venues, ['Jefferson Hotel']);
});

test('--redo drafts chosen photos again, and --only --force rewrites just those pages, dropping a stale draft note', async () => {
  const { work, todo } = await prepared();
  let alt = 'Amber uplighting on ivory drapes in a ballroom';
  const chat = await fakeChat(() => JSON.stringify({ alt, confidence: 'high' }));
  const vault = tmp();
  try {
    await draft(work, { url: chat.url, log: () => {} });
    proposals(work, vault, { root: REPO, now: new Date('2026-11-23T12:00:00Z') });
    const dir = path.join(vault, 'Curation', 'Proposals');
    const linden = jobsAll.find((j) => j.id.startsWith('a16fb7_b571d98a'));
    // A stale note for a page that no longer has anything to propose, still in draft.
    fs.writeFileSync(path.join(dir, '2026-11-23 Alt text - Mount Ida Event Barn (venue).md'), '---\ntype: "proposal"\nstatus: "draft"\ntarget: "/venue/mount-ida-event-barn"\nfield: "alt"\n---\n# old\n');
    const calls = chat.calls.length;
    alt = 'Bistro lights over a brick courtyard reception at Linden Row Inn';
    const r = await draft(work, { url: chat.url, redo: [linden.file], log: () => {} });
    assert.equal(r.drafted, 1);
    assert.equal(chat.calls.length, calls + 1);
    const covers = jobsAll.filter((j) => !j.skip && j.uses.some((u) => u.path === '/venue')).length;
    assert.equal((await draft(work, { url: chat.url, redoPages: ['/venue'], log: () => {} })).drafted, covers);
    const before = fs.readFileSync(path.join(dir, '2026-11-23 Alt text - UPLIGHTING.md'), 'utf8');
    const p = proposals(work, vault, { root: REPO, now: new Date('2026-11-23T12:00:00Z'), force: true, only: ['/venue', '/venue/linden-row-inn', '/venue/mount-ida-event-barn'] });
    assert.ok(p.removed.includes('2026-11-23 Alt text - Mount Ida Event Barn (venue).md'));
    assert.ok(!fs.existsSync(path.join(dir, '2026-11-23 Alt text - Mount Ida Event Barn (venue).md')));
    assert.match(fs.readFileSync(path.join(dir, '2026-11-23 Alt text - Linden Row Inn (venue).md'), 'utf8'), /: Bistro lights over a brick courtyard reception at Linden Row Inn$/m);
    assert.match(fs.readFileSync(path.join(dir, '2026-11-23 Alt text - Pictures by Venue.md'), 'utf8'), /Linden Row Inn/);
    // Pages not named in --only are left exactly as they were.
    assert.equal(fs.readFileSync(path.join(dir, '2026-11-23 Alt text - UPLIGHTING.md'), 'utf8'), before);
    assert.ok(todo.length > 0);
  } finally {
    await chat.close();
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('decisions from the review page apply to every page where the photo has no alt text, and only approved ones', () => {
  const root = contentCopy();
  const dir = tmp();
  try {
    const multi = jobsAll.find((j) => !j.skip && new Set(j.uses.map((u) => u.path)).size > 1 && j.uses.every((u) => u.file !== 'content/venues.json'));
    const other = jobsAll.find((j) => !j.skip && j.id !== multi.id);
    // As the artifact database tool saves them: one file per document, the body under data.
    fs.writeFileSync(path.join(dir, `${multi.id}.json`), JSON.stringify({ id: multi.id, data: { status: 'approved', alt: 'Bistro lights over a tent [at night]', basedOn: '', edited: true }, version: 2 }));
    fs.writeFileSync(path.join(dir, `${other.id}.json`), JSON.stringify({ status: 'skipped', alt: '' }));
    const decisions = readDecisions(dir);
    assert.equal(decisions.length, 2);
    const r = applyDecisions(decisions, { root });
    assert.equal(r.approved, 1);
    assert.equal(r.applied, multi.uses.length);
    for (const u of multi.uses) assert.match(fs.readFileSync(path.join(root, u.file), 'utf8'), /!\[Bistro lights over a tent \(at night\)\]\(wix:/);
    assert.equal(applyDecisions(decisions, { root }).applied, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
