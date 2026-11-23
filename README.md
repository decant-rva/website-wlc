# website-wlc

The Wedding Lighting Co website. Static HTML built with Astro, served by a small
Fastify app on fly.io.

Start with `docs/phase-1/ARCHITECTURE.md` for the design and the reasons behind it.
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
contact, FAQ, packages, reviews, quote, pictures by venue). Each reads the page's Markdown and lays it out. A page with no
template of its own gets the navy header and its Markdown as prose, laid out by
`src/lib/rehype-layout.js`.

Content that templates read besides the Markdown: `facts` in a service page's front matter (the
colour tiles), `content/chandeliers.json` (the chandelier sorting), and the photo and price pairs
in `content/pages/wedding-decor-package-cost.md`.

`content/venues.json` is the venue list behind `/venue`. Each venue with at least one photo also
gets a page at `/venue/<slug>` (`src/pages/venue/[slug].astro`). These are the only URLs that were
not on the previous site.

Every page has one main heading (owner decision, 22 November 2026). Where the previous site had
several H1s the first is kept; where it had none, the heading is an H2 styled the same, so the
launch freeze on H1 text holds. `npm run check:inventory` enforces both.

Template photos are `<picture>` elements with AVIF, WebP and a JPEG fallback. The stylesheet sets
`picture { display: contents }` and hides `<source>` from layout, so a photo lays out as a bare
`<img>` would.

`node tools/a11y.js http://localhost:8080` runs the automated WCAG checks
against a running copy. Playwright is a dev dependency; on a new machine also run
`npx playwright install chromium` once for the browser it drives.

`npm run check:perf -- http://localhost:8080` loads one page per template on an emulated
iPhone 13 over a slow connection (150 ms round trip, 1.6 Mbps, CPU 4x slower) and fails if any
page's LCP is over 2.5 s or its CLS over 0.1. It also prints requests and kilobytes before
scrolling against the 10 to 20 request target, without failing on them. Run it against a copy
that has its photos (`npm run media` first); CI has none, so it is not part of CI.

## Photo storage

In production `/media` is served from a Tigris bucket (`server/lib/bucket.js`). Create it once per
app with `fly storage create --app <app>`; that sets `BUCKET_NAME` and the `AWS_*` secrets. Without
them the server reads `.media/variants` from disk, which is how it runs locally.

To fill the bucket, add the same five values as repository secrets and run the `media` workflow from
the Actions tab, or run `node tools/media.js --rebuild --upload` with them in the environment.

`content/photos-unavailable.json` lists photos the content refers to that could not be downloaded
from the previous host (HTTP 403). They are left out of the manifest, so pages skip them. To bring
one back, put the original in `.media/originals/` under its ID and run `npm run media`.

Where `tools/media.js` gets an original that is not in `.media/originals/`: from the bucket's
`originals/` prefix when the bucket settings are in the environment, and from the previous host
(Wix) only when the bucket does not have it. The end of each run says how many came from each
place. Every original uploaded once with `--upload` is in the bucket, so after the Wix plan ends
the sizes can still be rebuilt: run `node tools/media.js --rebuild` with the bucket settings set.
Upload all originals with `--upload` **before** the Wix plan ends.

To add a new photo:

1. Put the file in `.media/originals/` under a new ID, for example `wlc_2027-dover-hall-01.jpg`.
2. Refer to it in the Markdown as `![alt text](wix:wlc_2027-dover-hall-01.jpg)`. The `wix:` prefix is only the ID scheme.
3. Run `node tools/media.js --upload` with the bucket settings set. It makes the sizes, adds the photo to `content/photos.json` and uploads the original and the sizes.
4. Commit `content/photos.json` and the Markdown, then deploy.

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

## Quote form

`POST /api/quote` (`server/quote.js`) checks the request, saves it to Postgres, sends the visitor
to `/quote-sent`, then posts the lead to GigFriend and emails the office (`server/lib/deliver.js`).
A delivery that fails is retried with growing waits, and one email reports anything still
undelivered after an hour.

