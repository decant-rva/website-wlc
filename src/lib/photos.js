import fs from 'node:fs';
import path from 'node:path';

// content/photos.json is written by tools/media.js. Each key is a photo ID.
// Resolved from the project root because this module is bundled for pages.
const file = path.resolve(process.cwd(), 'content/photos.json');
export const photos = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};

export const MEDIA = '/media/';

const srcset = (list) => list.map(([w, f]) => `${MEDIA}${f} ${w}w`).join(', ');

/**
 * Phones with 3x screens would otherwise fetch a photo three times as wide as it is shown:
 * a 360 px wide photo takes the 1200 px file. Past 2x the difference is not visible in a
 * photo, so on screens of 2.5x or more the narrow-screen width is given as two thirds of
 * itself, which makes the browser pick the file it would pick at 2x.
 * "(min-width: 62rem) 24rem, 100vw" becomes "(min-width: 62rem) 24rem, (min-resolution: 2.5dppx) 67vw, 100vw".
 */
export function capDensity(sizes) {
  const parts = String(sizes).split(',').map((s) => s.trim());
  const last = parts[parts.length - 1];
  const vw = /^(\d+(?:\.\d+)?)vw$/.exec(last);
  const len = /^(\d+(?:\.\d+)?)(rem|px)$/.exec(last);
  let capped;
  if (vw) capped = `${Math.round((Number(vw[1]) * 2) / 3)}vw`;
  else if (len) capped = `${+((Number(len[1]) * 2) / 3).toFixed(2)}${len[2]}`;
  else return sizes;
  return [...parts.slice(0, -1), `(min-resolution: 2.5dppx) ${capped}`, last].join(', ');
}

/** Attributes for a <picture>. Returns null when the photo is not in the manifest. */
export function picture(id, sizes = '(min-width: 60rem) 56rem, 100vw') {
  sizes = capDensity(sizes);
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
