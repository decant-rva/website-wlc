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

const PARENT = { post: '/blog', product: '/catalog', 'store-category': '/catalog', catalog: '/catalog',
  'blog-category': '/blog', 'blog-tag': '/blog' };

/** Breadcrumb trail for a page: [{ name, path }], home first. Empty on the home page. */
export function trail(entry, entries, nav) {
  if (entry.data.path === '/') return [];
  const out = [{ name: 'Home', path: '/' }];
  let parentPath = PARENT[entry.data.template];
  if (!parentPath) {
    const group = nav.find((n) => (n.children || []).some((c) => c.href === entry.data.path));
    if (group) parentPath = group.href;
  }
  const parent = parentPath && entries.get(parentPath);
  if (parent) {
    const label = nav.find((n) => n.href === parentPath);
    out.push({ name: label ? label.label : parent.data.title.split(' | ')[0], path: parentPath });
  }
  const own = nav.flatMap((n) => [n, ...(n.children || [])]).find((n) => n.href === entry.data.path);
  out.push({ name: own ? own.label : entry.data.title.split(' | ')[0], path: entry.data.path });
  return out;
}

/** Posts, newest first. */
export async function latestPosts(n) {
  const entries = await allEntries();
  return [...entries.values()]
    .filter((e) => e.data.template === 'post')
    .sort((a, b) => String(b.data.schema?.datePublished || '').localeCompare(String(a.data.schema?.datePublished || '')))
    .slice(0, n);
}