Uploads are photos only. `server/lib/images.js` decodes each one and writes it out again as a JPEG
of at most 2000 px, so a file that is not really a picture is refused, metadata (including phone GPS)
is dropped, and the visitor's file name is not kept. SVG and PDF are refused. The cleaned photos are
kept in Postgres with the request and shown in the body of the notification email.

| Setting | For |
|---|---|
| `DATABASE_URL` | Neon Postgres, the pooled address. Without it the form answers with the "call or email us" page |
| `DATABASE_URL_UNPOOLED` | Neon's direct address for the same database, used only to apply migrations at start-up |
| `LEAD_INTAKE_URL`, `LEAD_INTAKE_SECRET` | GigFriend `/lead-intake` and its `X-Lead-Token` |
| `SMTP_USER`, `SMTP_PASS` | Google Workspace address the site signs in to the SMTP relay as, and its app password |
| `QUOTE_EMAIL_FROM`, `QUOTE_EMAIL_TO` | Sender (the Workspace user or one of its aliases) and the inbox that receives the notification |
| `SMTP_HOST`, `SMTP_PORT` | Mail server and port. The fly settings files set `smtp.gmail.com`; the port defaults to `587` |
| `PUBLIC_TURNSTILE_SITEKEY` | Build argument (public). When given, the quote page shows the Cloudflare Turnstile widget and loads Cloudflare's script on that page only. Without it the page has no widget. Pass it like `PUBLIC_STAGING` (`--build-arg`, or `[build.args]` in the fly file) |
| `TURNSTILE_SECRET` | Optional. A Turnstile answer the form sends is checked with Cloudflare and a wrong one is refused; if Cloudflare does not answer within 5 s the request is accepted. A request with **no** answer is still accepted and logged, unless `TURNSTILE_REQUIRED` is on |
| `TURNSTILE_REQUIRED` | `1` also refuses requests that send no Turnstile answer, which is what stops bots that skip the widget. Honoured only when the page was built with the widget, so no setting can lock every customer out. Off by default because visitors without JavaScript cannot produce an answer and would be refused |
| `CF_ORIGIN_SECRET` | Proof that a request came through Cloudflare. Required before Cloudflare is put in front (see below) |
| `CANONICAL_HOST` | Set in the fly files. Requests to the app's `fly.dev` address are redirected to this host |
| `STATUS_TOKEN` | Optional secret for `GET /health/delivery` (see "Watching deliveries"). Unset, that endpoint is a 404 |
| `RETRY_EVERY_MS` | How often the retry worker looks for undelivered requests. Default 10 minutes, so the Neon database can scale to zero |
| `QUOTE_PHOTO_DAYS`, `QUOTE_KEEP_DAYS` | Retention, off until set. After `QUOTE_PHOTO_DAYS` days a delivered request's photos and IP address are deleted (the photos are in the office's email); after `QUOTE_KEEP_DAYS` days the delivered request itself is deleted. Requests still owed are never touched |

Email is sent through `smtp.gmail.com` (set as `SMTP_HOST` in the fly settings files), signed in
as the Workspace user in `SMTP_USER`. That user needs 2-Step Verification on and an app password
(myaccount.google.com/apppasswords), which is `SMTP_PASS`. The sender is an alias on that user. A
copy of each notification appears in that user's Sent folder.

The Workspace SMTP relay service (`smtp-relay.gmail.com`) was tried first and closed every
connection from fly.io with `421 4.7.0` at EHLO. To use it instead, add a relay rule in the Admin
console (Apps, Google Workspace, Gmail, Routing, SMTP relay service: only addresses in your
domain, require SMTP authentication, require TLS) and set `SMTP_HOST` to it.

The database is Neon project `wlc-site` (`neon.ts` and `.neon` link this checkout to it). The server
uses `pg`, as Neon recommends for a long-running Node server. `neon env pull` writes both addresses
to `.env.local`, which `npm start` reads and Git ignores. If the database cannot be reached the site
still starts, the form shows the "call or email us" page, and the connection is retried every 30
seconds.

