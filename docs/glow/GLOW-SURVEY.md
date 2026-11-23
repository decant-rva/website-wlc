# Glow and the website: engine survey and integration reference

Prepared 23 November 2026, as groundwork for the Glow suite: the set of tools through which Glow helps manage the website, keep it online and cut the work of curating it. It collects what is known about Glow's engines, what the website already gives Glow, what was measured, and what still needs testing, so the next session can start building instead of researching.

Each fact carries one of these marks:

| Mark | Meaning |
|---|---|
| **Verified** | Run or read in this session, on 23 November 2026 |
| **Reported** | Written in the repository (commits, pull requests, vault seed notes) by an earlier session; not re-run here |
| **Public** | From the model's or tool's public documentation (sources at the end) |
| **Inferred** | A reading of the evidence that needs confirming on the owner's PC. None are left: the only one (that Beam is the `mac` route) was confirmed |
| **Probed** | Run against the hub from the owner's PC by a later session, 23 November 2026 (section 11) |
| **Glow notes** | Recorded in Glow's own knowledge notes or the hub's code on the owner's PC, read the same day. Not public |

## 1. Summary

- **Glow is a set of local models behind one hub.** The hub runs on the owner's PC at `http://127.0.0.1:8790` and sends work to four machines. Beam is the route named `mac`, and every engine the website uses is installed there (section 4). **Probed.** Four engines are named in the repository: Qwen 3.6 coder (drafts), gpt-oss (fixes and reviews), Mistral Medium 3.5 (the alt text writing lane) and Muse Glimmer 30B (the photo lane, which sees images). **Reported.**
- **Two Glow integrations already exist and work,** both on pull request #3, not yet merged: the vault sync, which writes the whole site into the Obsidian vault and a knowledge export for Glow, and the alt text pipeline, which has Glow describe photos and draft alt text as tick-box proposals. The first run's 28 spot-checked drafts were accurate. **Reported.** That run covered all 220 photos on 22 and 23 November: Muse Glimmer described them and gpt-oss:120b drafted the alt text, with no failures, as proposals for Claude's photo check and the owner's ticks (section 13, question 4). **Glow notes.**
- **The working rule is settled and should carry into the suite:** Glow proposes, machine checks gate the proposal, Claude reviews it, the owner approves it, and CI publishes it through a pull request. Glow never writes to the repository and holds no credentials.
- **The whole site is about 207,000 tokens of text** (1,789 chunks). It will not fit in one prompt for any engine, so the suite needs retrieval over the export. **Verified.**
- **Keeping the site online must not depend on Glow.** Glow runs on a PC that can be off or asleep. Alarms belong to fly.io's health check, an outside uptime monitor and scheduled GitHub Actions. Glow's job there is to read the results, explain them in plain words and draft the fix. None of those scheduled jobs exists yet. **Verified.**
- **The curation backlog is sized:** 220 photos to describe on 87 pages, 48 thin pages, 64 pages with no meta description and 14 with no H1 (both frozen), 16 redirects awaiting approval, 179 venues with no photos. **Verified.**
- **Pull requests #3 and #4 are merged.** They needed three fixes to go together: the `.dockerignore` conflict, the booking scale the vault sync could no longer find, and the vault seed notes the Docker build's tests need. All three went in through decant-rva/website-wlc#6, merged into `beam-lines-build` on 23 November (section 3). **Verified.**
- **Questions for the owner.** Answered from the PC (section 13): where the Glow brain lives and what it reads, what Beam's "Bright mode" is, the hub's routes and machines, and which models are installed. The owner decided the rest on 23 November: D-001 is accepted (curate through the Glow network and the vault, no admin screen), D-003 stays with one rule added (a batch of proposals runs only after the owner says yes to that run), and health notes go in a new `Status/` folder in the vault. Uptime monitoring starts on UptimeRobot's free plan, moving to Solo if it proves useful, with alerts to `info@weddinglightingco.com` (section 8). Nothing is left open.
- **One correction from the probes:** the hub's port on the PC serves only Ollama's own format. The OpenAI-format URLs answer 404 there, so the shared client should speak Ollama's `/api/chat` and `/api/generate` (section 4). **Probed.**

## 2. Where everything is

The site is a stack of draft pull requests. `main` still holds only the README.

| Branch | Pull request | What it holds |
|---|---|---|
| `main` | | README and ignore rules |
| `phase-3/foundation` | decant-rva/website-wlc#1, into `main` | Content import (272 URLs), static build, first design |
| `beam-lines-build` | decant-rva/website-wlc#2, into `phase-3/foundation` | The finished site: Beam Lines design, every template, quote form route, venue pages, photo bucket |
| `claude/quirky-edison-eas76b` | decant-rva/website-wlc#3, into `beam-lines-build` | **All the Glow work:** `tools/vault-sync.js`, `tools/glow-alt-text.js`, `vault/seed/` (including `GLOW.md`), their tests |
| `claude/kind-allen-bhqyfu` | decant-rva/website-wlc#4, into `beam-lines-build` | Launch blocker fixes, `/health/delivery`, retention, five more proposed redirects |
| `claude/eager-hawking-jbpfwn` | | This report |

Since 23 November, #3 and #4 are both merged into `beam-lines-build` through decant-rva/website-wlc#6, so every file below is on that branch. Files to read first:

| File | Why |
|---|---|
| `vault/seed/GLOW.md` | Glow's rules for the website, and the lessons from running the local models |
| `vault/seed/Curation/Curation Guide.md` | The proposal workflow and its statuses |
| `vault/seed/Curation/Alt Text with Glow.md` | The one complete Glow job, end to end |
| `vault/seed/DECISIONS.md` | D-001 (the vault is the curation surface), D-003 (AI output is always a draft) |
| `vault/seed/Knowledge/Brand Voice.md` | The voice rules the checks enforce |
| `tools/glow-alt-text.js` | The only code that calls the hub today. Its `draft()` is the seed of a shared hub client |
| `tools/vault-sync.js` | Builds the vault and the `_glow/` export. Exports `readEntries`, `parseEntry`, `codeConstants`, `cleanAlt`, `safeName`, `noteBase`, `FOLDER`, `sync` |
| `test/glow-alt-text.test.js` | How to test against a fake hub (`fetchImpl` injection, a `fakeChat` helper) |
| `docs/phase-1/ARCHITECTURE.md` (any branch) | Section 9a: the engine sits behind one interface so Glow, another local model or Claude can be swapped in |
| `README.md` on #4 | The server's settings, delivery guarantees and `/health/delivery` |

## 3. Merging #3 and #4: tested

**Done.** Both pull requests were merged into `beam-lines-build` on 23 November through decant-rva/website-wlc#6. It resolved the conflicts and fixed the vault sync as described below. It also fixed a third problem this trial merge missed: the Docker build stage runs the vault tests, so it now copies `vault/seed`, and `.dockerignore` lets the seeds through (`vault` then `!vault/seed`). At the merge: build 298 pages, inventory 272 of 272, tests 98 of 98, accessibility 0 issues, and CI's `build` and `docker` jobs green.

The trial merge of #3 into #4 that found the first two problems, in a scratch worktree with nothing pushed. **Verified.**

| Check | Result |
|---|---|
| Merge | One conflict, `.dockerignore` |
| `npm run build` | 298 pages in about 4 s; stylesheet pruned from 203 KB to 95 KB |
| `npm run check:inventory` | 272 of 272 match |
| `node --test` | 64 of 65 pass |

**The conflict.** #4 stopped ignoring `test/` (the Docker build now runs the tests) and added `.env`, `.env.*` and `.neon`; #3 added `test` and `vault`. Keep #4's version and add `vault`:

```
docs
!docs/phase-1/inventory.json
vault
```

