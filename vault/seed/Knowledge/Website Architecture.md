---
type: knowledge
---
# Website architecture

A summary. The full design and the reasons behind it are in the website repository: `docs/phase-1/ARCHITECTURE.md` (Phase 2) and `docs/phase-1/PHASE-1-REPORT.md` (the audit of the Wix site). The repository's `README.md` is the working manual.

## The shape

```
Visitor ── Cloudflare (DNS, cache) ── fly.io app "wlc-site" (iad)
                                        ├─ static HTML and CSS, built by Astro
                                        ├─ /media/*     ── Tigris bucket (photos)
                                        ├─ /api/quote   ── Neon Postgres ── GigFriend /lead-intake
                                        │                              └─ notification email to info@
                                        └─ /health      ── reports the running commit
```

Planned, not built: `/api/subscribe` (newsletter) and `/admin` (the blog admin in section 9 of the architecture document). [[DECISIONS#D-001 — The vault is the curation surface|D-001]] proposes curating through this vault instead of building the admin first.

## Principles

1. Every public page is plain HTML written at build time. No content is rendered in the browser.
2. The public site keeps working if the database, email or GigFriend is down. Only the quote form needs the server, and it falls back to "call or email us".
3. One source of truth for content: the Git repository.
4. Nothing from Wix is loaded at runtime.

## Stack

| Layer | Choice |
|---|---|
| Pages | Astro, static output. Content collections check every page's front matter at build time |
| Server | Fastify on Node, `server/server.js`: serves `dist/`, redirects, `/media`, `/health`, and the quote route `server/quote.js` |
| Database | Neon Postgres project `wlc-site`, through `pg`. Numbered SQL migrations in `migrations/`, applied at start-up |
| Photos | Tigris bucket in production (`server/lib/bucket.js`); `.media/variants` on disk locally. `sharp` makes AVIF and WebP sizes |
| Email | `smtp.gmail.com`, signed in as a Workspace user with an app password ([[DECISIONS#D-008 — Quote notifications are sent through Gmail|D-008]]) |
| CI | GitHub Actions: build, launch freeze check (`npm run check:inventory`), tests (`node --test`). A separate manual workflow fills the photo bucket |

## Environments

| | App | Notes |
|---|---|---|
| Production | `wlc-site` | `www.weddinglightingco.com` once DNS moves from Wix |
| Staging | `wlc-site-staging` | `staging.weddinglightingco.com`. Password on every request, `noindex`, serves the `proposed` redirects, its own database branch |

Deploy: `tools/deploy.sh staging` or `tools/deploy.sh production`. `/health` shows the commit that is running. Secrets are fly.io secrets only, never in the repository.

## Where things are in the repository

| Path | What it is |
|---|---|
| `content/pages`, `content/posts`, `content/products` | One Markdown file per public URL. See [[Knowledge/Content Model|Content Model]] |
| `content/*.json` | Redirects, photo manifest, venues, chandelier sorting |
| `src/data/site.json` | Name, address, phone, menus, footer, social links |
| `src/lib/templates.js` | One layout function per page type, and some copy set in code ([[Site/Copy in Code|Copy in Code]]) |
| `src/layouts/Base.astro` | Header, footer, closing band |
| `src/styles/site.css` | The Beam Lines stylesheet ([[Knowledge/Design System - Beam Lines|Design System]]) |
| `server/` | The Fastify app and the quote route |
| `server/lib/quote-form-data.js` | What the quote page and the notification email share: the "When to book" scale and the service colour groups ([[Site/Copy in Code|Copy in Code]]) |
| `tools/` | Importer, photo processing, inventory check, accessibility check, deploy, and `vault-sync.js`, which writes this vault's `Site/` and `_glow/` |
| `test/` | Route tests, quote tests, vault sync tests |
| `vault/seed/` | The starting copy of this vault's hand-written notes |

## Commands

```
npm ci
npm run build              # build the site into dist/
npm run check:inventory    # the launch freeze check
node --test                # tests (after a build)
npm start                  # http://localhost:8080
npm run vault -- "A:\Website-WLC"   # refresh this vault
```
