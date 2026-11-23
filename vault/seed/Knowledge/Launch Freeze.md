---
type: knowledge
---
# Launch freeze

Until the owner lifts it, every page that was on the previous site keeps its **title, meta description, canonical and H1 text** exactly as the previous site had them, character for character. URLs never change at all without a redirect. ([[DECISIONS#D-004 — Launch freeze|D-004]], [[DECISIONS#D-005 — Every existing URL is kept|D-005]])

## Why

Most quote requests come from Google. Moving off Wix is the riskiest moment for search rankings, so the move changes as little of what Google reads as possible. Improvements wait until rankings have held on the new site.

## How it is enforced

`npm run check:inventory` (`tools/inventory-diff.js`) compares every built page with `docs/phase-1/inventory.json`, the crawl of the previous site. It fails if a URL is missing or any frozen field differs, and it requires exactly one H1 matching the previous site's first H1 (none where the previous site had none). CI runs it on every change, so a frozen field cannot change by accident.

## What may change now

- Body copy, photos and alt text, fact tiles, internal links, the copy set in code. (Alt text is carried over at launch unless the owner says otherwise.)
- New pages and posts, with the owner's approval of the URL. The inventory check covers only the previous site's URLs.
- Venue pages (`/venue/<slug>`), which are new.

## What waits

- Titles, meta descriptions, canonicals and H1s on the previous site's pages. Proposals for these can be written now with `freeze: true`; they are held, not applied.
- [[Site/Content Gaps|Content Gaps]] lists the pages with no meta description and no H1 on the previous site. These are the first improvements to make when the freeze lifts.

## Lifting it

Only the owner lifts the freeze. When that happens, record it in [[DECISIONS]], update `docs/phase-1/inventory.json` (or retire the check) in the website repository, and apply the held proposals one by one.
