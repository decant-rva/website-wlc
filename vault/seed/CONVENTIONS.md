# Conventions

How this vault is organised and where each kind of work is recorded. People, Claude (via `CLAUDE.md`) and Glow (via `AGENTS.md` and `GLOW.md`) all follow it.

## Folder map

| Location | What goes here | Who writes it |
| --- | --- | --- |
| Root `/` | Vault-wide notes only: `00 - Website WLC Home.md`, `PROJECT-STATUS.md`, `DECISIONS.md`, `CONVENTIONS.md`, `GLOW.md`, `CLAUDE.md`, `AGENTS.md`. No new root notes without the owner's OK | People, Claude |
| `Site/` | **Generated.** One note per page, post, product and venue, plus hub notes. Rebuilt by `tools/vault-sync.js` on every sync | The sync only |
| `_glow/` | **Generated.** The export the Glow brain reads: `brief.md`, `index.jsonl`, `manifest.json` | The sync only |
| `Knowledge/` | Durable knowledge about the business and the site that is not in the code: voice, architecture, decisions explained, the migration | People, Claude |
| `Curation/` | The Curation Guide. `Curation/Proposals/` holds one note per proposed change | Glow, people, Claude |
| `Templates/` | Note templates for the Templates core plugin | People |
| `Meetings/` | One note per call, `YYYY-MM-DD <Call name>.md`, if calls are recorded here | People |
| `.obsidian/` | Obsidian settings. Don't change unless the task is Obsidian itself | People |

## Generated notes

Every note the sync writes has `generated: true` in its front matter and a banner saying where it came from. The sync overwrites them each time and deletes one only if it carries `generated: true` and its page no longer exists. A note without that flag is never touched, wherever it sits. To change what a Site note says, change the website (through a proposal).

## Naming

- Site notes are named after the page's URL, so they never move: `/uplighting` is `Site/Pages/uplighting`, `/post/cheap-dj-uplighting` is `Site/Posts/cheap-dj-uplighting`, `/blog/tags/drapes` is `Site/Blog Listings/blog-tags-drapes`. The page's heading is an alias, so search and link suggestions find it by name too.
- Proposals: `Curation/Proposals/YYYY-MM-DD <short name>.md`, for example `2026-11-24 Uplighting alt text.md`.
- Dates in ISO `YYYY-MM-DD`.
- Link with an alias for readability: `[[Site/Pages/uplighting|Uplighting]]`.
- Give every new hand-written note at least one link from the Home note or a folder's index, so it is not an orphan in the graph.

## Where each kind of result goes

| Result | Home |
| --- | --- |
| A durable choice that would be costly to rediscover | `DECISIONS.md`, a new `D-###` with Date, Status, Decision, Reason, Source. Never erase a superseded one; mark it superseded and link the replacement |
| Verified progress, test results, blockers | `PROJECT-STATUS.md`, observed results only, never plans |
| A proposed change to the site | A note in `Curation/Proposals/` |
| A question for the owner | `Knowledge/Open Questions.md`, or the "Questions for the owner" section of a proposal |
| Knowledge that is not in the code | A note in `Knowledge/` |

## Before each task

1. Read `PROJECT-STATUS.md` and `DECISIONS.md`.
2. Check `Site/Site Index` to see which version of the website the Site notes show. Sync first if it is behind.
3. Look for an existing note or open proposal on the topic. Extend it rather than add a near duplicate.
4. Don't move, rename, merge or delete hand-written notes without the owner's OK.

## Sharing

If the vault is synced with Git (the Obsidian Git plugin, as Vault 69 does), keep the repository private: proposals and knowledge notes are internal. The `.gitignore` here leaves per-device Obsidian files and plugin binaries out.
