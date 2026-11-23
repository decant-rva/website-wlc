// Makes an uploaded file safe to store, email and open.
//
// Nothing the visitor sent is passed on as it arrived. Each file is decoded as a
// picture and written out again as a fresh JPEG. That:
//   - proves it really is a picture (a renamed program or document fails to decode),
//   - drops anything hidden in or after the image data, and all metadata,
//     including the GPS position phones put in photos,
//   - caps the size, so a "decompression bomb" cannot exhaust memory,
//   - turns every format into one that every mail app shows.
// SVG is refused outright because it can carry scripts. PDFs are not accepted.
import sharp from 'sharp';

// One small shared CPU serves the whole site, so photos are cleaned one at a time with one
// libvips thread and no cache. A burst of large uploads then queues instead of exhausting
// the machine's 512 MB and the worker threads that page reads also use.
sharp.concurrency(1);
sharp.cache(false);
let queue = Promise.resolve();
const oneAtATime = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

const ALLOWED = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'avif', 'tiff']);
const MAX_PIXELS = 50_000_000;   // about 7000 x 7000
const MAX_EDGE = 2000;

/** Returns { bytes, mime, width, height } or null when the file is not a usable picture. */
export function safePhoto(input) {
  return oneAtATime(() => clean(input));
}

async function clean(input) {
  try {
    const img = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error', animated: false });
    const meta = await img.metadata();
    if (!ALLOWED.has(meta.format)) return null;
    const { data, info } = await img
      .rotate()                                   // apply the phone's orientation, then forget it
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })       // no metadata is written unless asked for
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, mime: 'image/jpeg', width: info.width, height: info.height };
  } catch {
    return null;
  }
}
