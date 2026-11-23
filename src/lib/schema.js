import site from '../data/site.json';
import { trail } from './entries.js';
import { shareImage } from './share.js';

const business = () => ({
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${site.url}/#business`,
  name: site.name,
  url: site.url,
  // The live site's image was its logo on the previous host; this is our own copy.
  image: `${site.url}/img/logo.png`,
  telephone: site.phone,
  email: site.email,
  address: {
    '@type': 'PostalAddress',
    streetAddress: site.address.street,
    addressLocality: site.address.city,
    addressRegion: site.address.region,
    postalCode: site.address.postalCode,
    addressCountry: site.address.country,
  },
  areaServed: site.serviceAreas.map((name) => ({ '@type': 'City', name })),
});

function breadcrumbs(entry, entries) {
  const crumbs = trail(entry, entries, site.nav);
  if (!crumbs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem', position: i + 1, name: c.name, item: site.url + (c.path === '/' ? '' : c.path),
    })),
  };
}

const plain = (md) => md
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\\([\\`*_\[\]<>])/g, '$1')
  .replace(/[*_`]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Questions are the headings that follow the <!-- faq --> marker in the body.
function faq(entry) {
  const at = (entry.body || '').indexOf('<!-- faq -->');
  if (at < 0) return null;
  const parts = entry.body.slice(at).split(/^#{2,4} (.+)$/m).slice(1);
  const pairs = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const answer = plain(parts[i + 1].split('<!--')[0]);
    if (answer) pairs.push({ '@type': 'Question', name: plain(parts[i]), acceptedAnswer: { '@type': 'Answer', text: answer } });
  }
  return pairs.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: pairs } : null;
}

/** JSON-LD blocks for one page. */
export function schemaFor(entry, entries) {
  const out = [business()];
  // The site name Google shows comes from this block, which the live home page has.
  // No SearchAction: /search on this site does not take a query.
  if (entry.data.path === '/') out.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: site.shortName, url: site.url });
  const crumbs = breadcrumbs(entry, entries);
  if (crumbs) out.push(crumbs);
  const questions = faq(entry);
  if (questions) out.push(questions);
  const s = entry.data.schema;
  // Our own copy of the page's share photo; left out when we do not hold it.
  const image = shareImage(entry.data.og?.['og:image'])?.url;
  if (s && s['@type'] === 'BlogPosting') {
    out.push({ '@context': 'https://schema.org', ...s, mainEntityOfPage: entry.data.canonical,
      ...(image ? { image } : {}), publisher: { '@id': `${site.url}/#business` } });
  }
  if (s && s['@type'] === 'Product') {
    out.push({ '@context': 'https://schema.org', ...s, url: entry.data.canonical, ...(image ? { image } : {}) });
  }
  return out;
}
