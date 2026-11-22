import site from '../data/site.json';

const business = () => ({
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${site.url}/#business`,
  name: site.name,
  url: site.url,
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
  const parts = entry.data.path.split('/').filter(Boolean);
  if (!parts.length) return null;
  const trail = [{ name: 'Home', item: site.url }];
  const parents = { post: '/blog', product: '/catalog', 'store-category': '/catalog', catalog: '/catalog',
    'blog-category': '/blog', 'blog-tag': '/blog' };
  const parent = entries.get(parents[entry.data.template]);
  if (parent) trail.push({ name: parent.data.h1[0] || parent.data.title, item: parent.data.canonical });
  trail.push({ name: entry.data.h1[0] || entry.data.title, item: entry.data.canonical });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, ...t })),
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
  const crumbs = breadcrumbs(entry, entries);
  if (crumbs) out.push(crumbs);
  const questions = faq(entry);
  if (questions) out.push(questions);
  const s = entry.data.schema;
  if (s && s['@type'] === 'BlogPosting') {
    out.push({ '@context': 'https://schema.org', ...s, mainEntityOfPage: entry.data.canonical,
      image: entry.data.og['og:image'], publisher: { '@id': `${site.url}/#business` } });
  }
  if (s && s['@type'] === 'Product') {
    out.push({ '@context': 'https://schema.org', ...s, url: entry.data.canonical, image: entry.data.og['og:image'] });
  }
  return out;
}