**The failing test.** `test/vault-sync.test.js` expects a `## BOOKING` section in the vault's "Copy in code" note. #4 (commit `62d75cd`) moved the booking scale, service colour groups and subscribe form into `server/lib/quote-form-data.js`, so `templates.js` now builds `BOOKING` from `BOOKING_SCALE` and `codeConstants()` finds no literal to read. Fix: have `vault-sync.js` read `BOOKING_SCALE` (and `GROUP_COLOUR`, `SERVICE_GROUP`) from `server/lib/quote-form-data.js`, and point the "Copy in code" note and the proposal `file` field at that file. A copy edit to the booking scale then changes both the quote page and the notification email, which the note should say.

## 4. Glow's engines

### The engines

| Engine | Role in Glow | Public facts | Observed on this project |
|---|---|---|---|
| **Qwen 3.6 coder** | "Drafts" (GLOW.md) | Qwen3.6 is Alibaba's 2026 family built around agentic coding: a 27B dense and a 35B-A3B mixture-of-experts model, open weights, 262,144-token native context. Qwen advises keeping at least 128K of context so its thinking holds up. **Public** | Named in GLOW.md. Not used by any website tool yet. Tag `qwen3.6:35b-a3b-coding-mtp-q4_K_M` (the 35B-A3B model, 4-bit, multi-token-prediction build), on Beam and Shine. It is Glow's default lane; the hub turns its thinking off and fixes its context at 131,072. Ollama lists `vision` among its capabilities. **Probed, Glow notes** |
| **gpt-oss** | "Fixes and reviews" (GLOW.md) | OpenAI open-weight models, 20b and 120b, 128K context, Apache 2.0. Trained on the harmony format. In Ollama, `think` takes `"low"`, `"medium"` or `"high"`; true or false is ignored. Third-party reports say gpt-oss:20b often fails strict JSON schemas. **Public** | Its quirks showed up in the first alt text run's drafts (commit `dd68758`), so it most likely wrote them; the 28 drafts checked against their photos were accurate. Writes non-breaking hyphens and spaces (U+2010, U+2011, U+00A0, U+202F). With a small output budget it can spend everything reasoning and return nothing. **Reported.** Both sizes are installed on Beam (`gpt-oss:20b`, `gpt-oss:120b`), and the 120b drafted the first run's alt text. Glow's own notes rate it medium-high for short copy from a photo description, but it follows a wrong prompt rule faithfully. **Probed, Glow notes** |
| **Mistral Medium 3.5** (`mistral-medium-3.5`) | Default writing lane in `glow-alt-text.js draft` | Open weights since late April 2026: 128B, multimodal (text and images), 256K context, modified MIT licence with a revenue carve-out. **Public** | The default `--model` for alt text drafting, through the hub's `/ollama/mac/api/chat`. The first run did not use it: gpt-oss:120b drafted instead, because loading Mistral would have pushed out the 120b another job was using. Tag `mistral-medium-3.5:latest` (128B, 4-bit, 80 GB), on Beam only. In Glow's tests it writes the most natural copy, at about 7 tokens a second; it thinks by default, so drafts should send `think: false`. Ollama lists `vision` among its capabilities. **Probed, Glow notes** |
| **Muse Glimmer 30B** (`muse-glimmer:30b`) | "Glow's photo lane": sees photos and describes them | Meta's open model: a 2B vision encoder and a 28B text decoder. Ollama's first release took images only through its MLX engine on Apple Silicon. **Public** | Runs through `describe-photo.js` in the owner's local-llm folder, about 20 s a photo. Writes long descriptions and can be wrong about names. Needs Beam on Ollama, not in Bright mode. **Reported.** Tag `muse-glimmer:30b` (27.9B, 4-bit, 18 GB), on Beam only, with a 131,072 context. It described all 220 website photos with no errors at 16.6 s a photo on average. **Probed, Glow notes** |

### The machines and the hub

| Piece | What is known |
|---|---|
| **The hub** | `http://127.0.0.1:8790` on the owner's PC. It listens on that PC only and takes no credentials. Model calls go to `/ollama/<machine>/api/<call>` for the machines `mac`, `mac36`, `studio` and `rtx`; any other name answers 404 `unknown node`. **It speaks only Ollama's format:** `/ollama/mac/v1/models`, `/ollama/mac/v1/chat/completions` and `/v1/models` all answer 404. `generate` and `chat` calls are tracked as jobs and queued. Every other Ollama call (`version`, `tags`, `ps`, `show`, `embed`, and the model management calls too) passes straight through, so the shared client should allow only the calls it needs. Shows each machine as a card and labels jobs from the `X-LLM-*` headers. **Probed** |
| **Hub status routes** | `GET /api/health` (up or not); `GET /api/state` (each machine: online or not, what it is doing, installed and loaded models); `GET /api/referee` (jobs running and waiting, and why); `GET /api/bright` (Beam's mode). A suite of jobs can reserve Beam with `POST /api/referee/reserve` and the header `x-glow: 1`. The reservation holds back other projects' trial jobs, while ordinary work and chat carry on. **Probed, Glow notes** |
| **Beam** | The `mac` route: an Apple Silicon Mac with 128 GB of unified memory, of which about 110 GiB can hold models. It runs two jobs at once per model and keeps several models loaded; when probed it held gpt-oss:120b, the Qwen 3.6 coder and the embedder (82 GiB). Mistral Medium 3.5 (80 GB) and gpt-oss:120b (65 GB) do not fit together, so loading one pushes the other out. Has an Ollama mode and a Bright mode, and the website's engines need Ollama mode (next row). **Probed, Glow notes** |
| **Bright mode** | A mode of Glow Chat, the owner's offline chat page. Its Bright switch stops Ollama on Beam and runs one large reasoning model (Qwen3.8-Flash-Next, served by MTPLX) alone on the whole machine. While Bright is on or switching (about 20 s to switch on, about 30 s to switch back with reloads), every Beam job for any other model gets **HTTP 503**, with an `error` that names Shine (`mac36`) as the place to send it. Beam switches back after 30 minutes without a Bright request. `GET /api/bright` returns `mode`: `off`, `starting`, `on` or `stopping`, so pre-flight should require `off`. It was off during the probes and was not switched. **Glow notes** (the hub's code and docs) |
| **Shine, Arc, Beacon** | Shine (`mac36`): a smaller Mac with the same Qwen 3.6 coder and gpt-oss:20b. It is Glow's overflow when Beam has two jobs running on a model, and takes one job at a time. Arc (`studio`): the hub's own PC, with two consumer GPUs; its Ollama did not answer during the probes (502). Beacon (`rtx`): a laptop GPU that runs Glow's own upkeep, and Glow's rules keep other work off it. None of the three has Mistral Medium 3.5 or Muse Glimmer. **Probed, Glow notes** |
| **The Glow brain** | Not on Beam. It is a folder of Markdown notes on the owner's PC, beside the hub, laid out by a house standard: facts, procedures, decisions, episodes, sources and maps, with generated indexes and an append-only log. It is not a program and loads nothing by itself. Agents read its rules and maps, and a script can hand the whole brain to Beam in one prompt. The part that reads is Glow Chat's Glow Mode. It searches every brain and Obsidian vault on that drive by embedding heading-sized passages with `nomic-embed-text` on Beam, and gives each question the 14 best passages, at most 3 per file. It has no timer: a source is re-indexed when a search touches it and its index is over 10 minutes old, and passages that have not changed keep their vectors. The website vault is already registered as a source, because it has an `.obsidian` folder, but it had not been indexed yet when probed. A move of Glow's files to another PC on the same network is planned. **Glow notes, Probed** |
| **`describe-photo.js`** | In the owner's local-llm folder, not in any repository. Writes `descriptions.jsonl`, one JSON object per line. Key names vary (`file`, `photo`, `path`; `description`, `text`, `response`). Failed photos get a line with `error` set, sometimes beside a cut-off description, and are retried on the next run. **Reported.** It calls Muse Glimmer through `/api/generate` with `think: false`, temperature 0, `num_ctx` 16384 and at most 1,500 tokens, and never uses `format`, because a schema skewed photo answers in an earlier vision bake-off. **Glow notes** |
| **Vault** | On the owner's PC, outside this repository. It was filled on 23 November by the first alt text run: 488 site notes, 25 seed notes, and an export of 505 notes in 1,791 chunks. The run's 79 proposal notes are in its `Curation/Proposals/`. **Glow notes** |

