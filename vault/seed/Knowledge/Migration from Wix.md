---
type: knowledge
---
# Migration from Wix

The plan for moving weddinglightingco.com off Wix, from the Phase 1 report and the architecture document (website repository, `docs/phase-1/`, 22 November 2026). Dates are as planned then; [[PROJECT-STATUS]] has what has actually happened.

## Dates

- **21 December 2026:** Wix charges $846 for a 3-year Core plan unless the billing cycle is switched to the shortest one first. The report recommended switching that week.
- **About 9 January 2027:** the current Wix plan cycle ends.
- **Mid-January 2027:** the realistic launch, in engagement season. The alternative was late February, at the cost of one or two more months of Wix.
- **30 days after cutover:** Wix stays intact as the rollback.
- **15 October 2027:** the domain registration (held at Wix) expires. Transfer it away after the rollback window, well before then.

## Safe order for DNS and email

Mail is on Google Workspace, but the DNS zone that points mail to Google is hosted at Wix.

1. Recreate the whole zone at Cloudflare: MX, SPF, both DKIM records, the Search Console TXT record and anything else in the Wix DNS panel.
2. Replace the Wix-controlled DMARC CNAME with an owned TXT record (`p=none`, reports to an owned address).
3. Move the nameservers to Cloudflare with the web records still pointing at Wix, at least two weeks before launch.
4. At launch only the two web records change. Mail records are never touched on launch day.
5. Keep the Wix DKIM record until Wix is fully retired.

## What Wix does today that the new site replaces

| Wix function | Replacement |
|---|---|
| Wix Forms quote form and "New RFQ" email | `POST /api/quote` and the same email ([[Knowledge/Quote Form and Leads]]) |
| GigFriend's three Wix-dependent lead feeds | The direct post to `/lead-intake`, with the email as backup |
| Wix Blog, Stores (as a catalog), FAQ, galleries, reviews | Static pages from Markdown |
| Wix analytics | GA4 after consent, one key event (`quote_submitted`); not built yet |
| Subscribe forms and Wix Email Marketing | A newsletter provider (Buttondown or MailerLite); not chosen or built yet |
| Google Ads through Wix | Rebuilt in the owner's own Google Ads account later; not on the migration timeline |

## Risks to watch

- Email outage from mishandling the Wix-hosted DNS zone (high): move DNS first, weeks ahead.
- GigFriend not receiving leads at cutover (high): two delivery paths, tested on staging with real submissions.
- Ranking loss (medium): same URLs, copy, titles and internal links; the staging diff must match 100% ([[Knowledge/Launch Freeze]]).
- Hidden Wix redirects not found by the crawl (medium): export the Wix URL Redirect Manager list.
