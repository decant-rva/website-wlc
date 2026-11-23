// Tests for the build tools' helpers. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { clearPartials, TMP_PREFIX, writeAtomic } from '../tools/lib/write-atomic.js';
import { fetchOriginal } from '../tools/lib/originals.js';

const tempDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'wlc-tools-'));

test('writeAtomic puts a complete file in place and leaves nothing else', async () => {
  const dir = await tempDir();
  const dest = path.join(dir, 'photo-480.webp');
  await writeAtomic(dest, (tmp) => sharp({ create: { width: 20, height: 10, channels: 3, background: '#123456' } }).webp().toFile(tmp));
  assert.equal((await sharp(dest).metadata()).format, 'webp');
  assert.deepEqual(await fs.readdir(dir), ['photo-480.webp']);
});

test('a write that fails part way leaves no file under the real name', async () => {
  const dir = await tempDir();
  const dest = path.join(dir, 'original.jpg');
  await assert.rejects(writeAtomic(dest, async (tmp) => {
    await fs.writeFile(tmp, 'half a pho');
    throw new Error('connection reset');
  }), /connection reset/);
  assert.deepEqual(await fs.readdir(dir), [], 'neither the real name nor the temporary one is left');
});

test('partial files from an interrupted run are cleared and never look like output', async () => {
  const dir = await tempDir();
  await fs.writeFile(path.join(dir, `${TMP_PREFIX}123-a-480.avif`), 'cut short');
  await fs.writeFile(path.join(dir, 'b-480.avif'), 'whole');
  assert.equal(await clearPartials(dir), 1);
  assert.deepEqual(await fs.readdir(dir), ['b-480.avif']);
});

// Where tools/media.js gets an original it does not have on disk. Fakes only: no bucket, no Wix.
const noWix = async (url) => { throw new Error(`unexpected download from ${url}`); };
const fakeBucket = (objects) => {
  const asked = [];
  return { asked, get: async (key) => { asked.push(key); return key in objects ? { body: objects[key] } : null; } };
};

test('an original only in the bucket is taken from the bucket, never from Wix', async () => {
  const dir = await tempDir();
  const dest = path.join(dir, 'a16fb7_abc~mv2.jpg');
  const bucket = fakeBucket({ 'originals/a16fb7_abc~mv2.jpg': Buffer.from('jpeg bytes') });
  assert.equal(await fetchOriginal('a16fb7_abc~mv2.jpg', dest, { bucket, fetchFn: noWix }), 'bucket');
  assert.equal(await fs.readFile(dest, 'utf8'), 'jpeg bytes');
  assert.deepEqual(bucket.asked, ['originals/a16fb7_abc~mv2.jpg']);
  assert.deepEqual(await fs.readdir(dir), ['a16fb7_abc~mv2.jpg'], 'no temporary file left behind');
});

test('a bucket stream body (as the S3 client returns) is read whole', async () => {
  const dir = await tempDir();
  const dest = path.join(dir, 'x.jpg');
  async function* stream() { yield Buffer.from('part one, '); yield Buffer.from('part two'); }
  assert.equal(await fetchOriginal('x.jpg', dest, { bucket: fakeBucket({ 'originals/x.jpg': stream() }), fetchFn: noWix }), 'bucket');
  assert.equal(await fs.readFile(dest, 'utf8'), 'part one, part two');
  const sdkLike = { transformToByteArray: async () => new Uint8Array([1, 2, 3]) };
  const dest2 = path.join(dir, 'y.jpg');
  await fetchOriginal('y.jpg', dest2, { bucket: fakeBucket({ 'originals/y.jpg': sdkLike }), fetchFn: noWix });
  assert.deepEqual([...(await fs.readFile(dest2))], [1, 2, 3]);
});

test('an original on disk is used as it is: neither the bucket nor Wix is asked', async () => {
  const dir = await tempDir();
  const dest = path.join(dir, 'local.jpg');
  await fs.writeFile(dest, 'already here');
  const bucket = fakeBucket({});
  assert.equal(await fetchOriginal('local.jpg', dest, { bucket, fetchFn: noWix }), 'local');
  assert.deepEqual(bucket.asked, []);
});

test('Wix is the fallback when the bucket does not have the original, or there is no bucket', async () => {
  const dir = await tempDir();
  const wix = [];
  const fetchFn = async (url) => { wix.push(url); return { ok: true, arrayBuffer: async () => new TextEncoder().encode('from wix').buffer }; };
  const bucket = fakeBucket({});
  assert.equal(await fetchOriginal('w.jpg', path.join(dir, 'w.jpg'), { bucket, fetchFn }), 'wix');
  assert.equal(await fetchOriginal('v.jpg', path.join(dir, 'v.jpg'), { bucket: null, fetchFn }), 'wix');
  assert.deepEqual(wix, ['https://static.wixstatic.com/media/w.jpg', 'https://static.wixstatic.com/media/v.jpg']);
  assert.deepEqual(bucket.asked, ['originals/w.jpg']);
});

test('an original found nowhere is an error, which media.js reports as unavailable, and leaves no file', async () => {
  const dir = await tempDir();
  const dest = path.join(dir, 'gone.jpg');
  const fetchFn = async () => ({ ok: false, status: 403 });
  await assert.rejects(fetchOriginal('gone.jpg', dest, { bucket: fakeBucket({}), fetchFn }), /not in the bucket or on the previous host \(download 403\)/);
  assert.deepEqual(await fs.readdir(dir), []);
});
