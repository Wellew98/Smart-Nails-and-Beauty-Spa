# GBP study — Johannesburg South nail salons (2026-10-07)

Source: public Google Search knowledge panels + Maps, read live in BrowserOS neo.
Ratings/counts as seen on the day; they move.

## 1. The real leaderboard (not just our street)

| # | Salon | Rating | Reviews | Area | Website on GBP | Book button | Social footprint |
|---|-------|--------|---------|------|---------------|-------------|------------------|
| 1 | Nail Studio and Beauty | 4.4 | 240 | Bassonia | yes (+4 actions) | no | FB 16.6K, IG 3.3K |
| 2 | Beauty Boutique Columbine Sq | 4.4 | 111 | Mondeor | NO ("Add website" prompt) | no | IG 350+, FB, TikTok |
| 3 | 1st 4U Makeup Artistry & Nails | 5.0 | 37 | Glenvista | yes (+4 actions) | no | FB 9.4K, IG |
| 4 | Precious Nail Studio | 4.8 | 31 | Glenanda | NO | no | IG 910+, FB 620+, TikTok |
| 5 | Trendy Nails Nail Bar | 4.5 | 15 | Glenanda | yes | no | IG 760+, FB 570+ |
| 6 | Grace Nails and Beauty Spa | 3.7 | 7 | Glenanda | yes | no | IG 2K, FB, TikTok, Threads |
| — | **Smart Nails and Beauty Spa** | — | **0** | Glenanda | yes (new) | **pending review** | none linked |
| ref | Sorbet Salon Glenvista (chain) | — | — | Glenvista | yes | "Schedule" (via Zenoti partner) | IG 570+ |

"People also search for" on winner panels repeatedly includes
"[salon] price list / prices / specials / reviews" — price transparency is what
searchers want next. Smart's site has full prices: advantage, keep.

## 2. Field-by-field: Smart vs the winners

- **Reviews:** the entire game. 240 / 111 / 37 / 31 / 15 vs Smart's 0.
  Review text on winners clusters on "nail designs", "attention to detail",
  "artwork", "client care" — Google surfaces these as keyword chips.
- **Book button:** NONE of the locals has one. Sorbet has "Schedule" through its
  Zenoti partner integration. Smart's plain booking URL (set 2026-10-07, pending
  Google review) would make it the first independent salon in the area with one.
- **Website:** mixed — #2 and #4 have NO website linked and still win. Website is
  not the differentiator; reviews + social are. (Smart has one anyway.)
- **Menu link:** Precious and Trendy both show a Menu button. Smart now has one too.
- **Description:** winners all have keyword-rich descriptions with location.
  Smart's 749-char description already matches this pattern. Keep.
- **Hours:** all winners show hours + open status. Smart fixed 2026-10-07.
- **Social profiles linked on GBP:** Trendy (FB, TikTok), Beauty Boutique
  (FB, TikTok, IG), 1st 4U (IG, FB), Grace (IG, TikTok, FB). Smart: none yet.
  Owner must supply URLs.
- **Posts/Updates:** only 1st 4U shows "Updates from …" (posts active). Nobody
  else posts. Easy differentiator, waiting on owner's offer details.
- **Fresha:** Precious, Beauty Boutique, 1st 4U and Sorbet all have Fresha
  listings (discovery + "call to book"). Smart is absent. Separate decision:
  Fresha takes commission but is where Glenanda clients browse.
- **Service area:** 1st 4U shows "Areas served: Johannesburg South" — same as
  Smart's existing setting. Confirmed sane.
- **Attributes:** Precious shows "LGBTQ+ friendly" + plus-code. Minor; revisit
  with owner (only set what she confirms: parking, payments, accessibility).
- **Photos:** counts not captured this pass — re-measure. Every winner panel is
  photo-rich (work shots + interior). Smart has 0. Highest visual priority.
- **Q&A:** no questions observed on any local panel. Seed 3–5 Q&As once reviews
  exist (Do you take walk-ins? Do you do nail art? Where do I park?).

