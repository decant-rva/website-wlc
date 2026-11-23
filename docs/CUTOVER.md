# Cutover: moving weddinglightingco.com from Wix to this site

The steps to launch, in order. Steps marked **[LIVE]** touch a real service: fly.io, Neon, the
photo bucket, Gmail, GigFriend, Cloudflare, DNS or Search Console. Everything else is local.

Placeholders in angle brackets, like `<test inbox>`, are values this repository does not know.

## 1. Decisions the owner makes first

| # | Decision | Default if nothing is decided | What it changes |
|---|---|---|---|
| 1 | **Neon plan** for the `wlc-site` project | Free plan | On the free plan, compute hours (100 a month) and storage (about 0.5 GB) can run out. When they do, the database stops and every quote request gets the "call or email us" page until the month resets. The retry worker now runs every 10 minutes (`RETRY_EVERY_MS`), so the database can sleep between passes. Photos are still stored in the database. A paid plan removes the risk. |
| 2 | **Retention** | Keep everything forever | `QUOTE_PHOTO_DAYS`: after this many days, a delivered request's photos and IP address are deleted (the photos are already in the office's email). `QUOTE_KEEP_DAYS`: after this many days, the delivered request itself is deleted. A request that is still waiting to be delivered is never touched. Suggested: 30 and 365. |
| 3 | **Staging recipients** | Staging emails the real office inbox, marked `[STAGING]` in the subject | Set staging's `QUOTE_EMAIL_TO` to `<test inbox>`. Either leave staging's `LEAD_INTAKE_URL` unset, or point it at `<GigFriend test door>`, so test requests never become real leads. Until then, a test submission on staging reaches the office, and possibly GigFriend. |
| 4 | **Proposed redirects** in `content/redirects.json` | Served on staging only | Approve or reject each one (change `"status": "proposed"` to `"approved"` or `"rejected"`). The list is below this table. |
| 5 | **Gmail lead parser** | Unchecked | Whoever owns the parser checks four things. (a) The notification now comes from `quotes@weddinglightingco.com`, not Wix's address. (b) It has new `Services:` and `Photos:` lines after `Vision:`. (c) Second and later lines of Vision are indented by two spaces. (d) An email that is retried past midnight New York time is dated by the parser to the next day, while the direct post carries the day of the request, so GigFriend may count that lead twice. |
| 6 | **"Send mail as" for quotes@** | Unknown | `quotes@` is an alias on the Workspace user in `SMTP_USER`. If Gmail does not let that user send as `quotes@`, Gmail rewrites the From line to the user's own address, and any parser rule that matches the sender breaks. |
| 7 | **Product `offers` in structured data** | Left out | The old site said price "0" and "In stock", which tells Google the items are free. Recommendation: leave it out unless real prices or real per-product reviews exist. |
| 8 | **Booking scale, the 1 to 2 month row** | The page says "2 to 3 months: Unlikely"; the email shows "1 to 3 months: Unlikely" | Decide what 1 to 2 months means. Both now read from `server/lib/quote-form-data.js`. |
| 9 | **Grey-white on magenta** | Kept | `#DBDBDD` on `#D6249F` has a contrast of 3.29:1. WCAG AA asks for 4.5:1. It appears on 36 elements, mostly `/chandelier-pendant-catalog`. Only a palette change fixes it. `tools/a11y.js` accepts it explicitly. |

Proposed redirects (decision 4):

| From | To |
|---|---|
| `/velvet-stretch-drape-walls-backdrops-rental` | `/drape-walls-backdrops-canopies` |
| `/drape-canopies` | `/drape-walls-backdrops-canopies` |
| `/lighting-decor-drape-catalog/chandelier-pendant-catalog` | `/chandelier-pendant-catalog` |
| `/lighting-decor-drape-catalog/hanging-decor` | `/hanging-decor` |
| `/quote` | `/get-a-quote` |
| `/uplighting-2` | `/uplighting` |
| `/silk-florals-catalog` | `/catalog/silk-florals-catalog` |
| `/special-effects` | `/catalog/special-effects` |
| `/standing-lighting-decor` | `/catalog/standing-lighting-decor` |
| `/table-lighting-decor-catalog` | `/catalog/table-lighting-decor-catalog` |
| `/event-wedding-band-video` | `/catalog/event-wedding-band-video` |
| `/home` | `/` |
| `/blog/page/2` to `/blog/page/5` | `/blog` |

## 2. One-time setup, in this order

