// Writes a file so that it is either complete or absent: the content goes to a
// temporary name in the same folder and is renamed into place only when it is
// whole. tools/media.js skips any file that already exists and uploads every file
// in its folders, so a file cut short by an interrupted run must never appear
// under its real name.
import fs from 'node:fs/promises';
import path from 'node:path';

/** Prefix of the temporary names. Files with it are never real output. */
export const TMP_PREFIX = '.partial-';

/**
 * write(tmp) must write the whole file to the path it is given. The temporary name keeps
 * the real extension at its end, for writers that choose a format from it (sharp's toFile).
 */
export async function writeAtomic(dest, write) {
  const tmp = path.join(path.dirname(dest), `${TMP_PREFIX}${process.pid}-${path.basename(dest)}`);
  try {
    await write(tmp);
    await fs.rename(tmp, dest);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

/** Removes temporary files an interrupted run left in dir. Returns how many there were. */
export async function clearPartials(dir) {
  const left = (await fs.readdir(dir)).filter((f) => f.startsWith(TMP_PREFIX));
  await Promise.all(left.map((f) => fs.rm(path.join(dir, f), { force: true })));
  return left.length;
}
