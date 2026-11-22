# Wedding Lighting Co: Phase 1 audit and feasibility report

Prepared 22 November 2026. Revised the same day after your feedback on email, leads, tracking and ads (changes listed in section 12). No production code has been written. Phase 2 starts only on your approval.

## 1. Verdict

**Feasible, and worth doing. But it cannot be done safely before the Wix charge on 21 December 2026.**

The site is a good candidate for a static rebuild: 291 URLs, six real templates, no checkout, no member logins in use, and every page already renders as plain HTML. Nothing on it needs a client-side framework.

The blocker is the calendar, not the technology:

- Wix will charge **$846.00 for a 3-year Core plan on 21 December 2026** (up from $684.00). That is 29 days from now. The current plan cycle ends about 9 January 2027.
- Your own launch rules need Wix kept alive for 30 days after cutover as rollback, and a cutover agreed around inquiry volume. A build, staging diff, phone testing and DNS move cannot all fit before 21 December without cutting those corners.

**Recommended action this week:** in Wix billing, switch the Core plan from 3-year to the shortest cycle Wix offers (monthly, or yearly if monthly is not offered on your account) before 21 December. You pay a higher monthly rate for two to three months and avoid locking in $846. I could not see Wix's current monthly price from here; check it on the Premium Subscriptions page before you switch.

Three parts of the audit are incomplete because I had no access: Search Console, backlinks and real-user speed data. They are listed in section 10 and they gate the final "what cannot break" ranking.

## 2. What was audited and how

| Item | Source | Status |
|---|---|---|
| Full crawl of live site | 8 Wix sitemaps plus every internal link followed | Done, 291 URLs |
| DNS, email records, registrar | Public DNS and RDAP lookups | Done |
| Wix apps, forms, tracking | Page source plus a real mobile browser load of 6 pages | Done |
| Lead path, Wix renewal and price | Your inbox (read only) and the GigFriend lead module notes | Done |
| Core Web Vitals lab numbers | Throttled mobile browser from this environment | Done, indicative only |
| Core Web Vitals field data (CrUX) | PageSpeed Insights API | **Blocked**: shared quota exhausted, needs an API key |
| Search Console 16 months | No connector in this session | **Not done** |
| GA4 landing pages | You confirmed there is no GA4. The site uses Wix's native analytics only | **Does not exist.** Replaced by a Wix analytics export, see section 4 |
| Backlinks by target URL | Ahrefs connector failed to connect | **Not done** |

The inventory is in `WLC-url-inventory-and-redirect-map.xlsx` (four tabs: URL inventory, Redirect map, Images, Internal links).

## 3. URL inventory

| Template | URLs | In sitemap | Notes |
|---|---|---|---|
| Home | 1 | yes | |
| Service and info pages | 32 | most | Uplighting, drapery, string lighting, FAQ, reviews, pricing and so on |
| Blog posts `/post/` | 29 | yes | 361 to 1,624 words, average 832. BlogPosting schema present |
| Product pages `/product-page/` | 134 | yes | Catalog only. No prices, no add to cart. Product schema present |
| Store categories `/category/` | 14 | yes | Thin, 19 to 133 words |
| Catalog pages `/catalog/` | 6 | yes | No H1 on any of them |
| Blog categories | 10 | yes | |
| Blog tags | 39 | no | Wix serves these noindex |
| Legal | 2 | yes | Privacy policy, accessibility statement |
| Utility | 3 | yes | `/search`, `/site-search`, `/book-online` |
| Member profiles `/profile/` | 2 | yes | Wix Members app residue |
| Existing redirects | 7 | | All single hop |
| Broken, hard 404 | 6 | | Linked from live pages |
| Broken, soft 404 (returns 200) | 5 | | Linked from live pages |

### Findings that matter for the move

