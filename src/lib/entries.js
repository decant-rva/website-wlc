import { getCollection } from 'astro:content';

let cache;

/** Every content entry, keyed by its public path. */
export async function allEntries() {
  if (!cache) {
    const lists = await Promise.all(['pages', 'posts', 'products'].map((c) => getCollection(c)));
    cache = new Map(lists.flat().map((e) => [e.data.path, e]));
    if (cache.size !== lists.flat().length) throw new Error('Two content files share the same path');
  }
  return cache;
}

/** First photo ID referenced in an entry body, for listing cards. */
export function firstPhoto(entry) {
  const m = (entry.body || '').match(/\(wix:([^)\s]+)\)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export const LISTING = new Set(['blog-index', 'blog-category', 'blog-tag', 'store-category']);
