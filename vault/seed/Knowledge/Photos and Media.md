---
type: knowledge
---
# Photos and media

## How photos are stored

- Every photo has an ID from the previous site, such as `a16fb7_eb019a8fec284cbfb21d0b8c6fa4f89a~mv2.jpg`. Content refers to it as `![alt text](wix:ID)`.
- `content/photos.json` is the manifest written by `tools/media.js`: each photo's size, stored alt text and the generated files (AVIF and WebP at 480, 800, 1200, 1600 and 2000 px, never larger than the original, plus a JPEG fallback).
- In production the files are served from a Tigris bucket at `/media/...`; locally from `.media/variants`.
- `content/photos-unavailable.json` lists photos the content refers to that the previous host no longer serves (HTTP 403). Pages skip them. To bring one back, put the original in `.media/originals/` under its ID and run `npm run media`.

[[Site/Photos|Photos]] lists every photo missing alt text and every unavailable one.

## Photo previews in this vault

The Site notes show each photo so the curator can see what the alt text describes. By default the previews load from the previous host (`static.wixstatic.com`), which still serves them. When Wix is cancelled those links stop working: sync with `--media https://www.weddinglightingco.com/media` once the new site serves its own photos, or `--media none` for text only.

## Alt text

- The alt text is in the Markdown, per use. The same photo can have different alt text on different pages.
- At launch alt text is carried over exactly from the previous site unless the owner says otherwise. Improving it does not touch the launch freeze, so it is good curation work now.
- Good alt text says what the photo shows: the lighting or decor first, then the setting, then the venue if known. About 8 to 16 words. No "image of". See [[GLOW#Alt text|Glow's alt text rule]].
- Decorative photos (the home page banners, service icons) can keep an empty alt on purpose.

## Still open

- **Descriptive file names.** Wix file names are hashes. The architecture plans a sheet of proposed names, derived from alt text and page, for the owner to approve before anything is renamed.
- **Full-size originals.** The copies on Wix are small (many 900 to 1,300 px wide). Sharper originals for hero and gallery photos can be added after launch.
- **Photo sorting by AI.** Architecture section 9a plans for the engine (Glow first) to propose categories, venue and alt text on upload, saved as suggestions until someone accepts them. Proposals in this vault can do the same job by hand for now.