1. **URL shape.** Canonical host is `www`, HTTPS, no trailing slash. Trailing-slash versions 301 to the bare path in one hop. The new site copies this exactly.
2. **Eleven broken internal links today.** Six targets return 404 and five return a "404 Error Page" with a 200 status (soft 404). Examples: `/quote`, `/uplighting-2`, `/drape-canopies`, `/special-effects`, `/silk-florals-catalog`. The redirect map proposes a target for each. These are the only new redirects I am proposing, and each needs your approval.
3. **Two live Wix redirects to carry over:** `/drape-walls-backdrops` to `/drape-walls-backdrops-canopies`, and `/lighting-decor-drape-catalog/string-lighting-catalog` to `/catalog/string-lighting-catalog`. Wix may hold more in its URL Redirect Manager that no page links to. Export that list from the Wix dashboard (SEO, URL Redirect Manager) so none are lost.
4. **Metadata gaps exist today and will be carried over unchanged at launch,** as you specified. 110 pages have no meta description (35 products, 14 categories, 8 pages, 2 posts, the rest tags and profiles). 16 pages have no H1, including `/faq`, `/contact-us`, `/drape-walls-backdrops-canopies` and all six catalog pages. Three pages have 9 to 13 H1s. These go on the post-launch improvement list, not into the migration.
5. **Structured data today:** LocalBusiness and WebSite on the home page only, BlogPosting on posts, Product on products, ItemList on categories. No Service, FAQPage or BreadcrumbList anywhere. Adding these is additive and safe at launch.
6. **Images:** 560 unique image files, all on `static.wixstatic.com`, referenced 1,766 times. **158 have no alt text.** Wix filenames are hashes, so descriptive filenames must be created. I will derive them from existing alt text and page context and give you the mapping to approve. Missing alts stay empty at launch unless you say otherwise.
7. **Thin or empty pages in the sitemap:** `/corporate-event-rentals-av` and `/book-online` have 8 words of content. `/search` is indexable. Decide whether each stays.
8. **One malformed link** on the site points to `https://www.weddinglightingco.comhttps...`. To be fixed in the rebuild.

### Name, address, phone as published

`The Wedding Lighting Company`, 1535 West Avenue, Richmond, VA 23220, 804-410-3605 (home page schema). The page title says "Wedding Lighting Company" and the footer says "Wedding Lighting Co". One page uses `804.410.3605`. I could not see your Google Business Profile from here. Send me the exact GBP name, address and phone and I will match them character for character.

## 4. Traffic and link value ranking

Not complete. See section 10. The sheet has empty columns for GSC clicks, impressions, sessions and referring domains per URL, ready to fill.

There is no GA4 property, so there are no GA4 landing pages to pull. That changes the evidence base:

- **Search Console is now the main ranking evidence.** The domain carries a Search Console verification record, so 16 months of pages and queries should be available. This export is the most important missing piece.
- **Wix analytics stands in for GA4.** Wix's analytics API keeps only 62 days. The GigFriend notes say a dashboard export covering 2024 to 2026 is already in your Drive. Take a fresh export before cutover, including per-page and traffic-source reports if Wix offers them.
- **Start a GA4 baseline now.** Add a GA4 property to the Wix site this week through Wix's Google Analytics integration. That gives six to eight weeks of data on the old site in the same property the new site will use, so before and after are comparable.

Until that data arrives, the sheet carries a **provisional** tier based on template and internal linking only:

- **A, must not break:** home, `/get-a-quote`, the main service pages, `/reviews`, `/portfolio`, `/faq`, `/wedding-decor-package-cost`, `/contact-us`.
- **B, keep one to one:** all blog posts, products, categories, catalog and legal pages.
- **C, decide:** tags, profiles, search, book-online.

Because every existing URL is kept as is, the ranking mainly decides two things: which pages get manual side-by-side checks on staging, and whether the 134 thin product pages and 39 tag pages are worth keeping. It does not change the build plan.

One useful fact from your lead data: recent quote submissions mostly list Google as the referral source, so organic search is the channel at risk.

## 5. Core Web Vitals baseline

**Field data (real users): not obtained.** The PageSpeed API returned quota errors without a key. A free Google API key, or five minutes in Search Console's Core Web Vitals report, fills this in.

