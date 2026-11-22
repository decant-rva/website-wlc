import fs from 'node:fs';

// content/photos.json is written by tools/media.js. Each key is a photo ID.
const file = new URL('../../content/photos.json', import.meta.url);
export const photos = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};

export const MEDIA = '/media/';

const srcset = (list) => list.map(([w, f]) => `${MEDIA}${f} ${w}w`).join(', ');

/** Attributes for a <picture>. Returns null when the photo is not in the manifest. */
export function picture(id, sizes = '(min-width: 60rem) 56rem, 100vw') {
  const p = photos[id];
  if (!p) return null;
  if (p.file) return { single: MEDIA + p.file, width: p.width, height: p.height };
  return {
    avif: srcset(p.avif),
    webp: srcset(p.webp),
    fallback: MEDIA + p.fallback,
    width: p.width,
    height: p.height,
    sizes,
  };
}