1. **[LIVE] Database.**
   - Confirm the Neon plan (decision 1).
   - Set both addresses on each app:
     ```bash
     fly secrets set DATABASE_URL=<pooled> DATABASE_URL_UNPOOLED=<direct> --app wlc-site
     ```
   - Do the same for `--app wlc-site-staging` with the staging branch's addresses.
   - Migrations apply on start-up, each once, recorded in `schema_migrations`.
2. **[LIVE] Photo bucket.**
   - Run `fly storage create --app wlc-site`, and again for `wlc-site-staging`. This sets `BUCKET_NAME` and the `AWS_*` secrets on the app.
   - Fill the bucket by running the `media` workflow from the repository's Actions tab. It needs the same five values as repository secrets, and it only appears there once `.github/workflows/media.yml` is on the default branch.
   - The workflow downloads originals from Wix, so it has to run before the Wix plan ends.
3. **[LIVE] Mail.**
   - The Workspace user in `SMTP_USER` needs 2-Step Verification and an app password (`SMTP_PASS`).
   - `SMTP_HOST`, `QUOTE_EMAIL_FROM` and `QUOTE_EMAIL_TO` are set in the fly files.
     ```bash
     fly secrets set SMTP_USER=<user> SMTP_PASS=<app password> --app wlc-site
     ```
   - Do the same for staging, and set staging's `QUOTE_EMAIL_TO` to `<test inbox>` (decision 3).
4. **[LIVE] GigFriend.**
   - Production:
     ```bash
     fly secrets set LEAD_INTAKE_URL=<gigfriend-server>/lead-intake LEAD_INTAKE_SECRET=<secret> --app wlc-site
     ```
   - Staging: leave these unset, or use `<GigFriend test door>`.
5. **Cloudflare origin secret.**
   - Pick one long random value, then **[LIVE]**:
     ```bash
     fly secrets set CF_ORIGIN_SECRET=<value> --app wlc-site
     ```
   - Do the same for `wlc-site-staging`, with its own value or the same one.
   - Without it, every visitor coming through Cloudflare shares a single rate limit of five requests in ten minutes.
6. **Optional secrets [LIVE].**
   - `STATUS_TOKEN=<random>` turns on `GET /health/delivery`, which an uptime monitor can call.
   - `QUOTE_PHOTO_DAYS` and `QUOTE_KEEP_DAYS` (decision 2).
   - **Do not set `TURNSTILE_SECRET` yet.** The form has no Turnstile widget, so every visitor would fail the check.
7. **Staging password [LIVE].** Run `fly secrets set STAGING_PASSWORD=<password> --app wlc-site-staging`. Staging refuses to start without it.
8. **[LIVE] Cloudflare, on the `weddinglightingco.com` zone:**
   1. **DNS.**
      - `www` and `staging` point at their fly apps and are **proxied** (orange cloud).
      - Add certificates on fly with `fly certs add www.weddinglightingco.com --app wlc-site` and `fly certs add staging.weddinglightingco.com --app wlc-site-staging`.
   2. **SSL/TLS mode: Full (strict).** The app redirects plain HTTP to HTTPS, so Flexible would loop.
   3. **Transform Rule.**
      - Rules → Transform Rules → Modify Request Header.
      - Set `X-Origin-Secret` to the `CF_ORIGIN_SECRET` value, for all requests to both hostnames.
   4. **Redirect Rules.**
      - A Single Redirect rule: when the hostname is `weddinglightingco.com`, redirect dynamically to `concat("https://www.weddinglightingco.com", http.request.uri.path)`, status 301, with "Preserve query string" on. (In the dashboard this is Rules → Redirect Rules; the older Page Rules use `https://www.weddinglightingco.com/$1` with a `weddinglightingco.com/*` pattern.)
      - Any `http://` request → `https://` (or turn on "Always Use HTTPS").
   5. **URL normalisation.** Leave "Normalize URLs to origin" off. The app handles `//` paths itself.
   6. **Caching.**
      - Cloudflare does not cache HTML by default; leave it that way unless you also purge on every deploy.
      - Photos (`/media/*`) and `/_astro/*` carry one-year immutable headers and are cached at the edge automatically.
      - **Never add a cache rule for `staging.`** Staging pages already say `private, no-store`.
9. **[LIVE] Fly app settings.**
   - The fly files set `kill_timeout = 30`, 512 MB of swap, request-based concurrency limits and `CANONICAL_HOST`.
   - Check that each app runs one machine with `fly scale count 1 --app wlc-site`. The code copes with two, but one is the design.

## 3. Staging rehearsal