**Lab data, mobile emulation, throttled CPU and network, measured from this environment.** Treat as indicative. Some Wix telemetry hosts were blocked here, which flatters the numbers slightly.

| Template | LCP | CLS | Main-thread blocking | Requests | Page weight | JavaScript |
|---|---|---|---|---|---|---|
| Home | 2.7 s | 0.002 | 0.2 s | 136 | 1.46 MB | 0.75 MB |
| Service page (`/uplighting`) | 1.9 s | 0.000 | 1.1 s | 137 | 2.73 MB | 1.15 MB |
| Blog post | 1.1 s | 0.000 | 1.5 s | 132 | 1.80 MB | 1.06 MB |
| Product page | 2.3 s | 0.000 | 0.6 s | 121 | 1.71 MB | 1.10 MB |
| Quote form | 1.8 s | 0.011 | 0.6 s | 133 | 1.63 MB | 1.00 MB |
| Gallery-heavy page (drape walls) | 2.2 s | 0.006 | 1.1 s | 205 | 4.03 MB | 0.98 MB |

Reading: layout stability is already good. The weakness is JavaScript. Every page ships about 1 MB of script across 120 to 200 requests, and blocks the main thread for up to 1.5 seconds on a mid-range phone. That is where INP suffers on real devices. A static build should land near 10 to 20 requests and under 50 KB of script per page, which makes the LCP 2.5 s and INP 200 ms targets comfortable.

## 6. Wix-dependent functions

| Function | What it is today | Where the data goes | Replacement plan |
|---|---|---|---|
| **Quote form** (`/get-a-quote`) | Wix Forms. Fields: name, date, referral source, email, venue, vision, file upload | Wix automation emails "New RFQ: [name] filled out Get a Quote Form" from info@ to dylan@, with a PDF. You forward some to chris@ by hand. Also stored in Wix form submissions | Own form handler. Sends the same email, same subject, same field labels, to the same inbox |
| **GigFriend lead intake** | Three feeds, all depend on Wix: (1) a Wix Forms API pull, (2) a Gmail parser that reads the "New RFQ" notification by its field labels, (3) the older Zapier feed into the RFQ Database sheet | GigFriend `_Leads` ledger, 15-minute sweep | **Highest-risk dependency.** Two paths, agreed with you. Primary: the site saves each submission to its own Postgres table and exposes a small authenticated endpoint that returns new rows in the shape of GigFriend's `_Leads` columns. GigFriend pulls from it the same way it pulls Wix form submissions today. Backup: the notification email, kept identical so the Gmail parser keeps working. GigFriend dedupes on `date|email`, so a lead arriving by both paths lands once. The Wix Forms API pull is retired on purpose at cutover. Detail in section 6a |
| **GigFriend traffic feed** | Wix site analytics API, archived daily into GigFriend | `_LeadWixTraffic` | Ends at cutover. Replace with GA4 or server log sessions. Export the last Wix data first, since Wix keeps only 62 days |
| **Contact form** | None. You confirmed the quote form is the only form. `/contact-us` shows email and phone only | | Nothing to rebuild. `/contact-us` is carried over as is |
| **Subscribe forms** | Wix email-capture on `/subscribe` and `/catalog` | Wix Contacts. A Mailchimp sync integration is referenced in the site config | Own form to the new email provider, double opt-in |
| **Email marketing** | Wix Email Marketing, Essentials package at $12 a month, sending through Wix's SendGrid account | | Export contacts with subscription status. See section 8 |
| **Blog** | Wix Blog, 29 posts, 10 categories, 39 tags | | Markdown files or small database, same URLs |
| **Catalog** | Wix Stores used as a catalog, 134 products, 14 categories, no checkout | | Structured data files, static pages, same URLs |
| **Reviews** | Testimonial apps on `/reviews`, about 1,000 words of review text in the page | | Static content, carried over verbatim |
| **Galleries** | Wix Pro Gallery, Wix Portfolio, Photo Albums | | Static responsive galleries |
| **FAQ** | Wix FAQ app | | Static, plus FAQPage schema |
| **Site search** | Wix Site Search on two pages | | Small static search index, or drop. Your call |
| **Analytics** | Confirmed by you: Wix's native tracking and cookies only. No GA4, Tag Manager or Meta pixel. One exception I observed: every page calls TWIPLA (visitor-analytics.io), and the site config lists "TWIPLA Website Intelligence" and "Twipla Session Recordings". That is a third-party Wix app | Wix analytics dashboard, GigFriend traffic archive | New site runs GA4 only, loaded after consent, with the quote submission as the one key event. TWIPLA: you confirmed you do not use it. It is not replaced and ends when Wix does |
| **Google Ads** | Run through Wix's managed "Google Ads with Wix" product, invoiced by Wix roughly every 10 days. Conversions are counted by Wix's own events reporter | | **Decided: rebuild in your own Google Ads account, but not a priority now.** Not on the migration timeline. Notes in section 6b |
| **Installed but apparently unused** | Wix Bookings, Events and Tickets, Members Area, Wix Chat, Elfsight Event Calendar, Instagram Feed, Smile and Twism rewards, PDF Viewer, ShoutOut | | Confirm none are in use. Each one adds script weight today |
| **Search Console verification** | DNS TXT record `google-site-verification=CpJl...` | | Survives the move as long as the TXT record is copied. No action beyond that |

