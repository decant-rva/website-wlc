# Wedding Lighting Co website: architecture

Phase 2 deliverable. Prepared 22 November 2026. This document describes what will be built and why. No site code exists yet. Section 13 lists what I need approved before Phase 3 starts.

## 1. Summary

One small fly.io app, `wlc-site`, in the same region and built to the same conventions as `gigfriend-server`. It serves pre-built static HTML for every public page and runs a handful of server routes: the quote form, the subscribe form, the admin, and the media endpoints. Content lives in the repository as Markdown and data files. Postgres holds only what cannot live in files: drafts, users, form submissions and the photo catalog. Photos live in object storage and are served from your own domain. Cloudflare sits in front for DNS and caching.

```
Visitor ── Cloudflare (DNS, cache) ── fly.io app "wlc-site" (iad)
                                        ├─ static HTML, CSS (built by Astro)
                                        ├─ /media/*      ── Tigris bucket (photos)
                                        ├─ /api/quote    ── Postgres ── gigfriend-server /lead-intake
                                        │                           └─ notification email to info@
                                        ├─ /api/subscribe ── newsletter provider
                                        └─ /admin/*      ── Google sign-in ── Postgres (drafts, roles)
                                                              └─ publish = commit to repo ── CI ── deploy
```

## 2. What I found in your existing setup

I read `gigfriend-server` and `gigfriend-appsscript` (read-only) because the plan depends on them. Three findings change what I proposed in Phase 1.

**The lead intake door already exists.** `gigfriend-server` has `POST /lead-intake`, written for "the website form, direct". It authenticates with its own secret (`LEAD_INTAKE_SECRET`, sent as an `X-Lead-Token` header), writes the lead and a quote-queue row, and dedupes. Its code comments describe a Wix automation posting to it already. So the new site does not need a new shared database or a new GigFriend pull stage. It posts to the same door Wix uses now, with the same fields. **This replaces the endpoint design in section 6a of the Phase 1 report, and removes the open question about who writes the GigFriend side: nobody has to.**

**Your fly.io conventions are clear and I will follow them.** Region `iad`, timezone `America/New_York` set in both `fly.toml` and the Dockerfile, Node on Alpine, Fastify and `pg`, a `/health` check that reports the running commit, one small machine, Tigris for object storage, numbered SQL migrations, deploy through a script that stamps the build SHA.

**The date basis is settled.** The Gmail lead parser dates a lead by when the email arrived, in New York time. The intake door takes a `submittedAt` field. The site will send the New York calendar date of the submission, so both paths produce the same `date|email` key and the lead lands once.

One difference from the Phase 1 report: I said Neon. The `gigfriend-server` README allows either Fly Managed Postgres or Neon in `us-east-1`, and I could not see which one you run. The site should use the same provider, as a **separate database**. See section 13.

## 3. Principles

1. Every public page is plain HTML written at build time. No content is rendered in the browser.
2. The public site keeps working if Postgres, the admin, the email provider or GigFriend is down. Only the quote form depends on a server route, and it degrades to showing the phone number and email.
3. One source of truth for published content: the Git repository. The database never holds the live copy of a page.
4. Launch does not depend on the admin or the AI features. They are built after the site is live and stable.
5. Nothing from Wix is loaded at runtime. No third-party script on any page except GA4 after consent and the form's spam check.

## 4. Stack

| Layer | Choice | Reason |
|---|---|---|
| Page generation | Astro, static output | Produces HTML with no client JavaScript unless a page asks for it. Content collections validate every page's front matter at build time, so a missing title or alt fails the build instead of reaching production |
| Server | Fastify on Node 24 Alpine | Same as `gigfriend-server`. Serves the built files and the routes in section 8 |
| Database | Postgres via `pg`, numbered SQL migrations | Same pattern as `gigfriend-server`. Separate database, same provider and region |
| Object storage | Fly Tigris bucket | Already in use by GigFriend. Holds photo originals and generated sizes |
| CDN and DNS | Cloudflare free plan | Independent DNS (the Phase 1 priority) and edge caching for HTML and media |
| Image processing | `sharp` | Generates AVIF and WebP at fixed widths |
| Transactional email | Postmark, or Workspace SMTP relay | Sends the "New RFQ" notification as info@. Your choice, section 13 |
| Newsletter | Decided once the Wix contact export shows list size | Buttondown or MailerLite |
| Spam protection | Cloudflare Turnstile, a honeypot field, per-IP rate limit | No visible puzzle for real visitors |
| CI | GitHub Actions | Build, checks, deploy, scheduled jobs |

Client JavaScript budget: none on content pages. Three small scripts where needed: mobile menu toggle, gallery lightbox, form validation. Each is hand-written, loaded only on pages that use it, and the page works without it.

## 5. Repository layout