## 3. What actually correlates with winning (in order)

1. Review volume + rating (by far).
2. Active socials with real followers, linked on the profile.
3. Fresha presence for discovery.
4. Complete basics: hours, description, services, photos.
5. Posts cadence (only one winner does it — open lane).
6. Book button (no independent local has it — open lane).

## 4. Corrections to earlier advice (self-audit)

1. **"Booking button needs a partner" — WRONG.** GBP Bookings accepts a plain
   Booking URL (place-action link). Set to /book on 2026-10-07; "Book online"
   expected within 24–72h pending Google review. Inline *Reserve with Google*
   is the thing that needs a partner — conflated the two. Sorry.
2. **"Address autocomplete irrelevant" — VERIFIED.** Booking flow
   (`components/book/booking-flow.tsx`) collects name/phone/email only; no
   street-address field exists, so the checklist item is correctly skipped.
3. **"Service area = Johannesburg South, ideal" — CONFIRMED** by 1st 4U showing
   the identical setting.
4. Industry stats quoted earlier (2.7× credibility, +45% direction requests
   with photos, 4.0★ filter on "best" queries) are Greg/Zenoti/industry figures,
   directionally right; treat as rules of thumb, not guarantees.

## 5. Action list (priority order)

Owner-blocked:
1. Photos: exterior, interior, 5+ work shots (measure winner photo counts first).
2. Reviews: send https://g.page/r/CTOzepJCQc2iEBM/review via the drafted
   WhatsApp message; target 10 in 2 weeks; reply to all.
3. Social URLs → link Facebook/Instagram/TikTok on GBP.
4. Offer details → first post + offer.
5. Confirm parking/payments/accessibility attributes.
6. Decide: Fresha listing (commission vs discovery).

Done / in flight:
- Hours, website, menu link, WhatsApp, +17 services, on-site services, booking
  URL (pending review — re-check "Book online" by 2026-10-10; if absent,
  re-submit, it may have been rejected).
- Map + directions embed on /contact (repo, uncommitted at time of writing).

Next measurement: winner photo counts, Smart "Book online" appearance,
baseline "82 views last month" vs next month.

## 6. What customers actually see — the local 3-pack (2026-10-07, searched from Glenanda)

"nail salon near me" top 3:
1. Trendy Nails 4.5 (15) — Website button
2. Precious Nail Studio 4.8 (31)
3. Grace Nails and Beauty Spa 3.7 (7) — Website button
(Sponsored slot: Ten Fine Designs. Smart NOT in top 3.)

"pedicure Johannesburg South" top 3:
1. Beauty Boutique 4.4 (111)
2. Precious Nail Studio 4.8 (31)
3. Nail Studio and Beauty 4.4 (240) — Website button
(Smart NOT in top 3.)

Implications:
- The review-count leaderboard predicts the pack well (Precious in both).
- BUT Grace (3.7★, 7 reviews) outranks Smart (0 reviews) for "nail salon near
  me" — proximity + category + website completeness beat a thin profile even
  with weak reviews. Smart is currently invisible in both money queries.
- Category signal: 2 of 3 in "nail salon near me" are primary "Nail salon"
  (Trendy, Grace); Smart is primary "Beauty salon" + additional "Nail salon".
  RECOMMENDATION: flip primary to Nail salon (keep Beauty salon additional) —
  the menu is nails-first and the money queries are nails queries. Low risk,
  reversible, needs owner sign-off since it can trigger re-verification.
- "Website" button appears on 3 of 6 pack slots — Smart now has one. Book button
  on 0 of 6 — Smart's pending link is a genuine first-mover opening.
- How to keep watching the pack: (1) repeat these live searches from a
  Glenanda location (free, location-dependent); (2) GBP Performance tab for the
  queries customers actually used; (3) geo-grid tools (Local Falcon,
  BrightLocal, Whitespark — paid) for position-across-the-map tracking.