Recent volume, for scale: about 39 quote notifications in roughly the last 10 weeks, around 4 a week.

### 6a. Lead intake design

Order of events on each submission: save to Postgres, then send the email. The database row is the record. The email is the alert and the backup feed.

| Field returned to GigFriend | Source | Note |
|---|---|---|
| Date | Submission timestamp | Must use the same date basis as the email, so dedupe keys match |
| Email, Name | Form | |
| Referrer Raw | "How did you find us?" | Sent raw. GigFriend's own normaliser maps it to its fixed referrer list |
| Event Date, Venue | Form | |
| Channel | `Website` | Existing value |
| Source | New value, for example `site` | Separates it from `wix`, `gmail`, `sheet` |
| Vision text, file links, submission ID | Form | Extras. Not in `_Leads` today, available if wanted |

Why an endpoint and not a direct database connection: it matches GigFriend's existing pull pattern, keeps database credentials out of GigFriend, and if the site is unreachable GigFriend skips that source and the email path still catches the lead.

Open points:

- Who writes the GigFriend pull stage. I will specify the endpoint contract in Phase 2 either way.
- How the existing Gmail parser derives its date (submission or received time, and timezone). I have not read the GigFriend code and need to check this so the keys line up.

Not recommended: appending rows to the "Website RFQ" sheet GigFriend already reads. It needs no GigFriend change, but it rebuilds the Zapier arrangement you want gone.

### 6b. Google Ads rebuild (deferred)

You have said Google Ads is not a major priority right now, so the rebuild is off the migration timeline. One consequence to accept knowingly: the current campaign runs inside Wix, so **it stops when the Wix subscription is cancelled**, and stays off until you rebuild. The one cheap step worth taking before then is capturing what the Wix ads dashboard shows, since that is lost at cancellation. The site will fire the quote-submitted event in GA4 from day one, so conversion tracking is ready whenever ads restart.

The notes below are for when you pick this up.

Before Wix is cancelled:

- Capture everything the Wix ads dashboard shows: budget, locations, keywords or search terms, ad copy, results. Assume anything not captured is lost when the subscription ends.
- Create the Ads account under a Workspace login you own, with your own billing. Link it to the new GA4 property and to Search Console.

Timing:

- Pause the Wix campaign the same day the new one goes live. Running both on the same keywords means bidding against yourself.
- Do not switch ads in the same week as the site move. If leads dip, the cause should be clear. Landing page URLs are not changing, so a campaign built before or after the cutover works unchanged.

Conversions:

