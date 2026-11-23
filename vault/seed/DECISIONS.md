# Decision log

Choices that would be costly or confusing to rediscover. Never erase a superseded decision; mark it superseded and link the replacement. The first entries were collected on 2026-11-23 from the website repository's documents and pull requests; each names its source.

## D-001 — The vault is the curation surface

- **Date:** 2026-11-23
- **Status:** Proposed
- **Decision:** Curate the website through this vault, with Glow drafting proposals, Claude checking and applying them, and the owner approving, rather than building the blog admin interface first.
- **Reason:** The site's content is already Markdown in Git, which Obsidian and the local models read directly. Approval and history come from proposals and pull requests. The admin in section 9 of the architecture document can still be built later if a web form is wanted.
- **Source:** The owner, 2026-11-23: "Glow will potentially be used to curate the website vs an interface."

## D-002 — The website repository is the source of truth

- **Date:** 2026-11-22
- **Status:** Accepted
- **Decision:** Published content lives only in the Git repository. The database never holds the live copy of a page. `Site/` in this vault is a generated copy.
- **Reason:** Full history and one-step rollback, and every check runs on every change.
- **Source:** `docs/phase-1/ARCHITECTURE.md`, section 3, principle 3.

## D-003 — AI output is always a draft

- **Date:** 2026-11-22
- **Status:** Accepted
- **Decision:** Glow (or Claude, or a local model) drafts and proposes; nothing it writes is published without a person approving it. The engine has no publish permission and no path to one. One draft per request; no scheduled or bulk generation.
- **Reason:** As specified by the owner.
- **Source:** `docs/phase-1/ARCHITECTURE.md`, section 9a; `docs/phase-1/PHASE-1-REPORT.md`, section 8.

## D-004 — Launch freeze

- **Date:** 2026-11-22
- **Status:** Accepted, in force until the owner lifts it
- **Decision:** Until the owner lifts it, page titles, meta descriptions, canonicals and H1 text match the previous site exactly. `npm run check:inventory` enforces it in CI.
- **Reason:** Organic search is the channel at risk in the move from Wix.
- **Source:** Website `README.md`, "The launch freeze"; `docs/phase-1/PHASE-1-REPORT.md`, section 3.

## D-005 — Every existing URL is kept

- **Date:** 2026-11-22
- **Status:** Accepted
- **Decision:** All URLs of the previous site keep their exact spelling. Redirects are defined only in `content/redirects.json`; `proposed` entries are served on staging only until the owner approves them.
- **Source:** `docs/phase-1/ARCHITECTURE.md`, section 6.

## D-006 — One main heading per page

- **Date:** 2026-11-22
- **Status:** Accepted
- **Decision:** Every page has one main heading. Where the previous site had several H1s the first is kept; where it had none, the heading is an H2 styled the same, so the freeze on H1 text holds.
- **Source:** Owner decision, 22 November 2026, recorded in the website `README.md`.

## D-007 — Stack and hosting

- **Date:** 2026-11-22
- **Status:** Accepted
- **Decision:** Astro builds static HTML; a small Fastify server on fly.io serves it (app `wlc-site`, staging `wlc-site-staging`, region `iad`). Neon Postgres for quote requests. Photos in a Tigris bucket, served from `/media`.
- **Source:** `docs/phase-1/ARCHITECTURE.md`; website `README.md`; `fly.toml`.

## D-008 — Quote notifications are sent through Gmail

- **Date:** 2026-11-23
- **Status:** Accepted
- **Decision:** The quote notification is sent through `smtp.gmail.com`, signed in as a Workspace user with an app password, from `quotes@weddinglightingco.com` to `info@weddinglightingco.com`.
- **Reason:** The Workspace SMTP relay closed every connection from fly.io with `421 4.7.0`.
- **Source:** Website `README.md`, "Quote form"; `fly.toml`.

## D-009 — Lead path

- **Date:** 2026-11-22
- **Status:** Accepted
- **Decision:** Each quote request is saved to Postgres first, then posted to GigFriend's `/lead-intake` and emailed to the office. Deliveries that fail are retried and reported after an hour. GigFriend dedupes on `date|email`.
- **Source:** `docs/phase-1/ARCHITECTURE.md`, section 8a.

## D-010 — The Beam Lines design

- **Date:** 2026-11-23
- **Status:** Accepted
- **Decision:** The site uses the Beam Lines design: navy, amber and the logo blue, slanted bands, torn-tape labels; League Spartan, DM Sans and Kalam, self-hosted. One grey-white (`--white: #DBDBDD`) replaces pure white everywhere, as the owner asked.
- **Source:** Pull request decant-rva/website-wlc#2; website `README.md`, "Design".

## D-011 — Package prices

- **Date:** 2026-11-23
- **Status:** Accepted
- **Decision:** The package pricing page shows each look with its price; the figures are the previous site's raised 20%.
- **Source:** Owner request, recorded in pull request decant-rva/website-wlc#2.

## D-012 — Venue pages are the only new URLs

- **Date:** 2026-11-23
- **Status:** Accepted
- **Decision:** Each venue with at least one photo gets a page at `/venue/<slug>`, with a researched meta description. With `/quote-sent` and `/quote-problem` (noindex), these are the only URLs that were not on the previous site.
- **Source:** Website `README.md`; pull request decant-rva/website-wlc#2.

## D-013 — Uploads are photos only

- **Date:** 2026-11-23
- **Status:** Accepted
- **Decision:** Quote form uploads are decoded and rewritten as JPEG of at most 2000 px (metadata and file name dropped); SVG and PDF are refused. They are kept in Postgres with the request, not in the bucket the architecture planned.
- **Source:** Website `README.md`, "Quote form"; pull request decant-rva/website-wlc#2, open items.
