// node --test test/vault-sync.test.js   (needs no build)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sync, parseEntry, codeConstants } from '../tools/vault-sync.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wlc-vault-'));
const read = (dir, rel) => fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf8');
const contentFiles = ['pages', 'posts', 'products'].flatMap((c) => fs.readdirSync(new URL(`../content/${c}/`, import.meta.url)).filter((f) => f.endsWith('.md')));

function notesIn(dir) {
  const out = new Set();
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name), `${rel}${e.name}/`);
      else if (e.name.endsWith('.md')) out.add(`${rel}${e.name.slice(0, -3)}`);
    }
  };
  walk(dir, '');
  return out;
}

test('writes one generated note per content file, the hubs, the seeds and the Glow export', () => {
  const vault = tmp();
  try {
    const r = sync({ vault, now: new Date('2026-11-23T12:00:00Z') });
    assert.equal(r.counts.pages, contentFiles.length);
    const site = [...r.files.keys()].filter((f) => /^Site\/(Pages|Posts|Products|Catalog Pages|Blog Listings)\//.test(f));
    assert.equal(site.length, contentFiles.length);
    for (const f of site) assert.match(read(vault, f), /\ngenerated: true\n---\n/, f);
    for (const hub of ['Site Index', 'Site Map', 'Services', 'Catalog', 'Blog', 'Venues', 'Photos', 'Redirects', 'Content Gaps', 'Copy in Code', 'Business Facts']) {
      assert.ok(fs.existsSync(path.join(vault, 'Site', `${hub}.md`)), hub);
    }
    for (const seed of ['00 - Website WLC Home.md', 'GLOW.md', 'CLAUDE.md', 'AGENTS.md', 'DECISIONS.md', 'Knowledge/Brand Voice.md', 'Templates/Proposal.md', '.obsidian/templates.json']) {
      assert.ok(fs.existsSync(path.join(vault, ...seed.split('/'))), seed);
    }
    assert.ok(fs.statSync(path.join(vault, 'Curation', 'Proposals')).isDirectory());
    assert.match(read(vault, 'Site/Pages/uplighting.md'), /source: "content\/pages\/uplighting\.md"/);
    const copy = read(vault, 'Site/Copy in Code.md');
    assert.match(copy, /## BOOKING[\s\S]*12 months or more/);
    // Every constant is found, wherever it lives; the booking scale is read from the data the quote page and email share.
    assert.doesNotMatch(copy, /Not found as a plain literal/);
    const booking = copy.slice(copy.indexOf('## BOOKING'));
    assert.match(booking, /`BOOKING_SCALE` in `server\/lib\/quote-form-data\.js`, the file a proposal must target/);
    assert.match(booking, /both the \/get-a-quote page and the notification email/);
    assert.match(booking, /Two rows carry a separate `emailLabel`[^\n]*"2 to 3 months" \(email: "1 to 3 months"\)/);
    assert.match(booking, /\| Lead time \| Availability \| Bars of 6 \|\n\|---\|---\|---\|\n\| 12 months or more \| Certain \| 6 \|/);
    assert.match(copy, /## DISCIPLINE[\s\S]*`SERVICE_GROUP` in `server\/lib\/quote-form-data\.js`[\s\S]*\| LED Dance Floor \| de \|/);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('a second run with nothing new writes nothing', () => {
  const vault = tmp();
  try {
    sync({ vault, now: new Date('2026-11-23T12:00:00Z') });
    const r = sync({ vault, now: new Date('2026-11-24T12:00:00Z') });
    assert.equal(r.written, 0);
    assert.equal(r.seeded, 0);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('never overwrites or deletes a note it did not generate, and removes generated notes whose page is gone', () => {
  const vault = tmp();
  try {
    fs.mkdirSync(path.join(vault, 'Site', 'Pages'), { recursive: true });
    fs.writeFileSync(path.join(vault, 'GLOW.md'), '# Glow\n\nOur own rules: always say hello.\n');
    fs.writeFileSync(path.join(vault, 'Site', 'Pages', 'my-notes.md'), '# Notes I keep here\n');
    fs.writeFileSync(path.join(vault, 'Site', 'Pages', 'gone-page.md'), '---\ntype: "page"\ngenerated: true\n---\n# Gone\n');
    const r = sync({ vault });
    assert.equal(read(vault, 'GLOW.md'), '# Glow\n\nOur own rules: always say hello.\n');
    assert.ok(fs.existsSync(path.join(vault, 'Site', 'Pages', 'my-notes.md')));
    assert.ok(!fs.existsSync(path.join(vault, 'Site', 'Pages', 'gone-page.md')));
    assert.equal(r.removed, 1);
    // The brief carries the vault's own copy of the rules, not the seed.
    assert.match(read(vault, '_glow/brief.md'), /always say hello/);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('every wiki link in the generated notes points at a note that exists', () => {
  const vault = tmp();
  try {
    sync({ vault });
    const notes = notesIn(vault);
    const missing = [];
    for (const n of notes) {
      if (!n.startsWith('Site/')) continue;
      for (const m of read(vault, `${n}.md`).matchAll(/\[\[([^\]|#\\]+)/g)) if (!notes.has(m[1])) missing.push(`${n} -> ${m[1]}`);
    }
    assert.deepEqual(missing, []);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('the Glow export is small enough to load and every chunk is well formed', () => {
  const vault = tmp();
  const glow = tmp();
  try {
    const r = sync({ vault, glowDir: glow });
    const brief = read(vault, '_glow/brief.md');
    assert.ok(brief.length < 20000, `brief is ${brief.length} characters`);
    assert.match(brief, /Draft only/);
    assert.match(brief, /Em-dashes/);
    const lines = read(vault, '_glow/index.jsonl').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.length, r.chunks);
    const ids = new Set();
    for (const c of lines) {
      assert.ok(c.id && c.note && c.title && c.type && c.text, c.id);
      assert.ok(c.text.length <= 1800, `${c.id} is ${c.text.length} characters`);
      assert.ok(!ids.has(c.id), `duplicate ${c.id}`);
      ids.add(c.id);
      assert.ok(!c.note.startsWith('_glow') && !c.note.startsWith('Templates/'), c.note);
    }
    assert.ok(lines.some((c) => c.note === 'Site/Pages/uplighting' && c.url === '/uplighting' && c.source === 'content/pages/uplighting.md'));
    assert.ok(lines.some((c) => c.note === 'GLOW' && c.type === 'rules'));
    for (const f of ['brief.md', 'index.jsonl', 'manifest.json']) assert.equal(fs.readFileSync(path.join(glow, f), 'utf8'), read(vault, `_glow/${f}`));
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(glow, { recursive: true, force: true });
  }
});

test('a dry run writes nothing', () => {
  const vault = tmp();
  try {
    const r = sync({ vault, dryRun: true });
    assert.ok(r.files.size > contentFiles.length);
    assert.deepEqual(fs.readdirSync(vault), []);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('front matter is read as one JSON value per line', () => {
  const { data, body } = parseEntry('---\npath: "/x"\nh1: ["A", "B"]\nfacts: ["one"]\n---\n\nHello\n');
  assert.deepEqual(data, { path: '/x', h1: ['A', 'B'], facts: ['one'] });
  assert.equal(body, '\nHello\n');
});

test('copy in code is read only from plain literals', () => {
  const src = "const A = [['x', 1]]; // note\nconst B = [x, 'y'];\nconst C = { k: ['a', null] };\nconst D = [`t${1}`];";
  assert.deepEqual(codeConstants(src, ['A', 'B', 'C', 'D', 'E']), { A: [['x', 1]], C: { k: ['a', null] }, D: ['t1'] });
});
