# Project status

Last updated: 2026-11-23

Observed results only. Plans go in proposals or design notes; choices go in [[DECISIONS]].

## Vault

- Seeded on 2026-11-23 by `tools/vault-sync.js` from the website branch `beam-lines-build` (see [[Site/Site Index]] for the exact commit the Site notes show).
- Not yet synced with Git. If it should be shared between machines, it needs a private repository and the Obsidian Git plugin, as Vault 69 uses.
- Glow export written to `_glow/`. Not yet connected to the Glow brain on Beam: the brain's location and format are still to confirm.

## Website

### Branches and pull requests (2026-11-23)

- `main` holds only the README and ignore rules.
- Pull request decant-rva/website-wlc#1, `phase-3/foundation` into `main`: content import, static build, first design. Draft, open.
- Pull request decant-rva/website-wlc#2, `beam-lines-build` into `phase-3/foundation`: the Beam Lines design, every template, the quote form route, venue pages, photo bucket. Draft, open. This is the most complete version of the site.

### Checks run on `beam-lines-build` at `9732ca7` plus the vault tooling, 2026-11-23

- `npm run build`: 298 pages built.
- `npm run check:inventory`: 272 URLs in the inventory, 272 built, 272 match on every field.
- `node --test`: 31 of 31 pass, including the 8 tests for `tools/vault-sync.js`.
- Reported in pull request #2 and not re-run here: screenshots compared with the mockups at desktop and phone width.

### Not verified

- Whether staging or production is deployed and what commit is running (`/health` reports it).
- The quote route against the real Neon database, GigFriend intake and Gmail (pull request #2 lists this as open).

### Open items carried from pull request #2

- The notification email has not been viewed in a real Gmail inbox.
- The booking scale has no entry for 1 to 2 months out; the email shows "Unlikely" for 1 to 3 months until the owner says otherwise.
- `/api/subscribe` is not built; the subscribe form has nowhere to post.
- `/portfolio`: many tiles have no photo in the manifest.
- About page: "Read more" left out until the owner supplies the full story. The time chart percentages on `/catalog` are placeholders.
- Only Uplighting has fact tiles.
- Wording on `/quote-sent` and `/quote-problem` is new and needs the owner's approval.
- 31 photos the content refers to return 403 from the previous host and are skipped (`content/photos-unavailable.json`, checked 2026-11-23; pull request #2 said four, before that check). See [[Site/Photos]].
- `npm run check:a11y` has not been run against this build.
