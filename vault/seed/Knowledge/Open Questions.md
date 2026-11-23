---
type: knowledge
---
# Open questions

Decisions and inputs waiting on the owner, collected on 2026-11-23 from the architecture document (section 13), the Phase 1 report (section 10) and pull request decant-rva/website-wlc#2. Some may have been settled since in conversation; when one is, record it in [[DECISIONS]] and strike it here.

## Content and SEO

- [ ] Approve or change the 11 proposed redirects ([[Site/Redirects]]).
- [ ] Keep or drop the blog tag pages, member profiles, `/book-online` and `/search`.
- [ ] Approve the wording on `/quote-sent` and `/quote-problem`, which is new.
- [ ] The full story for the About page's "Read more".
- [ ] Real figures for the `/catalog` time chart (the percentages are placeholders; see `TIME` in [[Site/Copy in Code]]).
- [ ] Fact tiles for the service pages other than Uplighting.
- [ ] The "When to book" scale has no entry for 1 to 2 months out; the email shows "Unlikely" for 1 to 3 months.
- [ ] The image file name sheet, when it is sent.
- [ ] Alt text: carry the empty ones over at launch, or fill them first.
- [ ] When the launch freeze lifts.

## Access and data

- [ ] Search Console: a read-only user or an export of 16 months of pages and queries.
- [ ] GA4: a property for the baseline on Wix, and its measurement ID.
- [ ] Backlinks: an Ahrefs or Semrush export, or use Search Console's Links report.
- [ ] Google Business Profile: the exact name, address and phone, to match [[Site/Business Facts]] character for character.
- [ ] Wix dashboard exports: DNS records, URL Redirect Manager list, active automations, contacts with subscription status, analytics.
- [ ] Any Wix automations other than the quote notification that send email as the domain.

## Build

- [ ] Newsletter provider for `/api/subscribe` (Buttondown or MailerLite), once the subscriber count is known.
- [ ] Retention period for quote requests and uploads (24 months was suggested).
- [ ] Whether quote uploads stay in Postgres or move to the bucket, as first planned.

## This vault

- [ ] Where the Glow brain lives on Beam and what it reads (a folder of notes, the JSONL index, an embedding store), so the sync can write there with `--glow-dir`.
- [ ] Whether the vault is shared through a private Git repository (Obsidian Git), like Vault 69.
- [ ] Whether [[DECISIONS#D-001 — The vault is the curation surface|D-001]] (curate through the vault rather than build the admin) is accepted.