1. **[LIVE] Deploy.** Run `tools/deploy.sh staging` from a clean checkout (it refuses uncommitted changes). The Docker build fails if the freeze check or a test fails, but staging builds skip those two checks.
2. **[LIVE] Smoke test.** Run `npm run check:smoke -- https://staging.weddinglightingco.com --staging --password <password>`. This is the smoke tool being added alongside this runbook.
3. **[LIVE] Database check.** Run `npm run check:db` with staging's `DATABASE_URL` in `.env.local`. It saves, reads back and removes a test request, and leaves no rows behind.
4. **[LIVE] One real form submission** on `https://staging.weddinglightingco.com/get-a-quote`, with photos, after decision 3 is done. Then check:
   - the email arrives at `<test inbox>` and renders correctly in Gmail on a phone and on a computer;
   - the Gmail parser and GigFriend behave as decision 5 expects (only if staging's intake points at a test door);
   - an iPhone upload arrives as JPEG.
5. **Performance and accessibility.**
   - Neither tool can enter the staging password yet, so run them against a local copy of the same commit:
     ```bash
     npm ci && npm run media -- --rebuild && npm run build && npm start
     ```
   - Then run `npm run check:perf -- http://localhost:8080` and `npm run check:a11y`.
   - The budget is LCP under 2.5 s and CLS under 0.1. `/get-a-quote` makes about 24 requests before scrolling; the target is 20.

## 4. Cutover day

1. **The day before [LIVE]:** lower the TTL on the current `www` and bare-domain DNS records to 300 seconds.
2. **[LIVE] Deploy production.** Run `tools/deploy.sh production` from the commit that passed staging.
3. **Smoke test before DNS changes.**
   - The `wlc-site.fly.dev` address answers with a 301 to `CANONICAL_HOST`, so test through the real hostname aimed at fly directly:
     ```bash
     curl --resolve www.weddinglightingco.com:443:<fly app IPv4> https://www.weddinglightingco.com/
     ```
     Get the app's IPv4 from `fly ips list --app wlc-site`; the fly certificate must already be issued.
   - Or run the smoke tool with the same address resolved, or test on a temporary proxied hostname such as `<preview>.weddinglightingco.com` (add it to the certificates first).
   - Don't submit the production form at this stage.
4. **[LIVE] Switch DNS** to the Cloudflare records from step 2.8.
5. **[LIVE] At the same moment, turn off the Wix form automation** that posts to GigFriend's `/lead-intake`. The site's own post takes its place. If both run, GigFriend relies on its `date|email` dedupe.
6. **[LIVE] Check the live site:**
   - the home page, one page of each kind, and one redirect;
   - `https://weddinglightingco.com` 301s to `www`;
   - `curl -H 'X-Status-Token: <token>' https://www.weddinglightingco.com/health/delivery` shows `db: ok`.
7. **[LIVE] Search Console:**
   - submit `https://www.weddinglightingco.com/sitemap.xml`;
   - remove the old Wix child sitemaps if they were submitted;
   - request indexing for the home page.
8. **[LIVE] One real quote request on production**, from a phone, by the owner. Confirm it reaches the inbox and GigFriend once.

## 5. First week

1. **Daily email.** From 13:00 UTC (8 or 9 a.m. New York), the office gets "Website quote requests still undelivered: N" whenever anything is stuck. No email means everything was delivered.
2. **`fly logs --app wlc-site`.** Look for `not fully delivered`, `quote request dropped: trap field filled` (a person mistaken for a bot), `retry pass failed` and database errors.
3. **`/health/delivery` from an uptime monitor.** It needs `STATUS_TOKEN`. Alert on `db` not `ok`, or on `oldestPendingMinutes` over 60.
4. **Search Console.** Watch Coverage and Pages for new 404s, "Excluded by noindex" on pages that should be indexed, and redirect errors. Compare impressions and clicks with the week before.
5. **Rollback.**
   - **[LIVE]** Redeploy the previous image: `fly releases --app wlc-site`, then `fly deploy --image <previous image> --app wlc-site`.
   - If the site itself has to go, point DNS back to Wix and turn the Wix automation back on.
   - Quote requests saved on the new site during that window stay in its database and are still delivered while the app keeps running.

## 6. Known limits after launch

- Quote photos are stored in Postgres, not the bucket, until decision 2 or a move to the bucket.
- `/api/subscribe` is not built. The subscribe form answers with the "call or email us" page.
- There is no Turnstile widget. Spam protection is the trap field and the per-address rate limit.
- `tools/media.js` can only fetch originals from Wix. After the Wix plan ends, photos can't be rebuilt from that source.
- `/health` reports only that the process is up. `/health/delivery` is the real check.
- An identical request within two minutes is treated as a repeat, even if the photos differ.
- Photos over 8 MB, over 50 megapixels, or more than 5 at once are refused. The form warns about the first and last before sending.
