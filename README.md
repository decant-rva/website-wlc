# website-wlc

The Wedding Lighting Co website. Static HTML built with Astro, served by a small
Fastify app on fly.io.

Start with `docs/ARCHITECTURE.md` for the design and the reasons behind it.
`docs/phase-1/` holds the audit of the previous site that this build is checked
against.

## Layout

| Path | What it is |
|---|---|
| `content/pages`, `content/posts`, `content/products` | One Markdown file per public URL. The front matter is the page's title, description, canonical and H1 |
| `content/redirects.json` | Every redirect the site serves. `proposed` entries are served on staging only until approved |
| `content/photos.json` | Photo manifest written by `tools/media.js`: dimensions, alt text and generated sizes |
| `src/` | Layout, page template, components, styles |
| `server/server.js` | Serves `dist/`, redirects, `/media`, `/health` |
| `tools/` | Importer, photo processing, inventory check, deploy script |
| `test/` | Route tests: status codes, redirects, 404, sitemap |

## Working on it

```bash
npm ci
npm run media        # download and resize photos into .media/ (first run takes a while)
npm run build
npm run check:inventory
node --test
npm start            # http://localhost:8080
```

Behind a proxy, Node's fetch needs `NODE_USE_ENV_PROXY=1` for `npm run media`.

After `npm run media` adds photos, delete `.astro/` before building. Astro caches
rendered Markdown and will not notice that the photo manifest changed.

## Design

The theme is "Beam Lines": navy, amber and the logo blue, with slanted bands and torn-tape labels.
League Spartan (700, 800), DM Sans (400, 500) and Kalam (700) are self-hosted from `public/fonts`,
all under the SIL Open Font License.

`src/styles/site.css` holds every rule from the design build-out. `npm run build` runs
`tools/prune-css.js` afterwards, which removes the rules no built page uses. Colours are custom
properties at the top of the stylesheet; `--white` is the single grey-white used site-wide.

`src/layouts/Base.astro` is the header, footer and closing band. `src/lib/templates.js` has one
function per page type (home, services, service, catalog, chandeliers, product, blog, post, about,
contact, FAQ, packages, reviews). Each reads the page's Markdown and lays it out. A page with no
template of its own gets the navy header and its Markdown as prose, laid out by
`src/lib/rehype-layout.js`.

Content that templates read besides the Markdown: `facts` in a service page's front matter (the
colour tiles), `content/chandeliers.json` (the chandelier sorting), and the photo and price pairs
in `content/pages/wedding-decor-package-cost.md`.

Every page has one main heading (owner decision, 22 November 2026). Where the previous site had
several H1s the first is kept; where it had none, the heading is an H2 styled the same, so the
launch freeze on H1 text holds. `npm run check:inventory` enforces both.

Template photos are `<picture>` elements with AVIF, WebP and a JPEG fallback. The stylesheet sets
`picture { display: contents }` and hides `<source>` from layout, so a photo lays out as a bare
`<img>` would.

`node tools/a11y.js http://localhost:8080` runs the automated WCAG checks
against a running copy.

## Editing content

Edit the Markdown file for the page and deploy. The path in the front matter is
the public URL and must not change without adding a redirect.

Photos are written as `![alt text](wix:PHOTO_ID)`. The build replaces each one
with a `<picture>` that has AVIF and WebP sources, explicit dimensions and lazy
loading. The `wix:` prefix is only an ID scheme; nothing is loaded from Wix.

## The launch freeze

Until the owner lifts it, titles, meta descriptions, canonicals and H1 text must
match the previous site exactly. `npm run check:inventory` compares the build
with `docs/phase-1/inventory.json` and fails on any difference. CI runs it on
every change.

## Deploying

```bash
tools/deploy.sh staging
tools/deploy.sh production
```

`/health` reports the commit that is running.

## Not built yet

See section 9 and 8a of the architecture document: quote form handler, subscribe
form, photo storage in the bucket, the blog admin and AI drafting.
