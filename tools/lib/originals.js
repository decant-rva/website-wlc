// Where tools/media.js gets an original photo it does not have on this disk.
//
// 1. The bucket's originals/ prefix, when bucket settings are present. Every original that was
//    ever uploaded with --upload is there, so sizes can be rebuilt after the Wix plan ends.
// 2. The previous host (static.wixstatic.com), only when the bucket does not have it.
//
// The bucket client and fetch are passed in, so tests can use fakes and never touch the network.
import fs from 'node:fs/promises';
import { writeAtomic } from './write-atomic.js';

export const WIX = 'https://static.wixstatic.com/media/';

const exists = (p) => fs.access(p).then(() => true, () => false);

/** A bucket object body (Buffer, Uint8Array, SDK stream or async iterable) as one Buffer. */
export async function toBuffer(body) {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body?.transformToByteArray === 'function') return Buffer.from(await body.transformToByteArray());
  if (body && typeof body[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const c of body) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks);
  }
  throw new Error('unreadable bucket object');
}

/**
 * Makes sure the original for `id` is at `dest`. Returns where it came from: 'local', 'bucket'
 * or 'wix'. Throws when no source has it. The file is written under a temporary name and
 * renamed when complete.
 *   bucket: { get(key) -> { body } | null } or null when no bucket is configured
 *   prefix: the bucket's originals prefix ("originals/")
 */
export async function fetchOriginal(id, dest, { bucket = null, prefix = 'originals/', fetchFn = fetch, source = WIX } = {}) {
  if (await exists(dest)) return 'local';
  if (bucket) {
    const obj = await bucket.get(prefix + id);
    if (obj) {
      const bytes = await toBuffer(obj.body);
      await writeAtomic(dest, (tmp) => fs.writeFile(tmp, bytes));
      return 'bucket';
    }
  }
  const res = await fetchFn(source + id);
  if (!res.ok) throw new Error(`not in ${bucket ? 'the bucket or ' : ''}on the previous host (download ${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeAtomic(dest, (tmp) => fs.writeFile(tmp, bytes));
  return 'wix';
}
