---
type: knowledge
---
# Quote form and leads

The quote form at `/get-a-quote` is the only form on the site, and the way every lead arrives. Losing a lead is the worst thing the site can do, so the order of steps is fixed.

## The fields

Full name, event date, how did you find us, email, where is your event (venue), tell us about your vision, and photo uploads. They match the previous site's Wix form exactly, so GigFriend and the office see the same thing as before.

## What happens on submit

`POST /api/quote` in `server/quote.js`:

1. Check the request: required fields, a hidden trap field for bots, a per-address rate limit, and (optional) a Cloudflare Turnstile check.
2. **Save it to Postgres.** From this point the lead cannot be lost.
3. Send the visitor to `/quote-sent`. They don't wait on the next steps.
4. Post the lead to GigFriend's `/lead-intake` with the `X-Lead-Token` header.
5. Email the office: subject "New RFQ: [name] filled out Get a Quote Form", from `quotes@weddinglightingco.com` to `info@weddinglightingco.com`, with the same field labels as the Wix email (the Gmail parser in GigFriend reads them).

Steps 4 and 5 are recorded per request as pending, sent or failed. Failures are retried with growing waits, and one email reports anything still undelivered after an hour. GigFriend dedupes on `date|email`, so a lead that arrives both ways is counted once.

If the database cannot be reached, the form shows `/quote-problem`, which asks the visitor to call or email, and the server retries the connection every 30 seconds.

## Uploads

Photos only. Each one is decoded and rewritten as a JPEG of at most 2000 px, which drops metadata (including phone GPS) and the visitor's file name. SVG and PDF are refused. The cleaned photos are stored with the request and shown in the body of the notification email. ([[DECISIONS#D-013 — Uploads are photos only|D-013]])

## The notification email

Laid out like the request form (owner's choice): days until the event on the "When to book" scale, the event year, service tiles coloured by group with the chosen ones lit, each answer in its own box, and the photos. The plain-text part matches the previous site's email.

## For curation

The words on `/get-a-quote`, `/quote-sent` and `/quote-problem` can be improved like any other page. The form's field labels, the email subject and the email's field labels **must not change** without checking with whoever maintains the GigFriend parser: GigFriend reads them.
