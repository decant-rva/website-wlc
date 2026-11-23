---
type: knowledge
---
# Design system: Beam Lines

The site's look, approved by the owner and built in pull request decant-rva/website-wlc#2 ([[DECISIONS#D-010 — The Beam Lines design|D-010]]). Navy, amber and the logo blue, with slanted bands and torn-tape labels. All rules are in `src/styles/site.css`; `tools/prune-css.js` removes the ones no page uses after each build.

## Colour

Custom properties at the top of the stylesheet:

| Token | Value | Use |
|---|---|---|
| `--navy` | `#141C40` | Text, headers, bands |
| `--amber` | `#FFB627` | Accent, focus ring, warm highlights |
| `--blue` | `#5E93FB` | The logo blue |
| `--white` | `#DBDBDD` | The one grey-white used everywhere instead of pure white (owner's choice) |
| `--mist` | `#EEF2FB` | Pale background |
| `--paper` | `#F6F3EC` | Warm pale background |
| `--slate` | `#4A5578` | Secondary text |
| `--pale` | `#C9D3EE` | Pale blue |
| `--line` | `#D5DCEE` | Rules and borders |
| `--err` | `#B3261E` | Form errors |

### Service groups

Each service belongs to a group with its own colour, used on service tiles, the time chart and the notification email:

| Group | Class | Colour | Services |
|---|---|---|---|
| Lighting | `li` | `#4F84EE` blue | Uplighting, string lighting, pin spots, chandeliers, decor lighting, gobos, dance floor lighting |
| Decor | `de` | `#2BAE66` green | Decor, silk florals and trees, LED dance floor |
| AV | `av` | `#F0564A` red | Video, live audio, special effects |
| Drapes | `dr` | `#D6249F` magenta | Drapes |

The mapping is `SERVICE_GROUP` in `server/lib/quote-form-data.js`, shown under DISCIPLINE in [[Site/Copy in Code#DISCIPLINE|Copy in Code]]; a service not listed there is lighting.

## Type

Self-hosted from `public/fonts`, all under the SIL Open Font License:

- **League Spartan** 700 and 800: headings.
- **DM Sans** 400 and 500: body text (17 px, line height 1.65).
- **Kalam** 700: the handwritten accents and torn-tape labels.

## Patterns

- One main heading per page ([[DECISIONS#D-006 — One main heading per page|D-006]]). A page with no H1 on the previous site shows its heading as an H2 with the `.h1` class, styled the same.
- Photos are `<picture>` elements with AVIF, WebP and a JPEG fallback, explicit sizes, lazy loading below the fold.
- No client JavaScript on content pages except small inline scripts: the photo slideshows (paused for reduced motion, and by a pause control) and the review rotation. The phone menu is a `<details>` element.
- Visible amber focus ring, skip link, tap targets at least 24 px; the target is WCAG 2.2 AA.

## For curation

Proposals change words and photos, not the design. A proposal that needs a new layout or component should say so plainly, so it goes to the owner as a design question.
