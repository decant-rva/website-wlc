// Downloads the original photos referenced by the content files and generates
// the responsive sizes. Originals and generated files live in .media/ (not in
// Git). The manifest, content/photos.json, is committed.
//
//   node tools/media.js            process everything that is missing
//
// Until the storage bucket exists this runs against the local disk. The
// manifest format is the same either way.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const ORIG = path.join(ROOT, '.media/originals');
const OUT = path.join(ROOT, '.media/variants');
const MANIFEST = path.join(ROOT, 'content/photos.json');
const WIDTHS = [480, 800, 1200, 1600];
const SOURCE = 'https://static.wixstatic.com/media/';

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

async function one(id, alt, manifest) {
  const src = path.join(ORIG, id);
  if (!(await exists(src))) {
    const res = await fetch(SOURCE + id);
    if (!res.ok) throw new Error(`download ${res.status}`);
    await fs.writeFile(src, Buffer.from(await res.arrayBuffer()));
  }
  const meta = await sharp(src).metadata();
  if (meta.format === 'svg' || meta.format === 'gif') {
    const file = `${stem(id)}.${meta.format}`;
    await fs.copyFile(src, path.join(OUT, file));
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
        await (fmt === 'avif' ? img.avif({ quality: 55, effort: 3 }) : img.webp({ quality: 78 })).toFile(dest);
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
    await (opaque ? img.jpeg({ quality: 80, mozjpeg: true }) : img.png({ compressionLevel: 9 })).toFile(fdest);
  }
  manifest[id] = entry;
}

await fs.mkdir(ORIG, { recursive: true });
await fs.mkdir(OUT, { recursive: true });
const ids = await referenced();
const manifest = (await exists(MANIFEST)) ? JSON.parse(await fs.readFile(MANIFEST, 'utf8')) : {};
const todo = [...ids].filter(([id]) => !manifest[id]);
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
console.log(`${Object.keys(sorted).length} photos in manifest, ${failed.length} failed`);
for (const f of failed) console.log('  failed', f.join(' '));