```
wlc-site/
  content/
    pages/            one Markdown file per page, front matter holds title, description, H1, canonical
    posts/            one Markdown file per blog post
    products/         one YAML file per catalog item
    categories/       store and blog categories
    galleries/        ordered lists of photo IDs with captions
    reviews.yaml
    faq.yaml
    redirects.yaml    the approved redirect map, the only place redirects are defined
    site.yaml         name, address, phone, service areas, social links
  src/
    layouts/          page shells
    components/       header, footer, gallery, picture, breadcrumb, schema
    pages/            route templates, one per template type
    styles/           hand-written CSS, no framework
  server/
    server.js         Fastify app
    routes/           quote, subscribe, media, admin, health
    lib/              email, intake, images, auth
  migrations/         001_init.sql onward
  tools/              deploy.sh, import-from-wix, inventory-diff, link-check
  test/
  docs/               this document, runbook, launch checklist, monitoring log
  Dockerfile
  fly.toml
```

**Why content is in files.** You asked for content editable without touching templates. A Markdown file with a short header is that: change the text, save, and the page updates on the next deploy. Git gives full history and rollback for free. The admin (section 9) edits these same files through a web form, so nobody needs to use Git to write a post.

**Launch rule enforced in code.** Each page's front matter is imported from the Phase 1 crawl: title, meta description, H1, canonical. `tools/inventory-diff` compares the built site against the Phase 1 inventory and fails the build if any URL, title, description, H1 or canonical differs, or if any inventory URL is missing. That check stays in CI until you tell me the freeze is over.

## 6. URLs, redirects and SEO output

| Rule | Implementation |
|---|---|
| Canonical host | `https://www.weddinglightingco.com`. Bare domain 301s to `www` at Cloudflare |
| Trailing slash | None. `/path/` 301s to `/path` in one hop, as Wix does today |
| Existing URLs | All 291 paths keep their exact spelling: `/post/…`, `/product-page/…`, `/category/…`, `/catalog/…`, `/blog/categories/…` |
| Redirects | Only from `content/redirects.yaml`. A test follows every entry and fails on any chain or any redirect to the home page that you did not approve |
| 404 | Custom page, real 404 status. Fixes the five soft 404s Wix serves today |
| Sitemap | `sitemap.xml` generated at build from the pages that exist and are indexable. Regenerated on every deploy |
| robots.txt | Allows everything public, disallows `/admin` and `/api`, points to the sitemap. On staging it disallows everything |
| Canonical tags | Self-referencing on every page |
| Open Graph | Title, description, image, URL, type on every page |
| Staging | `noindex` header on every response plus password, so it cannot be indexed even if a link leaks |

### Structured data

Generated from the content files, validated in CI against schema.org types, and checked by hand in Google's Rich Results Test before launch.

| Type | Where | Source |
|---|---|---|
| LocalBusiness | Every page, full version on home and contact | `site.yaml`. Name, address and phone must match Google Business Profile exactly. Service areas: Richmond, Charlottesville, DC, as the footer states today |
| Service | Each service page | Page front matter |
| FAQPage | `/faq` | `faq.yaml` |
| BlogPosting | Each post | Post front matter, carries over today's values |
| Product | Each catalog page | Carried over. No price or offer, since none exist today |
| BreadcrumbList | Every page below home | Derived from the URL and category |

Adding schema is the one SEO change made at launch. It adds information without altering anything Google already reads.

## 7. Images

Sampled from Wix: 560 unique files, about 155 MB in total, average 269 KB. 481 JPEG, 73 PNG, 6 WebP. Many are only 900 to 1,300 pixels wide.

| Step | Detail |
|---|---|
| Originals | Stored in the Tigris bucket under `originals/`. Never modified |
| Generated sizes | AVIF and WebP, plus a JPEG fallback, at 480, 800, 1200 and 1600 pixels wide. Never larger than the original. Generated once on import or upload and stored in the bucket |
| Serving | From `www.weddinglightingco.com/media/…`, through Cloudflare with a one-year cache. Filenames include a content hash, so a changed image gets a new URL |
| Markup | `<picture>` with `srcset` and `sizes`, explicit `width` and `height` on every image, `loading="lazy"` on everything below the fold, eager loading and high fetch priority on the one hero image per page |
| Filenames | Descriptive, lowercase, hyphenated, for example `uplighting-amber-ballroom-commonwealth-club.avif` |
| Alt text | Carried over exactly. The 158 images with no alt keep an empty alt at launch |
| Catalog | A `photos` table records each image's ID, filename, alt, dimensions, categories, venue and source page. Galleries and posts refer to photos by ID |

Two points need you:

- **Filename mapping.** Wix filenames are hashes. I will propose a descriptive name for each of the 560 from its alt text and the page it sits on, and give you the list as a sheet to approve or edit before anything is renamed.
- **Resolution.** The copies on Wix are small. If you have the full-size originals for hero and gallery photos, sending them will give sharper results on large screens. This is optional and can happen after launch.

