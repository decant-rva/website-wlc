---
type: guide
---
# Alt text with Glow

How the photos with no alt text get some. Glow looks at each photo and drafts the words; Claude checks them against the photo; the owner approves; Claude applies them to the website. [[Site/Photos|Photos]] lists every photo that needs it.

## The run

From a checkout of the website repository, on the PC that reaches the Glow hub and Beam:

1. **Prepare.** `node tools/glow-alt-text.js prepare <work-folder>` finds every photo with no alt text, notes its page, the nearest heading and paragraph, the alt text of the photos around it and any alt text it has elsewhere, and downloads it (a JPEG of at most 1200 px) to `<work-folder>\photos`. Icons and photos the previous host no longer serves are left out. Keep the work folder outside the vault: the photos are large.
2. **Describe.** `node "C:\Users\Lodyev\.claude\local-llm\describe-photo.js" <work-folder>\photos` runs Glow's photo lane, muse-glimmer:30b on Beam, about 20 seconds a photo. Beam must be on Ollama, not in Bright mode. It writes `descriptions.jsonl` and skips photos already done if run again.
3. **Draft.** `node tools/glow-alt-text.js draft <work-folder> --url <the hub's chat route> --model mistral-medium-3.5` turns each description and its context into alt text, following the rules in [[GLOW#Alt text|Glow's rules]]. Try `--limit 3` first and look at those three. Re-running continues where it stopped.
4. **Propose.** `node tools/glow-alt-text.js proposals <work-folder> "A:\Website-WLC"` writes one proposal per page in `Curation/Proposals/` ("YYYY-MM-DD Alt text - <page>") and a summary, `Curation/Alt text run YYYY-MM-DD`. A note is written only when every photo on its page has a draft, and an existing note is never overwritten.

## Reading a proposal

Each photo is one line with a tick box, the photo ID and the proposed words, then the photo itself, the description it came from, and any problem the checks found.

- A box starts **ticked** when the draft passed every check: under 125 characters, no dash, no sales words, and no venue named unless the context names it.
- A line marked **Check** failed one and starts **unticked**.
- Edit the words after the photo ID to change them. Untick a line to leave that photo alone.
- When the list is right, set `status: approved`.

## Applying

Claude runs `node tools/glow-alt-text.js apply "A:\Website-WLC" --mark-applied` on a branch of the website. Only ticked lines of approved notes are applied, and only to photos that still have no alt text: existing alt text is never replaced. Then the build, the launch freeze check and the tests run, and a pull request goes to the owner. Alt text is not under the [[Knowledge/Launch Freeze|launch freeze]].

## Why two models

The photo lane (muse-glimmer:30b) sees the photo but writes long descriptions; the writing lane turns one into a short line in the site's voice with the page in mind. Both can be wrong, so Claude checks every line against its photo before the owner sees it, and nothing goes live without the owner's tick.
