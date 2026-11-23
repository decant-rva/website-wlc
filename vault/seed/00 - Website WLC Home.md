# Website WLC

The working vault for the Wedding Lighting Co website, weddinglightingco.com. Obsidian is the human interface. The Markdown files are the shared context for Claude, Glow and anyone else working on the site.

The website itself lives in the GitHub repository `decant-rva/website-wlc`. That repository is the source of truth for what the site says. This vault is where the site is read, discussed and curated.

## Start here

- [[PROJECT-STATUS|Where things stand]]
- [[DECISIONS|Decision log]]
- [[CONVENTIONS|Where things go in this vault]]
- [[GLOW|Glow's rules]]: what the local models may and may not do
- [[Curation/Curation Guide|Curation Guide]]: how a change gets from an idea to the live site
- [[Knowledge/Open Questions|Open questions]] waiting on the owner

## The website, generated from the code

`Site/` is rebuilt from the website repository by `tools/vault-sync.js`. Don't edit it here: the next sync overwrites it.

- [[Site/Site Index|Site index]]: which version of the site these notes show
- [[Site/Site Map|Site map]]: every URL
- [[Site/Services|Services]] · [[Site/Catalog|Catalog]] · [[Site/Blog|Blog]] · [[Site/Venues|Venues]]
- [[Site/Photos|Photos]] · [[Site/Redirects|Redirects]]
- [[Site/Content Gaps|Content gaps]]: the curation to-do list the sync finds
- [[Site/Copy in Code|Copy in code]]: words that live in the templates, not in content files
- [[Site/Business Facts|Business facts]]: name, address, phone, menus

## Knowledge

Written by people (and by Claude when asked), kept current by hand.

- [[Knowledge/Business Profile|Business profile]]: who Wedding Lighting Co is
- [[Knowledge/Brand Voice|Brand voice]]: how the site should sound
- [[Knowledge/Website Architecture|Website architecture]]: stack, hosting, deploy
- [[Knowledge/Content Model|Content model]]: where every kind of content is stored
- [[Knowledge/Launch Freeze|Launch freeze]]: what must not change before launch
- [[Knowledge/Quote Form and Leads|Quote form and leads]]
- [[Knowledge/Photos and Media|Photos and media]]
- [[Knowledge/Design System - Beam Lines|Design system: Beam Lines]]
- [[Knowledge/SEO Baseline|SEO baseline]]
- [[Knowledge/Migration from Wix|Migration from Wix]]

## Curation

- [[Curation/Curation Guide|Curation Guide]]
- Proposals live in `Curation/Proposals/`, one note per change. New ones start from [[Templates/Proposal|the proposal template]]; a new blog post starts from [[Templates/Post Draft|the post draft template]].
- To list open proposals, search `[type:proposal] [status:draft]` or `[status:approved]`.

## For the Glow brain

`_glow/` is rebuilt with `Site/`:

- `_glow/brief.md`: the short context to load first (rules, business, voice, where to look)
- `_glow/index.jsonl`: every note in the vault, in chunks of about 1,800 characters, one JSON object per line
- `_glow/manifest.json`: when it was built and from which commit

## Keeping it current

From a checkout of the website repository:

```
npm run vault -- "A:\Website-WLC"
```

Run it after pulling website changes. It rewrites `Site/` and `_glow/`, removes notes for pages that no longer exist, and leaves every other note alone.

## Working rhythm

1. An idea or a problem becomes a proposal in `Curation/Proposals/` (written by Glow or a person).
2. Claude checks it against the site and the rules and notes what it found.
3. The owner approves or rejects it.
4. Claude applies approved proposals to the website repository as a pull request. CI builds the site and runs the launch freeze check and tests.
5. After merge and deploy, the next sync shows the change in `Site/`.
6. Durable choices go in [[DECISIONS]]; observed results in [[PROJECT-STATUS]].