- One conversion, a completed quote form, set up as a GA4 event and imported into Ads. On Wix it comes through the GA4 property added now. On the new site the same event fires from the form's confirmation step, so the history is unbroken.
- Calls from the ad are tracked by Google with no site work. Tracking taps on the phone number on the site is a small optional addition.

There is no existing conversion ID to reuse.

## 7. Domain, DNS and email

| Item | Finding |
|---|---|
| Registrar | **Wix.com Ltd.** Registered 15 Oct 2019, expires 15 Oct 2027. Transfer lock on |
| Nameservers | `ns10.wixdns.net`, `ns11.wixdns.net`. DNS is hosted at Wix |
| Web | Apex A records to Wix (185.230.63.x). `www` is a CNAME to `cdn3.wixdns.net` |
| MX | Google Workspace, all five standard records, TTL 3600 |
| SPF | `v=spf1 include:_spf.google.com ~all` |
| DKIM | `google._domainkey` present (Workspace). `s1._domainkey` is a CNAME to Wix's SendGrid, used by Wix email marketing |
| DMARC | `_dmarc` is a **CNAME to `_dmarc.wixemails.com`**, giving `p=none` with reports going to a Wix-controlled address. You do not control this policy today |
| DNSSEC | Off |
| TTLs | 3600 on most records, 21600 on NS |

**What this means.** Your mailboxes are on Google Workspace, not Wix, and mail is healthy. Two things at Wix still touch email:

