import { allEntries } from '../lib/entries.js';
import site from '../data/site.json';
import { venuesWithPhotos } from '../lib/templates.js';

export async function GET() {
  const entries = await allEntries();
  const urls = [...entries.values()]
    .filter((e) => !/noindex/i.test(e.data.robots))
    .map((e) => e.data.canonical)
    .concat(venuesWithPhotos().map((v) => `${site.url}/venue/${v.slug}`))
    .sort();
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    urls.map((u) => `<url><loc>${u.replace(/&/g, '&amp;')}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
