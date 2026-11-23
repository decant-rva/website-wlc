// Share images (og:image) and structured-data images, served from this site.
//
// The imported front matter keeps each page's og:image as the previous host's URL
// (https://static.wixstatic.com/media/<id>/v1/fill/...). The photo itself is in
// content/photos.json under the same <id>, so the share image points at our own JPEG of
// it instead: the fallback size is the largest JPEG (PNG for transparent photos) we make
// (at most 1200 px wide). Nothing in the built pages refers to the previous host.
import site from '../data/site.json';
import { photos, MEDIA } from './photos.js';

/** The photo ID inside a previous-host media URL, or null. */
export function wixId(url) {
  const m = String(url || '').match(/wixstatic\.com\/media\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** { url, width, height } of our own JPEG for a share image URL, or null when we do not hold the photo. */
export function shareImage(url) {
  const id = wixId(url);
  const p = id && photos[id];
  if (!p?.fallback) return null;
  const width = Number(p.fallback.match(/-(\d+)\.[a-z]+$/i)?.[1]) || p.width;
  return {
    url: `${site.url}${MEDIA}${p.fallback}`,
    width,
    height: Math.round((width * p.height) / p.width),
  };
}

/**
 * A page's og tags with the image moved to this site. When the photo is not held, the
 * image tags are left out rather than pointing at the previous host.
 */
export function ogTags(og = {}) {
  if (!og['og:image']) return { ...og };
  const img = shareImage(og['og:image']);
  const swap = img ? { 'og:image': img.url, 'og:image:width': String(img.width), 'og:image:height': String(img.height) } : {};
  const out = {};
  for (const [k, v] of Object.entries(og)) {
    if (!/^og:image(:|$)/.test(k)) out[k] = v;
    else if (k in swap) out[k] = swap[k];
  }
  return out;
}