- **The DNS zone, not the mail.** The records that tell the internet to deliver your mail to Google (MX, SPF, Google's DKIM key) are stored in the Wix-hosted zone. If that zone lapses or is moved without copying them, mail stops arriving at Google even though Google itself is fine.
- **Wix sends automated emails as your address.** The "New RFQ" notifications come from info@weddinglightingco.com but go out through Wix's sending service, authorised by the `s1._domainkey` record and covered by the Wix-controlled DMARC record. When Wix forms and automations are retired, that sending path goes with them. The new form needs its own authenticated sender for info@.

Keep the Wix DKIM record in place until Wix is fully retired, so anything Wix sends during the 30-day rollback window still passes authentication.

**To confirm:** whether any Wix automations other than the quote notification send as your domain, such as auto-replies to the person who filled in the form or follow-up sequences. I can only see the ones that land in your inbox. Each needs a replacement.

**Safe order of operations:**

1. Recreate the complete zone at an independent DNS host (Cloudflare, free). Copy MX, SPF, both DKIM records, the Search Console TXT and anything else in the Wix DNS panel that public lookups cannot enumerate. I need a screenshot or export of the Wix DNS records page for this.
2. Replace the Wix DMARC CNAME with your own TXT record, `p=none` with reports to an address you own. Tighten later.
3. Point the web records at Wix still. Change nameservers at Wix to the new DNS host. Mail and site keep working, nothing visible changes. Do this at least two weeks before launch.
4. At launch, only the two web records change. Mail records are never touched on launch day.
5. Transfer the registration itself away from Wix after the 30-day rollback window, well before October 2027.

Note: Wix only allows external nameservers on some domain setups. If it refuses, the alternative is transferring the domain out first, which takes 5 to 7 days and does not interrupt DNS if the zone is prepared in advance.

Your inbox also shows other Wix-held assets (tdlightingav.com with a Wix mailbox, virginiaavco.com). They are out of scope here but will keep billing.

## 8. Recommended stack

| Layer | Recommendation | Why |
|---|---|---|
| Site generator | **Astro**, static output, zero client JavaScript by default | Server-rendered HTML, content in Markdown and data files, built-in image pipeline for AVIF and WebP with explicit dimensions |
| Content | Markdown for pages and posts, YAML or JSON for catalog, galleries, reviews, FAQ, in the private repo | Editable without touching templates. Full history. Another developer can take over |
| Hosting | **Your existing fly.io**, one small app: a static file server plus the form and admin endpoints, behind Cloudflare's free CDN | You asked for fly.io first. The admin and form handler need a server anyway, so one app covers both. I have not seen your fly.io setup yet and need access in Phase 2 |
| Database | **Neon Postgres, needed.** Blog drafts and review workflow, user roles, form submission log, image catalog | The draft, review, publish flow and revocable logins cannot live in flat files |
| Admin auth | Google sign-in restricted to your Workspace domains, roles in Postgres | As specified |
| Forms | Own endpoint, Cloudflare Turnstile plus honeypot and rate limit, file upload to object storage | No third-party form vendor in the lead path |
| Transactional email | **Postmark** for form notifications, sending as info@ with its own DKIM record. Google Workspace SMTP relay is the alternative if you want no extra vendor | Replaces Wix's sending service for the email GigFriend parses |
| Analytics | **GA4 only**, loaded after consent, one key event (quote submitted) | No GA4 exists today. Same property is added to Wix now for a baseline |
| Newsletter | **Buttondown** or **MailerLite** | Handles unsubscribe, physical address, consent records, own DKIM. Final pick after I see subscriber count |
| Image tagging and drafting | Glow first, Claude as fallback, both behind one interface. Output is always a draft row awaiting approval | As specified. Scoped in Phase 4 |
| Scheduled jobs | GitHub Actions: sitemap, link check, image optimisation, dependency updates, nightly Neon and media backup | No extra server |

### Monthly cost

| | Wix today | Wix after 21 Dec | New stack |
|---|---|---|---|
| Site plan | $19.00 ($684 over 3 years) | $23.50 ($846 over 3 years) | fly.io small app: about $3 to $8 |
| Email marketing | $12.00 | $12.00 | $0 to $15 depending on list size |
| Database | included | included | Neon free tier to start, $19 if outgrown |
| CDN and DNS | included | included | Cloudflare, $0 |
| Transactional email | included | included | Postmark, $15 (or $0 on a free tier at your volume) |
| Domain | billed separately by Wix | same | about $1 (about $11 a year at cost) |
| **Total** | **about $31** | **about $35.50** | **about $5 to $40, likely $15 to $25** |

The saving is real but small: roughly $10 to $20 a month. The stronger reasons to move are ownership, speed, and removing Wix from the lead path, the DNS and the ads account. I would not sell this project on hosting cost. AI drafting usage is extra and depends on how often you run it.

### Timeline

| Week | Work |
|---|---|
| 0 (now) | You approve this report. Switch Wix to a short billing cycle. Add GA4 to the Wix site. Give access listed in section 10 |
| 1 | Phase 2 architecture doc, including the GigFriend endpoint contract. DNS zone rebuilt at Cloudflare, nameservers moved, mail verified. Content and 560 images exported from Wix |
| 2 to 3 | Templates and all 280 pages on password-protected, noindexed staging. Automated diff against the Phase 1 inventory |
| 4 | Quote form, GigFriend endpoint and pull stage, email sender, GA4 event. End-to-end tests. Real phone tests |
| 5 | Blog admin with roles and draft flow |
| 6 | Launch window. Lower TTL 48 hours ahead, cut over on a low-inquiry weekday morning |
| 6 to 10 | Daily monitoring for 2 weeks, then weekly. Wix kept intact 30 days |
| After 10 | AI photo sorting and drafting. Metadata and content improvements once rankings hold. Final Wix analytics export, then cancel Wix and transfer domain |

Realistic launch: **mid-January 2027**. That falls in engagement season, when inquiry volume climbs. If you would rather not move during that stretch, the alternative is a late February launch, at the cost of one or two more months of Wix.

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Email outage from mishandling the Wix-hosted DNS zone | High | Move DNS first, weeks ahead, with web still on Wix. Never change mail records on launch day |
| GigFriend stops receiving leads at cutover | High | Two independent paths: database endpoint and identical notification email, deduped by GigFriend. Test with real submissions on staging before launch |
| Automated emails stop or fail authentication when Wix sending is retired | Medium | New authenticated sender for info@ set up and tested before launch. Wix DKIM kept until Wix is retired |
| Google Ads stop when Wix is cancelled | Accepted | Ads are not a priority now. The campaign ends with the Wix subscription and is rebuilt in your own account later |
| Old campaign settings lost | Low | Capture the Wix ads dashboard before cancelling |
| No analytics baseline to compare launch against | Medium | Add GA4 to Wix now. Export Wix analytics before cancelling. Lean on Search Console |
| $846 three-year charge on 21 December | High, dated | Switch billing cycle this week |
| Ranking loss | Medium | Same URLs, same copy, same titles, same internal links. Staging diff must show 100 percent match before launch |
| Hidden Wix redirects not found by crawl | Medium | Export the Wix URL Redirect Manager list |
| Ranking of "what cannot break" is provisional | Medium | Needs Search Console, Wix analytics export and backlink data |
| Wix content export is manual | Medium | Blog and product copy is already captured in the crawl. Original-resolution images need pulling from the Wix media manager |
| Subscriber consent status lost in export | Medium | Export from Wix Contacts with the subscription status column. Unknown status is treated as not subscribed |
| Wix refuses external nameservers | Low | Fall back to domain transfer with a pre-built zone |
| Reporting gap at cutover | Low | Same GA4 property and event on both old and new site |

## 10. What I need from you to close Phase 1

1. **Search Console:** add a read-only user, or export Performance (Pages and Queries, last 16 months) as CSV.
2. **Analytics:** create a GA4 property, connect it to the Wix site now, and send me the measurement ID. Export Wix analytics (per-page and traffic sources if offered).
3. **Backlinks:** an Ahrefs or Semrush export of referring pages by target URL, or approval to use Search Console's Links report instead.
4. **A Google API key** for PageSpeed and CrUX field data, or a screenshot of the Search Console Core Web Vitals report.
5. **Wix dashboard items:** DNS records page, URL Redirect Manager list, list of active automations, contacts export with subscription status, and the monthly price Wix quotes for the Core plan.
6. **Google Business Profile:** exact name, address and phone as shown.
7. **fly.io:** which org and app this should live beside.
8. **Decisions:** approve or change the 11 proposed redirects in the sheet. Keep or drop tag pages, member profiles, `/book-online`, `/search`. Confirm the unused Wix apps are unused.
9. **Leads:** who writes the GigFriend pull stage, and access to the GigFriend Gmail parser code so I can match its date handling.
10. **Ads:** nothing needed now. Optional: a capture of the current Wix ads dashboard before Wix is cancelled.
11. **Wix automations:** any that send email as your domain besides the quote notification.

## 11. Network access added for this audit

To run the crawl I added these hosts to your Default cloud environment's allowlist, with your approval: `weddinglightingco.com`, `www.weddinglightingco.com`, `static.wixstatic.com`, `static.parastorage.com`, `siteassets.parastorage.com`, `dns.google`, `rdap.org`, `rdap.verisign.com`. They can be removed in the environment settings when the project ends.

## 12. Changes in this revision

| Topic | Your input | What changed |
|---|---|---|
| Email | Mail is on Google Workspace. Wix tools only send automated emails | Section 7 now separates the Wix-hosted DNS zone from the mailboxes, and covers replacing Wix's sending path for info@. New risk row |
| Leads | Add submissions to a shared database in a shape GigFriend recognises | Database endpoint is now the primary intake path, email the backup. New section 6a |
| Tracking | Wix native tracking and cookies only | GA4 carry-over removed. GA4 baseline on Wix, Wix analytics export and Search Console take its place. |
| Ads | Rebuild in your own Google Ads account, not a priority now | Removed from the migration timeline. Risk recorded as accepted: the Wix campaign stops when Wix is cancelled. Section 6b kept as notes for later |
| TWIPLA | Not used, a Wix feature | No replacement. Ends with Wix |
| Contact form | No other form on the site | The quote form is the only form to rebuild |

The verdict, the 21 December date, the stack and the cost estimate are unchanged. The inventory workbook is unchanged.

---

**Stopping here as instructed.** Approve this report, or tell me what to change, and I will start the Phase 2 architecture document.
