---
type: guide
---
# Curation Guide

How a change gets from an idea to the live website, with this vault as the interface instead of an admin screen ([[DECISIONS#D-001 — The vault is the curation surface|D-001]]).

## The short version

1. **Propose.** Glow or a person writes a proposal note in `Curation/Proposals/`, one change per note, from [[Templates/Proposal]]. Status `draft`.
2. **Check.** Claude checks it against the website and the rules and writes what it found under "Review".
3. **Decide.** The owner sets `status: approved` or `status: rejected` (a reason under "Review" helps the next proposal).
4. **Apply.** Claude makes the change in the website repository on a branch, runs the build, the launch freeze check and the tests, and opens a pull request. The proposal gets `status: applied` and the pull request link.
5. **Publish.** The owner merges; the deploy follows. The next sync shows the change in `Site/`.

Nothing skips a step. Glow has no way to change the website itself ([[DECISIONS#D-003 — AI output is always a draft|D-003]]).

## Statuses

| Status | Set by | Meaning |
|---|---|---|
| `draft` | Whoever wrote it | Waiting for Claude's check |
| `checked` | Claude | Checked; findings under "Review". Waiting for the owner |
| `approved` | The owner | Go ahead |
| `rejected` | The owner | Not doing it. Kept for the record |
| `held` | Claude | Approved but frozen: waits for the launch freeze to lift |
| `applied` | Claude | In a pull request (link in the note) |

## Alt text

Alt text comes in batches: one proposal per page with a tick box per photo, drafted by Glow from what it sees in each photo. How it runs and how to review it: [[Curation/Alt Text with Glow|Alt Text with Glow]].

## Finding work

- [[Site/Content Gaps]]: pages with no meta description or H1, thin pages, photos without alt text, broken internal links, redirects to approve.
- The tag pane: `#wlc/gap/alt`, `#wlc/gap/thin`, `#wlc/gap/no-description`, `#wlc/gap/no-h1`, `#wlc/gap/no-photos` mark the notes that need something.
- [[Knowledge/Open Questions]] for what only the owner can answer.

## Finding proposals

Obsidian search:

- `path:Curation/Proposals [status:draft]`: waiting for a check
- `path:Curation/Proposals [status:checked]`: waiting for the owner
- `path:Curation/Proposals [status:approved]`: ready to apply

## What a good proposal looks like

- One page, one field, one change.
- "Current" copied exactly from the Site note; "Proposed" ready to paste.
- Every fact backed by a note in `sources`.
- In the owner's voice ([[Knowledge/Brand Voice]]).
- Says plainly when it touches a frozen field (`freeze: true`), copy in code (`file: src/lib/templates.js`, or `server/lib/quote-form-data.js` for the booking scale), the layout, or the quote form's labels (which GigFriend reads).

## Kinds of change

| Change | File | Can apply now? |
|---|---|---|
| Body copy, fact tiles, internal links | The page's `content/...` file | Yes |
| Alt text | The page's `content/...` file, or `content/venues.json` for a venue photo | Yes |
| Copy in code (home hero, banners, review lines) | `src/lib/templates.js` | Yes, as a code change. Review lines are never edited |
| The "When to book" scale, service colour groups | `server/lib/quote-form-data.js` | Yes, as a code change. It changes the quote page and the notification email together |
| Business facts, menus | `src/data/site.json` | Yes, with care: name, address and phone must match the Google Business Profile |
| Title, meta description, canonical, H1 of an existing page | The page's `content/...` file | No: held for the launch freeze |
| A new blog post | A new file in `content/posts/` | Yes, once the owner approves the URL |
| A new page or a changed URL | New file, and a redirect for a changed one | Only with the owner's approval |
