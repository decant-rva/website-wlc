---
type: knowledge
---
# SEO baseline

What the previous site looked like to search engines, from the Phase 1 audit (`docs/phase-1/PHASE-1-REPORT.md` in the website repository, 22 November 2026) and its inventory (`docs/phase-1/inventory.json`, `WLC-url-inventory-and-redirect-map.xlsx`).

## The inventory

291 URLs crawled: the home page, 32 service and information pages, 29 blog posts, 134 product pages, 14 store categories, 6 catalog pages, 10 blog categories, 39 blog tags (served noindex), 2 legal pages, 3 utility pages, 2 member profiles, 7 existing redirects, and 11 broken internal links (6 hard 404s and 5 soft 404s). The new build serves all 272 content URLs with the same paths.

## URL rules

- Canonical host `https://www.weddinglightingco.com`, HTTPS, no trailing slash. A trailing slash 301s to the bare path in one hop.
- Every existing URL keeps its exact spelling: `/post/...`, `/product-page/...`, `/category/...`, `/catalog/...`, `/blog/categories/...`.
- 11 redirects are proposed for the broken links and await the owner's approval ([[Site/Redirects|Redirects]]).

## Gaps carried over on purpose

At launch these stay as they were ([[Knowledge/Launch Freeze|Launch Freeze]]); they are the first improvements after it:

- 110 pages had no meta description (35 products, 14 categories, 8 pages, 2 posts, the rest tags and profiles).
- 16 pages had no H1, including `/faq`, `/contact-us`, `/drape-walls-backdrops-canopies` and all six catalog pages. Three had 9 to 13 H1s (now one each, see [[DECISIONS#D-006 — One main heading per page|D-006]]).
- 158 images had no alt text.
- Thin pages: `/corporate-event-rentals-av` and `/book-online` had 8 words; store categories 19 to 133.

[[Site/Content Gaps|Content Gaps]] tracks the current numbers from the code.

## What matters most (provisional)

Without Search Console data the audit ranked pages by template and internal links only:

- **A, must not break:** the home page, `/get-a-quote`, the main service pages, `/reviews`, `/portfolio`, `/faq`, `/wedding-decor-package-cost`, `/contact-us`.
- **B, keep one to one:** every blog post, product, category, catalog and legal page.
- **C, decide:** tag pages, profiles, `/search`, `/book-online`.

Search Console's 16 months of pages and queries is the missing evidence ([[Knowledge/Open Questions|Open Questions]]).

## Structured data

The previous site had LocalBusiness and WebSite on the home page, BlogPosting on posts, Product on products, ItemList on categories. The new site adds LocalBusiness and BreadcrumbList on every page and FAQPage on `/faq`, generated from the content files. Adding schema is the one SEO change made at launch.

## Speed

Lab measurements of the Wix site on a throttled phone: LCP 1.1 to 2.7 s, about 1 MB of JavaScript and 120 to 200 requests per page. The new build's target is 10 to 20 requests and LCP under 2.5 s; the static build measured 9 to 23 requests and LCP 0.7 to 1.5 s locally (pull request decant-rva/website-wlc#1).
