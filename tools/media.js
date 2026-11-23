// Downloads the original photos referenced by the content files and generates
// the responsive sizes. Originals and generated files live in .media/ (not in
// Git). The manifest, content/photos.json, is committed.
//
//   node tools/media.js            process photos that are not in the manifest yet
//   node tools/media.js --rebuild  also regenerate any photo whose files are not on this disk
//   node tools/media.js --upload   then copy originals and generated sizes to the bucket
//
// --rebuild is for a fresh checkout: the manifest is in Git but the files are not.
// --upload needs the bucket settings (see server/lib/bucket.js); it skips files already there.
//
// An original that is not in .media/originals is read from the bucket's originals/ prefix when
// the bucket settings are present, and from the previous host (Wix) only if the bucket does not
// have it (tools/lib/originals.js). So after the Wix plan ends, sizes can still be rebuilt from
// the bucket. A new photo: put the file in .media/originals/<id>, refer to it as wix:<id> in the
// Markdown, and run with --upload.
//
// Every file is written under a temporary name and renamed when complete, so an interrupted
// run never leaves a cut-short file that a later run would skip and upload. The run exits with
// status 1 when a photo failed, except photos listed in content/photos-unavailable.json (known
// to be gone from the previous host), which are reported only; --upload is refused then.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { clearPartials, TMP_PREFIX, writeAtomic } from './lib/write-atomic.js';
import { fetchOriginal } from './lib/originals.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const ORIG = path.join(ROOT, '.media/originals');
const OUT = path.join(ROOT, '.media/variants');
const MANIFEST = path.join(ROOT, 'content/photos.json');
const WIDTHS = [480, 800, 1200, 1600];

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

