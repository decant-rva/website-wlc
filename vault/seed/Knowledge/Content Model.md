---
type: knowledge
---
# Content model

Where every kind of content on the site is stored, and what each piece controls. Read this before proposing a change, so the proposal names the right file and field.

## One Markdown file per URL

`content/pages/`, `content/posts/` and `content/products/` hold one file per public URL. The file name is the URL with `/` written as `__`: `/blog/tags/drapes` is `content/pages/blog__tags__drapes.md`, `/post/cheap-dj-uplighting` is `content/posts/post__cheap-dj-uplighting.md`, `/product-page/adj-jolt` is `content/products/product-page__adj-jolt.md`. Each Site note's `source` field names its file.

### Front matter

Each line is `key: <JSON value>`. The fields:

| Field | What it does | Frozen? |
|---|---|---|
| `path` | The public URL. Never changes without a redirect | Yes, always |
| `template` | Content type: `home`, `page`, `legal`, `post`, `product`, `catalog`, `store-category`, `blog-index`, `blog-category`, `blog-tag`, `profile` | — |
| `title` | The `<title>` in the browser tab and in Google | Yes |
| `description` | The meta description Google may show | Yes |
| `canonical` | The canonical URL | Yes |
| `robots` | Robots meta, such as `noindex` on tag pages | — |
| `h1` | The previous site's H1 text, as a list. The first one is the page's main heading | Yes |
| `og` | Open Graph tags for link previews | — |
| `schema` | Structured data carried over (BlogPosting, Product). A post's `datePublished` is here | — |
| `items` | Product paths a category page lists | — |
| `related` | Related post paths shown on a service page | — |
| `categories`, `tags` | A post's blog category and tag pages | — |
| `facts` | Short numbered facts shown as colour tiles on a service page. Only Uplighting has them so far | — |

"Frozen" means the [[Knowledge/Launch Freeze|launch freeze]] holds it to the previous site's value until the owner lifts it.

### The body

Plain Markdown after the front matter.

- **Photos:** `![alt text](wix:PHOTO_ID)`. The build turns each into a responsive `<picture>`. `wix:` is only an ID scheme; nothing loads from Wix. A photo wrapped in a link is `[![alt](wix:ID)](/target)`. The alt text is in the Markdown, per use, so the same photo can have different alt text on different pages.
- **Links:** `[text](/path)`. Internal links use the bare path.
- **Template blocks:** HTML comments such as `<!-- form -->`, `<!-- faq -->` and `<!-- recent-posts -->` mark where the layout inserts something. Leave them where they are.
- The home page body (`content/pages/index.md`) still holds the previous site's HTML sections. The home layout reads only parts of it; most of what the home page shows is set in code.

## How a page is laid out

`src/lib/templates.js` picks a layout for each page (the `layout` field on each Site note): a named layout for the home, services, catalog, chandeliers, about, contact, FAQ, packages, reviews, quote and venues pages; `service` for the pages in the Services menu and on the service cards; `product`, `post`, `post listing`, `store category`; `product grid` for a catalog page that is mostly a list of products; and `prose` (the navy header and the Markdown as written) for everything else.

Layouts read the Markdown in set patterns. The `/services` page, for example, is a run of photo, heading, paragraph, link for each service card. A proposal that changes a page's structure, not just its words, should say so: it may need a layout change too.

## Content outside the Markdown

| What | Where | Note |
|---|---|---|
| Name, address, phone, email, service areas, menus, footer, social links | `src/data/site.json` | [[Site/Business Facts]]. Must match the Google Business Profile |
| Home hero, intro columns, banners; "Featured" logos; the services page facts; review lines on the quote page; "When to book" scale; catalog time chart and figures | Constants in `src/lib/templates.js` | [[Site/Copy in Code]]. A change is a code change |
| Venues: name, city, region, district, photos, meta description of each venue page | `content/venues.json` | [[Site/Venues]] |
| Chandelier sorting by tier and style | `content/chandeliers.json` | Sorted by the owner. See [[Site/Catalog]] |
| Package looks and prices | `content/pages/wedding-decor-package-cost.md`, photo and price pairs | [[DECISIONS#D-011 — Package prices|D-011]] |
| Redirects | `content/redirects.json` | [[Site/Redirects]] |
| Photo sizes and stored alt text | `content/photos.json`, written by `tools/media.js` | [[Knowledge/Photos and Media]] |

## Adding a blog post

A new post is a new file in `content/posts/`, named `post__<slug>.md`, with `path: "/post/<slug>"`, `template: "post"`, a title, description, canonical, `robots: ""`, the H1, `og` tags, a `schema` with `@type: BlogPosting`, `headline`, `description` and `datePublished`, and its categories and tags. New posts are not under the launch freeze (they were not on the previous site), but the URL needs the owner's approval. Draft one with [[Templates/Post Draft]].