### The hub contract, as far as it is known

This is what `glow-alt-text.js` sends and expects today. **Reported, and covered by its tests.**

```
POST http://127.0.0.1:8790/ollama/mac/api/chat
content-type: application/json
X-LLM-Requester: claude
X-LLM-Project: Website WLC
X-LLM-Task: alt text: <photo file>

Ollama format:  { model, stream: false, options: { num_predict, temperature }, messages: [...] }
OpenAI format:  { model, stream: false, max_tokens, temperature, messages: [...] }   (URL ends in /chat/completions)

Reply text:     Ollama  data.message.content (or data.response)
                OpenAI  data.choices[0].message.content
```

The OpenAI format above is not served by the hub's port on the PC: its URLs answer 404 there. The default, `/ollama/mac/api/chat` in Ollama's format, is the one that works. **Probed.**

Lessons already learned, which the shared client should build in:

1. **Output budget of 6,000 tokens or more.** If a reply is empty or unparseable, retry once at 12,000 with `think` dropped to `"low"`, never with a smaller budget. (`GLOW.md`, `draft()`; the probes found that empty replies come from a schema with `think: "high"`, section 11, items 5 and 6.)
2. **Terse system prompt:** "Answer immediately, minimal reasoning. Output only the JSON object. No preamble."
3. **Strip end tokens** (`<|eot|>`, `<|eot_id|>`, `<|endoftext|>`, `<|im_end|>`, `<|end|>`) and code fences, then parse the first `{` to the last `}`.
4. **Normalise characters:** non-breaking hyphens to `-`, non-breaking spaces to plain spaces.
5. **Temperature 0.2** for anything that must follow rules.
6. **Timeout 300 s** a request. Work is written to JSONL as it goes, so a run can stop and continue.
7. **The models invent specifics** (names, URLs, sources). Prompts give facts with their sources and forbid anything else, and the checks look for what slipped through.

These were listed here as unknown and have now been probed on the PC, with the answers in section 11: the full route list; whether the hub passes through `/api/tags`, `/api/ps`, `/api/show`, `/api/embed` and `/v1/models`; streaming; queueing when two jobs arrive; whether `format` (a JSON schema) and `think` pass through; any authentication; and how a job can tell Beam is in Bright mode.

### Ollama features the suite can use

**Public**, worth confirming through the hub:

| Feature | Use |
|---|---|
| `format: <JSON schema>` on `/api/chat` (OpenAI route: `response_format`) | Forces the reply's shape and removes most parsing failures. Keep the tolerant parser as a fallback: gpt-oss is reported to break schemas, and one report says `format` and thinking clash. **Probed:** it passes through the hub and works with `think: "low"`. With `think: "high"` gpt-oss often spends the whole budget reasoning and returns nothing, and a `maxLength` in the schema truncates the string mid-word (section 11, item 5) |
| `think: "low" \| "medium" \| "high"` (gpt-oss) | Low for labelling and triage, high for fact checking |
| `keep_alive` | Keeps a model loaded between jobs. Loading a large model takes time, so run jobs grouped by model |
| `options.num_ctx` | Ollama's default context window can be far below these models' maximum, depending on the version; set it to what the prompt needs. **The hub enforces some of this** (**Probed, Glow notes**). It fixes the Qwen 3.6 coder at 131,072 on Beam and Shine whatever the caller sends. It sizes a missing `num_ctx` for Mistral Medium 3.5 to the prompt and refuses more than 32,768 (400), or a size clearly under the prompt (413); without that guard, Mistral's 262,144 default would fill Beam's memory. For other models, keep to the size already loaded (`/api/ps` shows it), because a different `num_ctx` makes Ollama reload the model |
| `images: [base64]` on a message | Vision input for Muse Glimmer. **Probed:** Mistral Medium 3.5 and the Qwen 3.6 coder accept it through the hub too, and gpt-oss refuses it with HTTP 400 |
| `/api/embed` | Embeddings for retrieval. Candidates: `qwen3-embedding` (0.6B, 32K context, Apache 2.0) or `nomic-embed-text` (8K context). Some embedding models expect a prefix on inputs; check the model card. **Installed: `nomic-embed-text` only.** It answers through the hub in about 30 ms with 768 dimensions, and Glow Mode already uses it. **Probed** |
| `/api/ps`, `/api/tags` | What is loaded and what is installed. The probe and a pre-flight check for each job |

## 5. What the website gives Glow today

### The vault and the export

`npm run vault -- <vault folder>` on #3, measured on the merged code. **Verified.**

| | |
|---|---|
| Run time | 0.35 s; needs only Node, no build |
| Notes written | 488 generated (272 pages, 202 venues, hub notes) and 25 seed notes |
| `_glow/brief.md` | 13,747 characters: rules, business, voice, services, where to look. Fits any engine's context |
| `_glow/index.jsonl` | 1,789 chunks from 505 notes, at most 1,800 characters each, 1.3 MB. Fields: `id`, `note`, `title`, `type`, `url`, `source`, `status`, `generated`, `section`, `text` |
| Text in the index | 829,000 characters, about 207,000 tokens |
| `_glow/manifest.json` | Commit, date and counts, so Glow can say when its knowledge is stale |
| Counts | 109 pages, 29 posts, 134 products, 202 venues (23 with pages), 559 photos, 18 redirects |

The index by note type, which shows where retrieval matters most:

| Type | Chunks | Characters |
|---|---|---|
| product | 533 | 185,128 |
| post | 259 | 195,259 |
| venue | 255 | 53,208 |
| page | 224 | 165,352 |
| listing | 201 | 52,595 |
| hub | 128 | 100,440 |
| knowledge | 68 | 30,384 |
| catalog | 59 | 19,439 |
| note | 41 | 16,442 |
| guide | 13 | 6,094 |
| rules | 8 | 4,961 |

What this means for the suite: the brief goes into every prompt. Everything else is retrieved by job: the page being worked on (its `Site/...` note by `url`), plus the closest few chunks for the question, plus the knowledge notes the rules require (Brand Voice, Business Profile). 1,789 chunks is small enough that embeddings fit in a flat file and a brute-force cosine search takes milliseconds. No vector database is needed.

### The curation backlog

From the vault's `Site/Content Gaps` note and `glow-alt-text.js prepare`, on the merged code. **Verified.**

| Gap | Count | Glow can | Blocked by |
|---|---|---|---|
| Photos with no alt text | 264 on 88 pages. 220 can be described (on 87 pages), 13 are icons, 31 are no longer served by the old host. 42 of the 220 have venue evidence in their context. 78 are on one page, `/drape-walls-backdrops-canopies` | Describe and draft (the existing job) | Nothing. Alt text is outside the launch freeze |
| Thin pages (under 150 words, or 40 for a product) | 48 | Draft expansions from vault facts | Owner review; voice |
| Pages with no meta description | 64 | Draft descriptions | The launch freeze: proposals are held (`freeze: true`) |
| Pages with no H1 on the previous site | 14 | Draft headings | The launch freeze |
| Internal links that work only through a proposed redirect | 11 | Propose the direct link | Nothing |
| Redirects awaiting the owner's approval | 16 | Summarise each for a quick yes or no | The owner |
| Venues with no photos | 179 | Match photos to venues by sight and context | Needs a photo source beyond the site |
| Internal links to pages that do not exist | 0 | | |

