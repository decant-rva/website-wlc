export function GET() {
  const staging = import.meta.env.PUBLIC_STAGING === '1';
  const body = staging
    ? 'User-agent: *\nDisallow: /\n'
    : 'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\n\nSitemap: https://www.weddinglightingco.com/sitemap.xml\n';
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