## 8. Server routes

| Route | Purpose |
|---|---|
| `GET /*` | Static files from the build. HTML cached at Cloudflare for a short time, purged on deploy |
| `GET /media/*` | Streams from the bucket with long cache headers |
| `POST /api/quote` | Quote form. Section 8a |
| `POST /api/subscribe` | Adds an address to the newsletter provider with double opt-in |
| `GET /health` | Status and running commit, for the fly.io check |
| `/admin/*` | Section 9. Not built until after launch |

### 8a. Quote form and lead path

Fields match today's form exactly: full name, event date, how did you find us, email, where is your event, tell us about your vision, file upload.

On submit, in this order:

1. Validate, check Turnstile, honeypot and rate limit.
2. **Save the submission to Postgres.** From this point the lead cannot be lost.
3. Store any uploaded files in the private part of the bucket.
4. Respond to the visitor with the confirmation page. They do not wait on steps 5 and 6.
5. **Post to `gigfriend-server` `/lead-intake`** with the `X-Lead-Token` header and the fields it already accepts: `name`, `email`, `howDidYouFindUs`, `eventDate`, `venue`, `details`, `submittedAt`.
6. **Send the notification email** to the same inbox as today, with the same subject, "New RFQ: [name] filled out Get a Quote Form", and the same field labels in the body: Name, Email, Referral Source, Event Date, Venue, Vision.

Steps 5 and 6 are recorded per submission as pending, sent or failed. A worker retries failures with increasing delays and alerts you by email if any delivery is still failing after an hour. Because GigFriend dedupes on `date|email`, a lead that arrives by both the direct post and the email is counted once.

What changes in GigFriend: nothing in code. At cutover the Wix automation that posts to `/lead-intake` stops firing and the site takes its place. The Wix forms API pull stops returning new rows on its own. I will give the site its own intake secret only if you prefer separate credentials, which would need a small change on the GigFriend side. Otherwise it reuses the existing one.

Tracking: the confirmation step fires one GA4 event, `quote_submitted`, only if the visitor has accepted analytics cookies.

## 9. Blog admin (built after launch)

| Item | Design |
|---|---|
| Sign-in | Google sign-in. Only accounts on your approved Workspace domains are accepted, checked on the server against the verified domain in Google's response |
| Access list | A `users` table. Signing in with an approved domain is not enough: the account must also be on the list. You add and remove people from an admin screen. Removing someone ends their session at once |
| Roles | Author: write and edit own drafts, submit for review. Editor: edit any draft, send back or approve. Admin: publish, unpublish, manage users |
| Workflow | Draft, in review, approved, published. Every change of state is logged with who and when |
| Publishing | Publish writes the post as a Markdown file to the repository through a scoped GitHub token, which triggers the normal build and deploy. The post is live a few minutes later |
| Editing live posts | Opens a new draft from the published file. The live post is untouched until the new draft is published |

Why publish through Git rather than render posts from the database: the public site then has no dependency on Postgres, every published change has history and one-step rollback, and the pre-launch checks run on every post before it goes live.

### 9a. AI drafting and photo sorting (built last)

Kept behind one interface so the engine can be Glow, a local model or Claude without changing the rest of the site.

- **Photo sorting.** On upload, the engine proposes categories, venue and alt text. Proposals are stored as suggestions against the photo. Nothing is applied until someone accepts it.
- **Photo retrieval.** A draft can ask for photos by category or venue and gets matches from the catalog.
- **Drafting.** The engine receives a brief, your voice profile and example posts, and returns a draft. **Every result is saved with status draft, under the requesting user's name. The engine has no publish permission and no path to one.** One draft per request. No scheduled or bulk generation exists in the design.

I have not seen Glow or the Social and Blogs project. I will scope this properly once the site is live and you can show me both.

## 10. Data model

Postgres, separate database from GigFriend.

| Table | Holds |
|---|---|
| `submissions` | Every quote form entry, field by field, with timestamps and source page |
| `submission_files` | Uploaded attachments, pointing to the bucket |
| `deliveries` | One row per submission per destination (intake, email) with status, attempts and last error |
| `photos` | The image catalog described in section 7 |
| `photo_suggestions` | AI proposals awaiting acceptance |
| `users` | Email, role, active flag, who added them |
| `sessions` | Admin sessions, so they can be revoked |
| `drafts` | Post drafts with status and current content |
| `draft_events` | The audit trail of workflow changes |
| `jobs` | Scheduled job runs and outcomes, shown on `/health` |

Personal data here is limited to what the form collects. Attachments are private and reachable only through a signed, expiring link. Submissions older than a period you choose can be deleted automatically. Section 13 asks for that period.

## 11. Hosting, environments and deploy