`npm run check:db` saves, reads back and removes a test request in the real database, and posts the
form through the app. Add `-- --http` where only web traffic is allowed.

### Behind Cloudflare

The form's rate limit needs each visitor's own address. The server never reads `X-Forwarded-For`,
which anyone can write. Through Cloudflare it uses `CF-Connecting-IP`, but only when the request
also carries `X-Origin-Secret` with the value of `CF_ORIGIN_SECRET`, because anyone can also send a
request straight to the `fly.dev` address with a made-up `CF-Connecting-IP`. Before Cloudflare goes
in front:

1. Pick a long random value and `fly secrets set CF_ORIGIN_SECRET=<value>` on both apps.
2. In Cloudflare, Rules, Transform Rules, Modify Request Header: set `X-Origin-Secret` to the same value for all requests.
3. Use SSL mode Full (strict); the app redirects plain HTTP, so Flexible would loop.

Without step 1 and 2 every visitor coming through Cloudflare shares Cloudflare's addresses, and the
limit of five requests in ten minutes applies to all of them together.

### Delivery guarantees

A request is saved (with its photos, in one transaction) before the visitor sees the confirmation.
The save leases the row to its own first delivery for ten minutes; the retry worker only takes a
row whose lease has run out, by claiming it with a conditional update, so two passes or two
machines never deliver the same request at once. Each step (GigFriend post, email) is recorded the
moment it succeeds, so a crash part way never repeats a step that went through. The intake post
and the mail server have timeouts well inside the lease. On SIGINT (fly.io's stop signal) the
server finishes requests and deliveries under way before it exits; `kill_timeout` gives it 30 s.

The same request again within two minutes (same email, name, event date, details and services:
a double click, or the page submitted again) gets the normal confirmation and is not saved or
delivered a second time.

### Watching deliveries

- `GET /health` stays a plain "the server is up" answer for Fly's check, and is not logged.
- `GET /health/delivery` reports `{ db, pending, failed, oldestPendingMinutes }` for an outside
  monitor. It answers only when the `X-Status-Token` header matches the `STATUS_TOKEN` secret
  (`fly secrets set STATUS_TOKEN=<random value>`); without the secret it is a 404. It answers 503
  when the database does not respond within 3 seconds. Point an uptime monitor at it and alert
  when it is not 200, or when `oldestPendingMinutes` passes 60.
- Every day after 13:00 UTC (8 or 9 a.m. in New York) the first retry pass emails a list of every
  request still undelivered, not only new ones. At most once a day, even with a restart or two
  machines (`quote_daily_summary` records the day). Nothing is sent when everything was delivered.
  It goes through the same mail account as the notifications, so it cannot report that account
  failing; the status endpoint can.

`migrations/` is applied at start-up. Each file runs once and is recorded in `schema_migrations`. Tests use an in-memory Postgres (`pg-mem`) and fake deliveries.

## Deploying

Launch-day steps, owner decisions and rollback: `docs/CUTOVER.md`.

```bash
tools/deploy.sh staging
tools/deploy.sh production
```

`/health` reports the commit that is running.

After each deploy, run the smoke test against what was deployed. It only sends GET requests and
never posts the quote form (a real post creates a real lead and emails the office):

```bash
npm run check:smoke -- https://www.weddinglightingco.com
npm run check:smoke -- https://staging.weddinglightingco.com --staging --password <staging password>
```

It checks `/health` and the commit, the robots signals (production: titles and robots tags of a
sample of pages match the previous site, robots.txt allows crawling, the sitemap count matches the
local build; staging: `X-Robots-Tag: noindex` on every kind of response, the password, no shared
caching, `Disallow: /`), one existing redirect, that `//example.org/` stays on the site, the 404 page,
the trailing-slash rule, security headers, the stylesheet's cache and name, one photo, and that the
app's fly.dev address redirects to the real host. Exits 1 if anything fails.

## Not built yet

See section 9 and 8a of the architecture document: the subscribe
form's route (`/api/subscribe` answers with the "call or email us" page until it exists), quote
photos in the bucket instead of Postgres, the blog admin and AI drafting.