async function referenced() {
  const ids = new Map();
  for await (const file of walk(path.join(ROOT, 'content'))) {
    const text = await fs.readFile(file, 'utf8');
    for (const m of text.matchAll(/!\[((?:\\.|[^\]\\])*)\]\(wix:([^)\s]+)\)/g)) {
      if (!ids.has(m[2])) ids.set(m[2], m[1].replace(/\\(.)/g, '$1'));
    }
    for (const m of text.matchAll(/wixstatic\.com\/media\/([^/"\s]+)/g)) {
      if (!ids.has(m[1])) ids.set(m[1], '');
    }
  }
  return ids;
}

const exists = (p) => fs.access(p).then(() => true, () => false);
const stem = (id) => id.replace(/~mv2/, '').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

// Where each original came from this run: local, bucket or wix.
const sources = { local: 0, bucket: 0, wix: 0 };
let originals = null; // the bucket client, when the bucket settings are present

async function one(id, alt, manifest) {
  const src = path.join(ORIG, id);
  sources[await fetchOriginal(id, src, { bucket: originals })] += 1;
  const meta = await sharp(src).metadata();
  if (meta.format === 'svg' || meta.format === 'gif') {
    const file = `${stem(id)}.${meta.format}`;
    await writeAtomic(path.join(OUT, file), (tmp) => fs.copyFile(src, tmp));
    manifest[id] = { width: meta.width, height: meta.height, alt, file };
    return;
  }
  const widths = WIDTHS.filter((w) => w < meta.width).concat(Math.min(meta.width, 2000));
  const entry = { width: meta.width, height: meta.height, alt, avif: [], webp: [], fallback: '' };
  for (const w of widths) {
    for (const fmt of ['avif', 'webp']) {
      const file = `${stem(id)}-${w}.${fmt}`;
      const dest = path.join(OUT, file);
      if (!(await exists(dest))) {
        const img = sharp(src).rotate().resize({ width: w, withoutEnlargement: true });
        await writeAtomic(dest, (tmp) => (fmt === 'avif' ? img.avif({ quality: 55, effort: 3 }) : img.webp({ quality: 78 })).toFile(tmp));
      }
      entry[fmt].push([w, file]);
    }
  }
  const fw = Math.min(meta.width, 1200);
  const opaque = !meta.hasAlpha;
  entry.fallback = `${stem(id)}-${fw}.${opaque ? 'jpg' : 'png'}`;
  const fdest = path.join(OUT, entry.fallback);
  if (!(await exists(fdest))) {
    const img = sharp(src).rotate().resize({ width: fw, withoutEnlargement: true });
    await writeAtomic(fdest, (tmp) => (opaque ? img.jpeg({ quality: 80, mozjpeg: true }) : img.png({ compressionLevel: 9 })).toFile(tmp));
  }
  manifest[id] = entry;
}

await fs.mkdir(ORIG, { recursive: true });
await fs.mkdir(OUT, { recursive: true });
{
  const { bucket, bucketConfigured, ORIGINALS } = await import('../server/lib/bucket.js');
  if (bucketConfigured()) {
    const b = bucket();
    originals = { get: (key) => b.get(key).then((o) => (o ? { body: o.body } : null)) };
    console.log(`originals not on this disk are read from the bucket (${ORIGINALS}) first`);
  }
}
const cleared = (await clearPartials(ORIG)) + (await clearPartials(OUT));
if (cleared) console.log(`removed ${cleared} partial files left by an interrupted run`);
const ids = await referenced();
const manifest = (await exists(MANIFEST)) ? JSON.parse(await fs.readFile(MANIFEST, 'utf8')) : {};
const rebuild = process.argv.includes('--rebuild');
const onDisk = new Set(await fs.readdir(OUT));
const filesOf = (e) => (e.file ? [e.file] : [...e.avif, ...e.webp].map((x) => x[1]).concat(e.fallback));
const todo = [...ids].filter(([id]) => !manifest[id] || (rebuild && filesOf(manifest[id]).some((f) => !onDisk.has(f))));
let done = 0;
const failed = [];
const queue = [...todo];
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let job = queue.shift(); job; job = queue.shift()) {
    try { await one(job[0], job[1], manifest); } catch (e) { failed.push([job[0], String(e.message || e)]); }
    if (++done % 50 === 0) {
      console.log(`${done}/${todo.length}`);
      await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 1));
    }
  }
}));
const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
await fs.writeFile(MANIFEST, JSON.stringify(sorted, null, 1) + '\n');
const UNAVAILABLE = path.join(ROOT, 'content/photos-unavailable.json');
const known = new Set(Object.keys((await exists(UNAVAILABLE)) ? JSON.parse(await fs.readFile(UNAVAILABLE, 'utf8')).photos || {} : {}));
const expected = failed.filter(([id]) => known.has(id));
const unexpected = failed.filter(([id]) => !known.has(id));
console.log(`originals: ${sources.local} on disk, ${sources.bucket} from the bucket, ${sources.wix} from the previous host`);
console.log(`${Object.keys(sorted).length} photos in manifest, ${failed.length} failed (${expected.length} already listed as unavailable, ${unexpected.length} new)`);
for (const f of expected) console.log('  unavailable', f.join(' '));
for (const f of unexpected) console.log('  FAILED', f.join(' '));
if (unexpected.length) {
  process.exitCode = 1;
  if (process.argv.includes('--upload')) {
    console.error('Not uploading: fix or list the failed photos first (content/photos-unavailable.json).');
    process.exit(1);
  }
}

if (process.argv.includes('--upload')) {
  const { bucket, bucketConfigured, TYPES, VARIANTS, ORIGINALS } = await import('../server/lib/bucket.js');
  if (!bucketConfigured()) { console.error('The bucket settings are missing: BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.'); process.exit(1); }
  const b = bucket();
  let sent = 0;
  for (const [dir, prefix] of [[OUT, VARIANTS], [ORIG, ORIGINALS]]) {
    const have = await b.list(prefix);
    const jobs = (await fs.readdir(dir)).filter((f) => !f.startsWith(TMP_PREFIX) && !have.has(prefix + f));
    await Promise.all(Array.from({ length: 8 }, async () => {
      for (let f = jobs.shift(); f; f = jobs.shift()) {
        const ext = f.split('.').pop().toLowerCase();
        await b.put(prefix + f, await fs.readFile(path.join(dir, f)), TYPES[ext] || 'application/octet-stream');
        if (++sent % 200 === 0) console.log(`uploaded ${sent}`);
      }
    }));
  }
  console.log(`${sent} files uploaded to the bucket`);
}
