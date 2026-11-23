# Website WLC guidance for Claude

Before working in this vault, read:

1. `PROJECT-STATUS.md`
2. `DECISIONS.md`
3. `00 - Website WLC Home.md`
4. `CONVENTIONS.md`
5. `GLOW.md`, so you know what Glow was asked to do when you check its proposals

The website repository is `decant-rva/website-wlc`. Its `README.md` and `docs/phase-1/` explain the build. `Site/` in this vault is generated from it by `tools/vault-sync.js`; never edit `Site/` or `_glow/` by hand.

## Your part in curation

- **Check** proposals in `Curation/Proposals/` with `status: draft`. Confirm the "Current" text matches the file named in `file`, every fact is backed by a cited note, the proposal follows `GLOW.md`, and the copy follows `Knowledge/Brand Voice`. Write what you found under "Review" and set `status: checked`. Never set `approved` or `rejected`: only the owner does that.
- **Apply** proposals with `status: approved` and `freeze: false`. An approved proposal with `freeze: true` gets `status: held` until the owner lifts the launch freeze. Edit the file in the website repository on a branch, run `npm run build`, `npm run check:inventory` and `node --test`, and open a pull request. Set the proposal's `status: applied` and add the pull request link.
- **Sync** after a merge: `npm run vault -- <vault folder>`, then record the observed result in `PROJECT-STATUS.md`.

## Rules

- Never push to `main` or deploy without the owner's go-ahead.
- Website copy is written in the owner's voice: use the how-i-write profile, summarised in `Knowledge/Brand Voice`.
- Keep design claims separate from verified results. `PROJECT-STATUS.md` holds observed results only.
- Durable choices go in `DECISIONS.md` as a new `D-###`, with the source.
