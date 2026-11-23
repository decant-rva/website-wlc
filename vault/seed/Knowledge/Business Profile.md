---
type: knowledge
---
# Business profile

The Wedding Lighting Company, "Wedding Lighting Co" for short, is an event lighting, drapes, decor and AV company in Richmond, Virginia. It designs, rents, installs and runs lighting and decor for weddings and for corporate events, proms, mitzvahs, galas, fundraisers and parties.

The exact name, address, phone, menus and service areas the site shows are in [[Site/Business Facts|Business Facts]], generated from the code. Use those; don't copy them here.

## What it offers

The service pages are listed in [[Site/Services|Services]]. In groups, as the site colours them:

- **Lighting:** uplighting, string and bistro lighting, pin spots, chandeliers and pendants, gobos (projected patterns and monograms), dance floor lighting, decor lighting (lamps, lanterns, lamp posts).
- **Drapes:** drape walls, backdrops, canopies and room draping.
- **Decor:** silk florals and trees, hanging decor, LED dance floor, decor packages.
- **AV:** video (walls, projection, screens), live audio, staging, special effects (cold sparks, confetti and other atmospherics).

The catalog ([[Site/Catalog|Catalog]]) is for browsing: no prices and no checkout. Prices come through a quote. The package pricing page shows example looks with a price each (see [[DECISIONS#D-011 — Package prices|D-011]]).

## Where it works

Richmond, Charlottesville and Washington, DC, as the footer says. The venue list ([[Site/Venues|Venues]]) covers Richmond, the surrounding counties, Charlottesville and the Blue Ridge, and places further out.

## How customers find it and book

- Recent quote requests mostly name Google as how they found the company, so organic search is the channel that matters most (Phase 1 report, November 2026).
- About 39 quote notifications arrived in the 10 weeks before 22 November 2026, around four a week.
- Every inquiry comes through the quote form at `/get-a-quote`. There is no separate contact form; `/contact-us` shows the email and phone. See [[Knowledge/Quote Form and Leads|Quote Form and Leads]].
- How far ahead to book is on the "When to book" scale in [[Site/Copy in Code#BOOKING|Copy in Code]].

## Proof points the site uses

All of these are in [[Site/Copy in Code|Copy in Code]] with their exact wording. Quote them; don't restate them from memory.

- The review count on the home page ("Based on 87+ Reviews on Google") and the review lines on the quote page (`QUOTE_REVIEWS`). Reviews are verbatim and never edited.
- The "Featured" publications (`FEATURED`).
- The owner's figures for work done (`TIME_STATS`, 22 November 2026).

## People

- Dylan, the owner, is named in several reviews. The owner approves every change to the site.
- The site speaks as the company ("we", "our team"): designers, technicians and sales staff.

## Systems around the site

- **GigFriend** is the company's own operations system (leads, gigs, crew, scheduling), in the `gigfriend-server` repository. The quote form hands each lead to it. Its data is out of scope for this vault.
- **Glow** is the local models on Beam. See [[GLOW]].
