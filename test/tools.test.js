// Tests for the build tools' helpers. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { clearPartials, TMP_PREFIX, writeAtomic } from '../tools/lib/write-atomic.js';

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