Describing 220 photos at about 20 s each is about 75 minutes of Beam time. The owner then reviews 87 page notes with tick boxes, not 220 separate decisions.

### The server contract a monitor would call

Measured against the merged server on a local port. **Verified.**

| Request | Answer |
|---|---|
| `GET /health` | `200 {"ok":true,"sha":"<commit>","staging":false}`. Not logged |
| `GET /health/delivery` without `STATUS_TOKEN` set | 404 |
| `GET /health/delivery` with `X-Status-Token` | `{db, pending, failed, oldestPendingMinutes}`; 503 when the database does not answer within 3 s |
| `GET /uplighting` | 200, `cache-control: public, max-age=300` |
| `GET /uplighting/` | 301 to `/uplighting` |
| `GET /nope` | 404 page, `no-store` |
| `GET /sitemap.xml` | 200, 256 URLs |

### What is live

**Verified** from this session: `www.weddinglightingco.com` still serves the Wix site (200, Wix and Cloudflare response headers). This environment's network rules block `*.fly.dev`, so whether staging or production is deployed, and at which commit, could not be checked. The Phase 1 plan puts launch in mid-January 2027, with the Wix billing switch due before 21 December.

## 6. Matching engines to jobs

A starting point, to be confirmed by a small bake-off (section 10): the same 20 items through each candidate engine, scored by the deterministic checks and then by the owner's decisions.

| Kind of work | First choice | Second opinion | Why |
|---|---|---|---|
| Seeing a photo | Muse Glimmer 30B | None | The proven photo lane: it described all 220 website photos with no errors. Mistral Medium 3.5 and the Qwen 3.6 coder also take images (next row) |
| Seeing a photo and writing its alt text in one call | Mistral Medium 3.5 or the Qwen 3.6 coder, both of which take images through the hub (**Probed**) | Checks, then Claude | Would remove a step and a 20 s description per photo. Tried on one photo only, where both were accurate; the 20-photo comparison is still to run |
| Short rule-bound copy (alt text, meta descriptions, headings) | gpt-oss or Mistral Medium 3.5 | Checks, then Claude | Alt text drafts from the first run were accurate |
| Longer copy in the owner's voice (thin page expansions, post drafts) | Mistral Medium 3.5 or Qwen 3.6 | gpt-oss, reasoning `high`, asked to list every claim and its source | Drafting and checking by different models catches inventions before Claude sees them |
| Changes to code or data files (`templates.js` copy, `venues.json`, `redirects.json`) | Qwen 3.6 coder | gpt-oss | The coder lane. Claude still makes the actual edit |
| Labelling and triage (404s, dead links, log lines, photo categories) | gpt-oss, reasoning `low` | None | Fast and good at classifying |
| Fact consistency across pages | gpt-oss, reasoning `high` | Claude | Needs care, not speed |
| Embeddings for retrieval | `nomic-embed-text` | | The one installed on Beam, and what Glow Mode already uses. **Probed** |

Practical points:

- **Group jobs by model.** Beam cannot hold Mistral Medium 3.5 (80 GB) beside gpt-oss:120b (65 GB) in its roughly 110 GiB for models (**Glow notes**). Run every description, then every draft, then every review, rather than switching per item. Check `/api/referee` first, because another project may be using the model a job would push out. That happened on the first alt text run, which is why it drafted with the 120b.
- **Record the model in every proposal** (the `model` front matter field already exists). Acceptance rates per model and job are how routing gets decided later.
- **Read the Mistral Medium 3.5 licence's revenue clause** before relying on it in production use; it is a modified MIT licence, not plain MIT.

## 7. Managing the site: jobs for Glow

Each job follows the alt text pattern: a deterministic **collect** step finds the work and its context, a **draft** step calls Glow, a **check** step applies rules in code, a **proposals** step writes notes into `Curation/Proposals/`, and an **apply** step (run by Claude on a branch, only for approved notes) changes the repository.