| Item | Detail |
|---|---|
| Production | fly.io app `wlc-site`, region `iad`, `shared-cpu-1x`, 512 MB, one machine always running, health check on `/health` |
| Why its own app | A deploy or fault on the website cannot touch GigFriend, and the reverse. They share a region and conventions, nothing else |
| Staging | fly.io app `wlc-site-staging` at `staging.weddinglightingco.com`. Password on every request, `noindex` header, robots.txt disallows all, its own database and bucket, form posts go to a test inbox and never to GigFriend's live intake |
| Secrets | fly.io secrets only. Never in the repository |
| Deploy | Push to `main` runs CI. If every check passes, `tools/deploy.sh` deploys with the build SHA stamped, as GigFriend does. A failed health check rolls back automatically |
| Rollback | Redeploy the previous image, one command. Content rollback is a Git revert |

### CI checks on every change

Build, HTML validation, internal link check, redirect test, structured data validation, inventory diff against Phase 1, accessibility scan (WCAG 2.2 AA rules), and a Lighthouse run on one page per template with budgets of LCP under 2.5 s, CLS under 0.1 and total blocking time low enough to keep INP under 200 ms.

### Scheduled jobs

| Job | Schedule | Where |
|---|---|---|
| Broken link check, internal and external | Weekly | GitHub Actions, opens an issue with findings |
| Dependency updates | Weekly | Automated pull requests, merged only if CI passes |
| Database backup | Nightly | Provider snapshots plus a dump to a separate bucket |
| Media backup | Weekly | Bucket copy to a second location |
| Delivery retry and alert | Every few minutes | In the app |
| Image optimisation | On upload | In the app |
| Sitemap | On every deploy | Build step |
| Uptime check | Every minute | External monitor on the home page and `/health` |

Following the lesson recorded in `gigfriend-server`, where two moved jobs silently never ran: every job writes its last run to the `jobs` table and `/health` reports any job that is overdue.

## 12. Performance, accessibility and privacy

**Performance.** Each page is one HTML document, one CSS file, fonts, and its images. Fonts are self-hosted, subset, and preloaded. The hero image is preloaded and sized. Nothing blocks rendering. Target is 10 to 20 requests per page against today's 120 to 200.

**Accessibility, WCAG 2.2 AA.** Semantic landmarks, one H1 per template where the current page has one, visible focus styles, skip link, colour contrast checked, form fields with real labels and error messages tied to their fields, galleries usable by keyboard, motion reduced when the visitor asks for it, tap targets at least 24 pixels. The automated scan catches about a third of issues. I will do a manual keyboard and screen reader pass on each template before launch.

One conflict with the launch freeze: 16 pages have no H1 today and three have 9 to 13. Carrying that over exactly fails accessibility. Section 13 asks how you want it handled.

**Privacy.** A consent banner controls GA4. No analytics load before consent. The privacy policy text is carried over unchanged at launch, but it will describe Wix's tracking, which will no longer be true. I will mark the sentences that need updating for you to approve. I am not a lawyer and this is not legal advice.

## 13. Decisions and access I need

**To start Phase 3**

1. **A private repository.** I cannot create one. Please create an empty private repo, for example `decant-rva/wlc-site`, and attach it to this session.
2. **Database provider.** Which does GigFriend run on, Fly Managed Postgres or Neon? The site will use the same, as a separate database.
3. **fly.io access.** A deploy token for the two new apps, or you run the first `fly launch` for each and add the token to the repo's secrets.
4. **Approval of this document,** or changes.

**Before the forms are built (week 4)**

5. **Email sender.** Postmark (about $15 a month, separate vendor, best delivery reporting) or Workspace SMTP relay (no new vendor, fewer diagnostics). I recommend Postmark.
6. **Intake secret.** Reuse the existing `LEAD_INTAKE_SECRET`, or a separate one for the site.
7. **Retention.** How long to keep form submissions and attachments in the site's database. I suggest 24 months.

**Before launch**

8. **H1 handling.** Recommended: add a visually hidden or visible H1 that repeats the existing page title on the 16 pages without one, and demote the extra H1s to H2 on the three pages with many. This changes heading markup on 19 pages at launch. The alternative is to carry the faults over exactly and fix them after rankings hold.
9. **Image filename sheet,** when I send it.
10. **Still open from Phase 1:** the Wix billing switch before 21 December, Search Console export, Wix DNS and redirect lists, Google Business Profile details, the 11 proposed redirects, and what to do with tag pages, profiles, `/book-online` and `/search`.

## 14. What happens next

On approval and a repository, Phase 3 begins with three things that need nothing else from you: importing all page, post and product content from the Phase 1 crawl into content files, importing the 560 images into the catalog with proposed filenames, and building the first template against the inventory diff. The staging site follows as soon as fly.io access is in place.
