# The Website WLC vault

An Obsidian vault for reading, discussing and curating this website, and the knowledge export the Glow brain (the local models on Beam) reads. The vault itself lives outside this repository, at `A:\Website-WLC` on the owner's machine. This folder holds the starting copy of its hand-written notes; `tools/vault-sync.js` writes the rest from the site's content.

## Set up or refresh the vault

```bash
npm run vault -- "A:\Website-WLC"
```

Run it from a checkout of the branch the site is built from, after each pull. It needs only Node: no build, no `npm ci`.

Options:

| Option | What it does |
|---|---|
| `--glow-dir <dir>` | Also copy the Glow export (`brief.md`, `index.jsonl`, `manifest.json`) to a second folder, such as wherever the Glow brain loads its knowledge from |
| `--media wix` | Default. Photo previews in the notes load from the previous host, which still serves them |
| `--media none` | Text only, no previews |
| `--media <base-url>` | Previews from the new site's photo store, for example `https://www.weddinglightingco.com/media`, once it serves them |
| `--dry-run` | Report what would change without writing |

## What it writes

| In the vault | Rewritten on each run? |
|---|---|
| `Site/`: a note per page, post, product and venue, plus hub notes (site map, services, catalog, blog, venues, photos, redirects, content gaps, copy in code, business facts) | Yes. Each carries `generated: true`. A note is deleted only when it has that flag and its page is gone |
| `_glow/brief.md`: rules, business, voice, services, where to look. About 14,000 characters | Yes |
| `_glow/index.jsonl`: every note in the vault (generated and hand-written) in chunks of at most 1,800 characters: `id`, `note`, `title`, `type`, `url`, `source`, `status`, `section`, `text` | Yes |
| `_glow/manifest.json`: build time, branch, commit, counts | Yes |
| Everything in `vault/seed/`: Home, `GLOW.md`, `CLAUDE.md`, `AGENTS.md`, `CONVENTIONS.md`, `DECISIONS.md`, `PROJECT-STATUS.md`, `Knowledge/`, `Curation/Curation Guide.md`, `Templates/`, `.gitignore`, `.obsidian/templates.json` | No. Copied only when the file is missing, so edits made in the vault are kept |

Everything else in the vault, including `Curation/Proposals/`, is never touched.

## How curation works

Glow writes proposals in `Curation/Proposals/`, Claude checks them, the owner approves, and Claude applies approved ones here as pull requests, where CI runs the launch freeze check. Glow has no path to this repository. The full flow is in `vault/seed/Curation/Curation Guide.md`; Glow's rules are in `vault/seed/GLOW.md`.

## Alt text with Glow

`tools/glow-alt-text.js` runs the alt text job: it finds the photos with no alt text and their context, Glow describes each photo and drafts the words, and it writes one proposal per page with a tick box per photo. `apply` puts the ticked lines of approved proposals into the content files. The steps are in `vault/seed/Curation/Alt Text with Glow.md`.

## Editing the seed notes

The seed notes are a starting point. Once a vault exists, its copies are the live ones and are edited there. Change a seed here only to change what a new vault starts with.

This repository is public. Keep anything internal (customer details, pricing strategy, credentials) out of `vault/seed/`; put it in the vault only, and keep the vault's own Git repository, if it has one, private.