| Job | Engines | Output | Gate | Status |
|---|---|---|---|---|
| **Alt text for existing photos** | Muse Glimmer 30B, then a writing lane | One note per page, a tick box per photo | Length, no dash, no sales words, venue only with evidence | Built (#3). 220 photos to run |
| **Photo sorting on upload** (architecture 9a) | Muse Glimmer 30B, gpt-oss to label | Category, venue and alt text suggestions for each new photo | Venue only with evidence; owner ticks | Not built. Reuses the alt text steps |
| **Photo to venue matching** | Muse Glimmer 30B | "This photo looks like venue X" proposals, citing what in the photo matches | Owner ticks | Not built. Would have caught the 19 venue covers misfiled under Mount Ida (commit `b82a9b8`) |
| **Thin page expansion** | Mistral Medium 3.5 or Qwen 3.6, reviewed by gpt-oss | One proposal per page: Current and Proposed body | Exact match of Current; every number and name in Proposed found in a cited note; voice checks | Not built |
| **Internal link suggestions** | Retrieval plus gpt-oss | One proposal per page: sentence, anchor, target URL | Target is in the sitemap; anchor text exists verbatim in the page | Not built |
| **Meta descriptions and headings** | gpt-oss or Mistral Medium 3.5 | Proposals marked `freeze: true` | Length (descriptions under about 155 characters); held until the freeze lifts | Not built |
| **Blog post drafts** | Mistral Medium 3.5 or Qwen 3.6, reviewed by gpt-oss | One `Post Draft` proposal per request | Facts cited; owner approves the URL | Not built. One per request (D-003) |
| **Consistency and typo sweep** | gpt-oss, reasoning `high` | Findings: page, quote, what disagrees with what | Every finding quotes both sources verbatim | Not built |
| **Redirect decisions** | gpt-oss | For each proposed redirect: old URL, target, whether the target covers the same topic | The owner decides | Not built |
| **Questions about the site** | Any, with retrieval | An answer citing vault notes | None; it changes nothing | Not built |

Out of scope for Glow, by its rules: reviews and testimonials (verbatim, never edited), URLs (never changed or invented), leads, customers, crew, prices not in the vault, and anything from GigFriend.

## 8. Keeping the site online

### Who watches what

| Layer | Watches | Runs on | Exists? |
|---|---|---|---|
| fly.io health check | `GET /health` every 30 s; restarts a failing machine | fly.io | Yes (`fly.toml`) |
| Outside uptime monitor | Home page, `/health`, and `/health/delivery` with `X-Status-Token`: alert when not 200 or `oldestPendingMinutes` passes 60 | A monitoring service | No. Needs `STATUS_TOKEN` set and a monitor chosen (options below) |
| Daily undelivered summary | Quote requests still undelivered, emailed after 13:00 UTC | The app | Yes (#4) |
| Scheduled GitHub Actions | Architecture section 11: weekly link check, dependency updates, nightly database and weekly media backup | GitHub | **None exist.** Only `ci.yml` and `media.yml` |
| Glow | Reads the results above, explains them and drafts fixes | The owner's PC | Not built |

Glow must not be the alarm. When the PC is asleep, Glow is silent, and a silent watcher looks like good news. Alarms come from the always-on layers; Glow turns their output into something the owner can act on in a minute.

### Uptime monitor options

The monitor has to check from outside, every few minutes, and must not run on fly.io or the owner's PC. It checks three things: the home page (200 and a phrase from the page), `/health` (200), and `/health/delivery` with the `X-Status-Token` header (200 and `oldestPendingMinutes` under 60). It alerts by phone push and email.

One small server change would make any monitor work: have `/health/delivery` answer 503 when `oldestPendingMinutes` passes 60 or `failed` is above 0. The monitor then only has to send the header and check for 200, not read the reply. Today it answers 200 in that case, and only a monitor that reads JSON would notice.

Free tiers as published in November 2026; check the plan page before relying on one.

| Option | Free tier | Fits | Watch out for |
|---|---|---|---|
| **Better Stack** | 10 monitors and 10 heartbeats, every 3 minutes, email and Slack alerts, a phone app, one status page | Simplest pager for the home page and `/health`. Its heartbeats can also catch a scheduled job that stops running | Its HTTP monitors can send request headers (its docs cover them), but whether the free plan includes that was not confirmed |
| **UptimeRobot** | 50 monitors, every 5 minutes | Generous and familiar | The free plan was personal use only from December 2024. Several write-ups quoting the current terms say business use has been allowed again since mid-2026; confirm on the terms page. Custom request headers are a paid feature |
| **Checkly** (Hobby) | About 10,000 API check runs a month, with assertions on status, body and headers | Sends the header and can check `oldestPendingMinutes` itself, so no server change is needed | 10,000 runs is about one check every 9 minutes for two endpoints. Set up as code, aimed at developers |
| **Google Cloud uptime checks** | Reported as 1 million executions a month free per project | Custom headers, content checks, and email or SMS alerts | Needs a Google Cloud project with billing turned on. The most setup of the list |
| **GitHub Actions on a schedule** | Free in a public repository | The deeper checks below (sitemap, redirects, running commit, certificate), opening an issue on failure | Not a pager: scheduled runs can start late, and GitHub turns schedules off after 60 days without activity in a public repository |
| **Uptime Kuma** (self-hosted) | Free software | Full control | Needs an always-on machine that is neither fly.io nor the owner's PC |

Paid options, for faster checks and stronger alerts. Prices are as listed in November 2026, mostly from the vendors' pages and partly from third-party listings, so confirm before buying:

| Option | Price | Over the free tiers | Fit |
|---|---|---|---|
| **UptimeRobot Solo** | About $7 a month billed yearly, $8 monthly (some listings show up to $12) | 60-second checks, certificate expiry checks, custom request headers (a paid feature; confirm Solo includes it) | **Best value.** Covers all three checks, with the `/health/delivery` server change above |
| **Better Stack Responder** | $29 a month billed yearly, $34 monthly, per person | 30-second checks, phone call and SMS alerts, on-call scheduling, heartbeats, status page | **The premium choice**, if an alert should ring a phone at night. It costs more than the site's hosting: the Phase 1 report puts the whole stack at $15 to $25 a month |
| **Hyperping Essentials** | From about $24 a month billed yearly | 30-second checks, status pages, reports | Same tier as Better Stack's paid plan |
| **updown.io** | Pay per check, in prepaid credit packs | Checks every 15 seconds to 1 hour, text match | Very cheap for three checks; custom headers not confirmed |

Suggested setup:

- **The pager:** UptimeRobot Solo for the home page, `/health` and `/health/delivery`. Choose Better Stack Responder instead if phone calls are wanted. The free fallback is Better Stack's free plan plus Checkly's.

**Owner's choice, 23 November 2026:** start on UptimeRobot's free plan and move to Solo if it proves useful. Alerts go to `info@weddinglightingco.com`, the owner's alias and the inbox that already gets quote notifications and the daily undelivered summary. While on the free plan:

- **Checks run every 5 minutes** on the home page, plus `/health` once the new site is live.
- **`/health/delivery` is not checked,** because custom headers are a paid feature. The app's daily email of undelivered quote requests covers it until the upgrade.
- **Until launch,** the home page monitor watches the Wix site; at cutover the same URL starts watching the new one.
- **Business use:** confirm on UptimeRobot's terms page at sign-up that the free plan allows it.
- **`/health/delivery` answers 503 once a delivery has waited 60 minutes** (the server change above), so the monitor only needs the header and a status check.
- **A daily GitHub Action for the deeper checks**, which pings a heartbeat monitor when it finishes, so a schedule that silently stops is noticed. Missed scheduled jobs are the failure `gigfriend-server` already ran into (architecture section 11).

### Checks to run on a schedule, with no model involved

These belong in a scheduled GitHub Action (always on, and it can open an issue) or in the suite's `watch` command on the PC, writing a dated note into the vault:

1. `/health` answers 200 and its `sha` equals the head of the deployed branch (catches a deploy that did not happen or rolled back).
2. `/health/delivery` is 200 and `oldestPendingMinutes` is under 60.
3. Every URL in `/sitemap.xml` answers 200; every redirect in `content/redirects.json` is one hop to a 200.
4. Staging sends `noindex` and asks for its password; production does not send `noindex`.
5. The TLS certificate has more than 21 days left; DNS for `www` and the bare domain resolves as expected.
6. A handful of template pages stay under the performance budgets in architecture section 11 (LCP under 2.5 s, CLS under 0.1).

### Where Glow helps

| Job | Engine | What it does |
|---|---|---|
| **Health note** | gpt-oss, reasoning `low` | Turns the check results into a short note: what is fine, what is not, what to do. Writes to `Status/` in the vault, which the owner approved on 23 November. Same pattern as Glow's daily "Vault health" note in another vault: rewritten on each run, never edited by hand |
| **404 triage after launch** | gpt-oss | Groups 404s from the fly logs by likely cause (old Wix URL, typo, bot) and proposes redirects for the real ones. Redirect proposals still need the owner |
| **Dead external link triage** | gpt-oss | For each dead link from the weekly check: moved (proposes the new URL), gone (proposes removing it) or temporary |
| **Dependency update review** | Qwen 3.6 coder | Reads the changelog and diff of an automated update and writes a risk note on the pull request's proposal. CI still decides whether it passes |
| **Incident write-up** | Mistral Medium 3.5 or gpt-oss | From logs and the timeline, a draft incident note for `PROJECT-STATUS.md` (observed results only) |
| **Launch monitoring log** | gpt-oss | For the two weeks of daily monitoring after cutover (Phase 1 plan), drafts each day's entry from the check results |

The script, not the model, holds credentials. A runner on the PC fetches logs or check results with the owner's `fly` or `gh` login and hands Glow only the text. Glow never gets a token.

## 9. Cutting curation work

The owner's attention is the scarce resource. Each mechanism below takes a decision off the owner, or makes one faster.

1. **Check in code before anyone reads it.** Everything a machine can verify, verify:
   - "Current" appears verbatim in the file named in `file`.
   - `field` and `freeze` agree (title, description, canonical and H1 mean `freeze: true`).
   - Every note in `sources` exists in the vault.
   - Every number, price, year and proper noun in "Proposed" appears in "Current" or a cited note.
   - No em-dash or banned word (Brand Voice and `BANNED` in `glow-alt-text.js`), and length limits per field.
   - No new or changed URL, no edited review, and every link target is in the sitemap.

   A proposal that fails is marked, not deleted, so patterns show.
2. **A second engine reviews the first.** gpt-oss lists each claim in a draft and the note that supports it, before Claude sees it. Claude then checks a short list instead of the whole text.
3. **Batch by page, tick by item.** This is proven by the alt text job: one note per page, boxes ticked only when every check passed, and the owner unticks or edits.
4. **One apply for every kind of proposal.** `glow-alt-text.js apply` already applies ticked alt text and never overwrites existing alt text. Generalise it: replace Current with Proposed exactly (fail if Current is gone), add facts, approve a redirect, add a post file. Approved notes become one pull request per batch, with the notes linked.
5. **Detect stale proposals.** Each proposal records the export's commit from `manifest.json`. If the target file changed since, mark the proposal `stale` (a new status) and draft it again rather than have Claude find out at apply time.
6. **No duplicate proposals.** Before writing, check open proposals for the same `target` and `field`. GLOW.md asks Glow to; the suite should enforce it.
7. **Learn from rejections.** The owner's reasons under "Review" become examples in the next prompt for the same job ("the owner rejected this because..."). Count acceptance per job and model; drop what keeps failing.
8. **One queue view.** A generated `Curation/Queue` note with counts by status and links: waiting for Claude, waiting for the owner, approved and ready to apply, held by the freeze, stale.
9. **Keep the vault current without thinking about it.** Run `npm run vault` after every pull on the PC (a Git `post-merge` hook or a scheduled task), so Glow never works from an old copy of the site.
10. **One place for questions.** Glow asks only under "Questions for the owner" in its proposals; the suite rolls those up into `Knowledge/Open Questions` for one sitting.

## 10. Suggested shape of the suite

A recommendation, not a decision. It extends what #3 already does rather than replacing it.

```
tools/glow/
  client.js       hub client: Ollama's format only (the hub serves no other), X-LLM headers, budget retry, timeout,
                  think level, JSON schema with tolerant fallback parse (length limits checked in code, not in the
                  schema), the loaded model's num_ctx from /api/ps, character cleanup; records model, machine, time
                  and tokens; calls only the hub routes it needs
  engines.json    role -> { route, model, format, think, budget, timeout }; roles: vision, write, review, code, label, embed
  probe.js        what the hub and each engine can do; writes capabilities.json (section 11)
  retrieve.js     embeds _glow/index.jsonl through /api/embed, caches by chunk hash, cosine search; keyword fallback
  proposals.js    read, write and validate proposal notes; statuses; stale detection; queue note; generalised apply
  checks.js       the deterministic checks in section 9, shared by every job
  jobs/           alt-text (moved from tools/glow-alt-text.js), photo-sort, venue-match, thin-pages, links,
                  meta-held, post-draft, consistency, redirects, ask
  watch.js        the scheduled checks in section 8, a status note, an optional Glow summary
  cli.js          npm run glow -- <job> <step> [options]
test/glow/        each module against a fake hub, as test/glow-alt-text.test.js does
```

Design points:

- **One engine interface,** as architecture section 9a asks: a job names a role, never a model. Changing an engine is a one-line edit in `engines.json`, and Claude's API could be a backend for the same roles.
- **Ask before a batch (D-003).** A job that would write more than one proposal first shows what it will do (how many items, which engine, roughly how long) and waits for the owner's yes. The run's summary note records who said yes and when.
- **Every step can be re-run.** Work folders hold JSONL that grows as items finish, as the alt text job does. A machine that goes to sleep halfway costs nothing.
- **Pre-flight before each run:** the hub answers (`/api/health`), the model is installed on the machine (`/api/tags`), `GET /api/bright` reports `mode: off`, and `/api/referee` shows no other project using a model the job would push out of Beam's memory. A long run reserves Beam with `POST /api/referee/reserve`. On a Bright mode 503, send the job to Shine (`mac36`) if it has the model, or wait. Stop with a plain message, not 220 timeouts.
- **This repository is public.** Prompts, code and the engine config can live here. The vault's contents, proposals and anything internal stay in the vault, and the vault's own Git repository, if it gets one, stays private.
- **Testing.** Cloud sessions cannot reach the hub or `A:\`, so every module takes a `fetchImpl` and a folder, and the tests use a fake hub. Real runs happen on the PC.

## 11. First tests on the owner's PC

To test against the real engines, the next session must run on the PC: the Claude Desktop app, or `claude remote-control` in the website checkout's folder there. These answers replace every **Inferred** mark above. A `probe.js` that runs them and writes `capabilities.json` is the suggested first piece of the suite.

**Run on 23 November 2026,** from a session on the owner's PC, through the hub at `127.0.0.1:8790`, labelled with the project "Website WLC". Beam was reserved for the run through the hub, and another project was using gpt-oss:120b on Beam throughout. Each answer is in italics under its question. **Probed** unless marked otherwise.

1. **Routes.** Which machines does the hub expose (`/ollama/<name>/...`)? Is there a route list or status page on `:8790`?
   *Four machines: `mac` (Beam), `mac36` (Shine), `studio` (Arc) and `rtx` (Beacon). Any other name gets 404 `{"error":"unknown node <name>"}`. There is no route list. The dashboard is at `/`, and `GET /api/state` gives every machine's state, installed and loaded models, and activity. `GET /api/health` answers `{"ok":true,"version":"1.0.0"}`. Arc's Ollama did not answer during the probes: the hub replied 502 with "unreachable".*
2. **Pass-through.** Through the hub: `GET /ollama/mac/api/version`, `/api/tags`, `/api/ps`; `POST /api/show`, `/api/embed`; `GET /v1/models`. Which answer?
   *All the `/api/...` calls answer 200 on Beam, Shine and Beacon. Beam ran Ollama 0.40.17, and Shine and Beacon 0.40.16. `/api/show` gives each model's capabilities. `/api/embed` with `nomic-embed-text` returned 768 dimensions in about 30 ms. The OpenAI routes answer 404, both `/ollama/mac/v1/models` and `/ollama/mac/v1/chat/completions` and the bare `/v1/models`, because the hub's port on the PC matches only `/ollama/<machine>/api/<call>`. Streaming works: the probes below streamed (`stream: true`) through the hub, except the two Mistral calls. No call asked for credentials. Control calls (`/api/referee/reserve`, the Bright switch) need the header `x-glow: 1`, which is a guard against stray browser requests, not a secret.*
3. **Installed models.** The exact tags for Qwen 3.6 coder, gpt-oss (20b or 120b), Mistral Medium 3.5 and Muse Glimmer, and any embedding model.
   *On Beam: `qwen3.6:35b-a3b-coding-mtp-q4_K_M`, `gpt-oss:20b`, `gpt-oss:120b`, `mistral-medium-3.5:latest`, `muse-glimmer:30b` and `nomic-embed-text:latest`, among 15 models. Shine has the coder and `gpt-oss:20b`. Beacon has `gpt-oss:20b`, small `qwen2.5-coder` builds and `nomic-embed-text`. Ollama lists `vision` for the coder, Mistral Medium 3.5 and Muse Glimmer, but not for gpt-oss.*
4. **Per engine,** on one fixed prompt: time to first token, tokens per second, load time from cold, and the largest `num_ctx` that works.
   *The fixed prompt was a photo description plus the alt text instruction (about 150 to 190 prompt tokens), streamed through the hub. The replies were short, so the rates are lower than on long output.*

   | Engine (machine) | First token, warm | Generating | Load | Notes |
   |---|---|---|---|---|
   | Qwen 3.6 coder (Beam) | 20 to 210 ms | 96 to 179 tok/s | 74 s from cold | The 74 s load came after another job had pushed the coder out of memory. Glow's notes record 1 to 5 s when the model file is still cached. A whole reply took 0.2 to 0.6 s |
   | Qwen 3.6 coder (Shine) | 28 ms | 140 to 148 tok/s | already loaded | |
   | gpt-oss:20b (Beam) | 50 to 170 ms, then reasoning | 60 to 111 tok/s | 12.7 s from cold | At default effort it reasoned for 860 to 1,560 tokens before answering (8 to 14 s). At `think: "low"` with a schema it answered in about 1 s |
   | gpt-oss:120b (Beam) | about 65 ms, then reasoning | 76 to 79 tok/s | see note | Default effort: about 1,500 tokens and 20 s of generating. At `think: "low"` with a schema it answered in about 1 s. Its 3 to 29 s loads were reloads (see the trap below the table); Glow's notes record about 3 s from cache |
   | Muse Glimmer 30B (Beam) | 1.5 to 1.7 s with a photo | 27 to 31 tok/s | 3.9 s from cold | 150 to 160 tokens a description, 5 to 9 s for a small (37 KB) photo. The real run averaged 16.6 s on photos of up to 1,200 px |
   | Mistral Medium 3.5 (Beam) | not measured (non-streamed) | 7.5 to 7.8 tok/s | 13.4 s from cold | Reads a prompt with a photo at 73 to 113 tok/s. A 33-token description took 24 s including the load, and a one-call alt text 6 s |

   *The largest `num_ctx` was not pushed to failure, because that means reloading shared models with huge contexts. What works today: the coder at 131,072 (the hub fixes it there), gpt-oss:120b at both 32,768 and 131,072 (60.5 GiB either way), and Muse Glimmer and gpt-oss:20b at 16,384. Mistral Medium 3.5 is capped by the hub at 32,768.*

   *The probe also found a trap. Two callers that send different `num_ctx` values to one model make Ollama reload it each time their jobs alternate. The 120b was in use by another job at 131,072 while these probes sent 32,768, so that job's loads rose from about 1 ms to 37 to 98 s until the probes stopped. The hub fixes `num_ctx` only for the coder, so the shared client should read `/api/ps` and send the loaded model's `context_length` whenever that is large enough.*
5. **Structured output.** Does `format` with a JSON schema reach the model, and does each engine keep to it? With gpt-oss, with `think` at `low` and at `high`?
   *Yes, `format` and `think` both pass through the hub. With a schema of `alt` (string, `maxLength` 125), `decorative` (boolean) and `confidence` (enum), three runs each:*

   | Engine and setting | Valid replies | Notes |
   |---|---|---|
   | Qwen 3.6 coder (thinking off) | 3 of 3 | About 0.5 s |
   | gpt-oss:20b, `think: "low"` | 3 of 3 valid, but every `alt` was cut off | All three were exactly 125 characters and stopped mid-word ("dance floor with mon"): Ollama enforces `maxLength` by truncating the string |
   | gpt-oss:20b, `think: "high"` | 2 of 3 | The third reasoned until the 6,000-token budget ran out and returned nothing. The two that answered took 23 to 37 s |
   | gpt-oss:120b, `think: "low"` | 3 of 3 | About 1 s |
   | gpt-oss:120b, `think: "high"` | 0 of 3 | All three spent all 6,000 tokens reasoning (79 to 101 s) and returned nothing |

   *For the suite: use `format` with `think: "low"`, keep length limits out of the schema and check them in code, and give `think: "high"` a much larger budget or no schema. Glow's notes add that a schema costs about three times the output tokens, and that for photo questions it skews vision models, so `describe-photo.js` writes the format into the prompt instead.* **Probed, Glow notes**
6. **Empty replies.** How often each engine returns nothing at 6,000 tokens of budget.
   *None of 16 at default settings without a schema: the coder 0 of 5, gpt-oss:20b 0 of 5 (860 to 1,560 tokens used), gpt-oss:120b 0 of 3 (about 1,500 used), Muse Glimmer 0 of 3. The empty replies came only with a schema and `think: "high"` (item 5): 4 of 6 gpt-oss runs. The risk is reasoning effort more than the budget itself, so the retry at 12,000 tokens in section 4 should also drop `think` to `low`.*
7. **Images.** Does Mistral Medium 3.5 accept `images` through the hub? If so, compare single-call alt text with the two-step lane on the same 20 photos.
   *Yes. On one photo of a crystal chandelier, Mistral Medium 3.5 described it correctly, and in a single call wrote "Elegant crystal chandelier with multiple candle-style lights and hanging crystals." The Qwen 3.6 coder also accepts images and described the photo correctly in 0.6 s, though it added a sales line about dining rooms that the photo does not show. Muse Glimmer was correct and the most detailed. gpt-oss refuses images with HTTP 400 ("Multimodal data provided, but model does not support multimodal requests"). The 20-photo comparison was not run. It needs about 80 GB of Beam for Mistral, which pushes out gpt-oss:120b, and a person to judge the results against the photos, so it is the first job for the bake-off in section 10. The coder belongs in it as a fast third option.*
8. **Concurrency.** What happens when two jobs hit the same machine: queued, parallel, or refused?
   *Queued at the hub, never refused. On Beam, three jobs sent at once to the coder ran two at a time and the third started when a slot freed. On Shine, two jobs ran one after the other, the second waiting about 3 s. Glow's notes add that different models on one machine have separate slots, and that waiting jobs go in priority order: chat first, then ordinary work, then Glow's own upkeep, then anything whose project name says trial, study or bench.* **Probed, Glow notes**
9. **Bright mode.** What a request gets while Beam is in Bright mode, so pre-flight can recognise it.
   *HTTP 503 with `{"error":"LLM hub: Beam is in Bright mode (Qwen-Next under MTPLX) until it has been idle for a while; send this job to Shine (mac36) or try again later."}`. While Beam is switching, the message says it is switching. Pre-flight should read `GET /api/bright` and go ahead only when `mode` is `off`. Bright mode was not switched on for this probe, because doing so stops every other model on Beam.* **Glow notes** (the hub's code)
10. **Glow brain.** Where it is, what it loads (a folder of notes, the JSONL index, its own embeddings), and whether it re-reads on change.
   *A folder of Markdown notes on the owner's PC, not on Beam. It loads nothing by itself. Glow Chat's Glow Mode reads it, along with every other brain and Obsidian vault on that drive, through its own `nomic-embed-text` embeddings. It re-reads a source when a search touches it and that source's index is over 10 minutes old. The website vault is registered as a source but had not been indexed yet. Glow Mode indexes only Markdown, so it will read the vault's notes and `_glow/brief.md`, not `_glow/index.jsonl`. Section 4 has the details.* **Glow notes, Probed**

## 12. Risks and guardrails

| Risk | Guardrail |
|---|---|
| Invented facts, names or URLs (seen) | Rule 4 in GLOW.md, cited sources, and the number and proper noun check in section 9 |
| Copy that reads as AI-written | Brand Voice checks in code; owner approval; acceptance tracking per model |
| A change reaching the live site unreviewed | Glow has no credentials or write path; apply is a pull request; CI runs the freeze check and tests |
| Search rankings during the move | Launch freeze: title, description, canonical and H1 proposals are held |
| Customer data reaching a model | Glow never sees quote requests. Delivery checks report counts only |
| Instructions hidden in fetched text (venue sites, logs, link targets) | Model output is only ever a proposal; nothing a model writes is run as a command |
| PC or Beam off, Beam in Bright mode | Pre-flight checks, resumable jobs, and alarms that do not depend on Glow |
| Proposals going stale while waiting | Commit recorded in each proposal; stale detection |
| Internal notes leaking through this public repository | Proposals and knowledge stay in the vault; `vault/seed/` holds only what public docs already say |
| Licence terms | Check the Mistral Medium 3.5 licence's revenue clause; gpt-oss is Apache 2.0 |

## 13. Questions for the owner

Decisions:

1. **D-001** (curate through the vault, not an admin screen) is marked "Proposed". The suite is built on it. Accept it?
   *Found on the PC:* Glow's notes record nothing about the website's D-001. The copy in the vault's `DECISIONS.md` still says "Proposed". Glow numbers its own decisions `dec-0001` onwards, and its `dec-0001` and `dec-0003` concern other matters, not these. **Glow notes**
   *Owner, 23 November 2026:* accepted, "we would do it through the glow network". Curation goes through Glow and the vault, and no admin screen is planned. The vault's `DECISIONS.md` should now mark D-001 Accepted, with this as its source.
2. **D-003** says "one draft per request; no scheduled or bulk generation". Batch jobs that fill known gaps (alt text, thin pages, held meta descriptions) produce many proposals at once, though nothing publishes without approval. Amend it to allow batch proposals for existing gaps while keeping new blog posts one per request and nothing scheduled to publish?
   *Found on the PC:* the vault's copy says "Accepted", unchanged. Glow's notes do record that the owner asked for the alt text job to run on every photo that lacked alt text, and that it ran as one batch on 22 and 23 November. It produced proposals only: nothing was applied, committed or pushed. Practice has therefore already gone past the decision's wording, and the amendment proposed above would make the two agree. **Glow notes**
   *Owner, 23 November 2026:* keep D-003, and ask first. A batch of proposals runs only after the owner says yes to that run, as the alt text run did. New blog posts stay one per request, and nothing is scheduled to publish. For the suite: see "Ask before a batch" in section 10. The vault's `DECISIONS.md` should add this to D-003.
3. A `Status/` folder in the vault for health notes, or should those go somewhere else?
   *Owner, 23 November 2026:* yes, `Status/`. The vault's `CONVENTIONS.md` folder map needs a row for it: written by the suite's watch job, rewritten on each run, never edited by hand.
4. Run the alt text job on the full 220 photos now, before launch?
   *Overtaken:* it ran on 22 and 23 November. Muse Glimmer described all 220 photos in 61 minutes, about 17 s a photo. gpt-oss:120b, not Mistral Medium 3.5, drafted all 220 in 17 minutes, because Mistral would have pushed the 120b out of memory while another job was using it. There were no failures, and the run wrote 79 proposal notes. Claude's review found the drafts it checked accurate, with two problems: the prompt wrongly treated logos and text graphics as decorative (fixed in `dd68758` on #3), and a few drafts named lighting that came from the page text, not the photo. gpt-oss:120b rated 219 of 220 drafts "high" confidence, so that field tells nothing. **Glow notes.** When those notes were written, the proposals were waiting for Claude's photo-by-photo check and the owner's ticks. Since then #3 has gained `--redo-page` and an `apply --decisions` step for decisions made on a review page, and alt text jobs were running again on the hub during these probes. Where the review stands now is for that work's own session to report. **Probed**

Facts only the owner has (answered from the PC):

5. Where the Glow brain lives on Beam, and what it reads.
   *Answer:* it does not live on Beam. It is a folder of Markdown notes on the owner's PC, beside the hub, and it reads nothing by itself. Glow Chat's Glow Mode is what reads: it searches every brain and Obsidian vault on that drive, the website vault included, through `nomic-embed-text` embeddings made on Beam. It re-indexes a source when a search touches it and its index is over 10 minutes old. The website vault is registered but had not been indexed yet. Details are in section 4 under "The Glow brain". **Glow notes, Probed**
6. The hub's routes and machines; which one Beam is; what Bright mode is.
   *Answer:* there are four machines: `mac` (Beam), `mac36` (Shine), `studio` (Arc) and `rtx` (Beacon). Model calls use `/ollama/<machine>/api/<call>` in Ollama's format only, and the status routes are `/api/health`, `/api/state`, `/api/referee` and `/api/bright`. Beam is `mac`. Bright mode is Glow Chat's switch that runs one large reasoning model alone on Beam; meanwhile every other Beam job gets a 503 naming Shine. Details are in section 4. **Probed, Glow notes**
7. Which gpt-oss size runs (20b or 120b), and whether an embedding model is installed.
   *Answer:* both are installed on Beam: `gpt-oss:20b` and `gpt-oss:120b`. The 120b wrote the first run's alt text, and Shine and Beacon have the 20b only. The embedding model is `nomic-embed-text` (768 dimensions), on Beam and on two other machines; `qwen3-embedding` is not installed. **Probed**
8. Which outside uptime monitor to use, and who it alerts.
   *Owner, 23 November 2026:* start on UptimeRobot's free plan, and move to Solo (about $8 a month) if it proves useful. Section 8 has what the free plan covers. Alerts go to `info@weddinglightingco.com`.

## 14. Build order

1. ~~Merge #3 and #4 with the fixes in section 3.~~ Done on 23 November through decant-rva/website-wlc#6.
2. `client.js`, `engines.json` and `probe.js`; run the probe on the PC; fill in section 11's answers.
3. Move the alt text job onto the shared client; run it on the 220 photos; Claude checks; the owner ticks; apply.
4. `checks.js` and `proposals.js` with the generalised apply, stale detection and the queue note.
5. `retrieve.js`, then the thin page and internal link jobs.
6. `watch.js` and the scheduled GitHub Actions from architecture section 11, with an uptime monitor on `/health/delivery`.
7. Photo sorting and venue matching.
8. Post drafts, the consistency sweep, redirect summaries, and questions.
9. A bake-off per role once there are 20 or more decided proposals per job.

## 15. Sources

Repository (all **Reported** or **Verified** as marked above): `vault/seed/` and `tools/` on `claude/quirky-edison-eas76b`, `README.md` and `server/` on `claude/kind-allen-bhqyfu`, `docs/phase-1/` on either, the commit messages on both branches, and pull requests decant-rva/website-wlc#1 to decant-rva/website-wlc#4.

On the owner's PC (**Probed** and **Glow notes**, 23 November 2026; not public): requests to the hub at `127.0.0.1:8790` from a probe script; the hub's code and its README; and Glow's knowledge notes on the machines, the models, the hub, Bright mode, Glow Chat and the first website alt text run. Machine addresses, folder paths and anything personal were left out of this report on purpose.

Public (looked up 23 November 2026):

- Qwen3.6 27B model card: https://huggingface.co/Qwen/Qwen3.6-27B
- Qwen3.6-35B-A3B announcement: https://www.alibabacloud.com/blog/qwen3-6-35b-a3b-agentic-coding-power-now-open-to-all_603005
- Mistral Medium 3.5 documentation: https://docs.mistral.ai/models/mistral-medium-3-5-26-04
- Mistral Medium 3.5 announcement: https://mistral.ai/news/vibe-remote-agents-mistral-medium-3-5
- Mistral Medium 3.5 in NVIDIA NeMo (licence threshold): https://docs.nvidia.com/nemo/automodel/model-coverage/vision-language-models/mistral-medium-3-5
- Muse Glimmer on Ollama: https://ollama.com/blog/muse-glimmer
- Muse Glimmer on Hugging Face: https://huggingface.co/blog/muse-glimmer
- gpt-oss introduction: https://openai.com/index/introducing-gpt-oss/
- gpt-oss-120b model card: https://huggingface.co/openai/gpt-oss-120b
- Ollama structured outputs: https://docs.ollama.com/capabilities/structured-outputs
- Ollama thinking: https://docs.ollama.com/capabilities/thinking.md
- Ollama OpenAI compatibility: https://docs.ollama.com/API/openai-compatibility
- gpt-oss structured output issues on Ollama (third party): https://www.glukhov.org/post/2025/10/ollama-gpt-oss-structured-output-issues/
- Local embedding models compared (third party): https://www.morphllm.com/ollama-embedding-models
- Better Stack check frequency: https://betterstack.com/docs/uptime/check-frequency/
- UptimeRobot pricing: https://uptimerobot.com/pricing/
- UptimeRobot free plan and commercial use (third party): https://dev.to/velprove/uptimerobot-commercial-use-free-alternatives-for-business-sites-in-2026-5d75
- UptimeRobot free plan and commercial use, current terms quoted (third party): https://realuptime.io/blog/uptimerobot-free-plan-limits
- UptimeRobot custom HTTP headers on paid plans: https://uptimerobot.com/blog/new-feature-custom-http-headers-for-the-pro-plan
- Better Stack request headers: https://betterstack.com/docs/uptime/request-parameters-headers-and-http-authentication/
- Better Stack pricing: https://betterstack.com/pricing
- Hyperping pricing: https://hyperping.com/pricing
- updown.io: https://updown.io/
- Checkly pricing: https://checklyhq.com/pricing.md
- Google Cloud Observability pricing: https://cloud.google.com/monitoring/pricing
