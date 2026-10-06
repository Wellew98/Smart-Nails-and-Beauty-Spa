# Source material from the Google Business Profile

Eleven images pulled from the spa's own GBP. Ten are photographs and live in
`public/photos/`; the eleventh is a price-list poster and lives **here**, not in
`public/` — see below for why.

A twelfth piece of source material — a photograph of the **banner mounted
outside the shop** — arrived separately and is not a file in this repository.
What was taken from it is described under "The shopfront banner" below. It is
where the logo, the hero's wording and the hero's colours now come from.

A thirteenth — **screenshots of the review panel** on the profile — is different
from the other two: it IS committed, as four lossless webp files in
`public/reviews/`, and the pictures themselves close the homepage. See "The
review screenshots" below for why showing the picture beats re-setting the words,
and read the rule about not adding them up before touching that section.

**The menu has been entered, provisionally** — `supabase/migrations/0006_poster_menu.sql`
puts all 43 services in with the poster's real names and prices, deactivating
the six invented treatments from `0004`. The rows keep the `dddddddd-` prefix so
the sample-menu banner stays up, because the DURATIONS attached to those real
prices are estimates. All 43 were checked against the real availability engine
and return slots.

The photographs are not referenced by any page yet.

Everything in §"Before any of this goes on the site" is still open, and two
pieces of it contradict `docs/HANDOFF.md`. Read it before taking the banner
down.

---

## The shopfront banner

A photograph of the printed banner on the wall outside 11 Amanda Avenue. It is
the first sight of the studio's own **branding** — until it arrived, the site
had a name and no logo, and the design system in `app/globals.css` had been
built from the treatments rather than from anything the business itself uses.

The photograph is not committed: it is a phone shot taken at an angle, half of
it is a wall, and every part of it that matters has been transcribed below or
rebuilt as code. Nothing on the site depends on the file.

### What is on it

| Element | As printed |
|---|---|
| Logo | A cream disc inside a double ring. The word `GRACE` in letterspaced serif caps, a script "Grace" written across the top of them, and `NAILS &BEAUTY SPA` on a rule beneath |
| Message | `SCHEDULE AN APPOINTMENT` — heavy black sans caps, the largest thing on the banner |
| Hours | `MONDAY - SUNDAY \| 9AM - 6PM` — in rose, on its own line under the message |
| Contact | `GET IN TOUCH:` in small dark caps, then `063 352…` in heavy black (the rest is obscured in the photograph) |
| Ground | A blush-pink wash behind a montage of nail, pedicure and facial photographs |

### What was taken from it, and where it went

- **The logo** is redrawn as `components/grace-mark.tsx` and now appears in the
  site header and at the top of the homepage hero. It is a reconstruction in the
  site's own faces, not a tracing — read the note at the top of that file before
  changing it, and **ask the owner for the original artwork**, which would
  replace the drawing outright.
- **"Schedule an appointment"** is now the homepage `h1` (`lib/site.ts`),
  finished in the site's serif with "in under a minute" — the studio's own way
  of asking for the booking, plus the part a printed banner cannot offer.
- **The palette** needed nothing. The blush ground, the rose accent and the
  near-black message on the banner are what `app/globals.css` already had as
  blush, lacquer and aubergine; the hero now uses them in the banner's own
  arrangement.
- **The hours and the phone number** were NOT taken from it, and are not to be
  — see the rule below. The hero reads both out of the database, like the
  footer does.

### ⛔ THE BANNER IS NOT A SOURCE FOR HOURS OR THE PHONE NUMBER

Decided, 11 Aug 2026. It is a source for the logo, the wording and the colours,
and for nothing else.

| Fact | Banner says | What the site uses | From |
|---|---|---|---|
| Closing time | Monday–Sunday, 9am–6pm | Mon–Sat 9am–8pm, Sun 9am–4pm | `working_hours`, seeded from the Google Business Profile |
| Phone | `063 352…` (rest obscured) | 063 352 5374 | The `businesses` row, byte-for-byte off the profile (§8) |

The two disagree about closing time and cannot both be current. The profile
wins: it is the listing customers actually find, it is what `seed-real-hours.sql`
and the NAP rule are already built on, and a banner outside a shop can be years
old with nobody thinking to take it down.

This is not cosmetic. Whatever sits in `working_hours` is what the availability
engine sells, so a 6pm figure entered from the banner against an 8pm working day
would quietly stop selling the studio's two busiest hours — and the reverse
would sell slots with nobody there to work them. If the owner ever confirms that
6pm is the real closing time, that is a change to `working_hours` through
Admin → Setup, made because **she** said so — not because the banner did.

The banner's phone number needs no decision: as far as it is legible it is the
number the site already uses. It is worth one note that this is now a second,
independent sighting of 063 352 5374 against a single sighting of
`+27 83-520-4875` on the price poster, which is useful when asking about §1
below — but nothing was copied across, and nothing should be.

---

## The review screenshots

Five screenshots of the review panel on the Google Business Profile, sent by the
owner in August 2026. Four reviews: one of them (Rachel Molongoana) was sent
twice, so the set is four and not five.

### These ARE committed, and they are what the homepage shows

Unlike the banner and the poster, these four are in `public/reviews/` and are
rendered on the page. That is the point of them.

**This was got wrong once and the reasoning is worth keeping.** The four reviews
were first transcribed and rebuilt as cards in the site's own type, with the
rating redrawn as painted nails, on grounds of reflow, screen readers and retina
sharpness. Every one of those points is true and none of them matters, because
it throws away the only thing a review has: **provenance.** Google's stars,
Google's layout, the "Local Guide" badge and the reviewer's own profile
photograph are things this site cannot fabricate, which is precisely why a
visitor believes them. Re-set in our fonts, the same words are a claim we typed
about ourselves. The rebuild read better and proved nothing.

So the pictures go up as they are. The transcription below is still used, as
the images' **alt text**, which is how a screen reader gets the review and how
the words reach a crawler. That covers the accessibility half of the old
argument without giving up the evidence.

One thing the old note got right and it still stands: publishing these
republishes four reviewers' Google profile photographs on the studio's own
domain. These are the studio's own reviews, already public on its listing, and
the owner asked for them to go up as they are.

### The files

Converted from the uploaded PNGs to **lossless** webp, matching `public/photos/`.

| File | Size | From |
|---|---|---|
| `review-01-lindokuhle-magasela.webp` | 812×232 | `Screenshot 2026-08-14 110705.png` |
| `review-02-rachel-molongoana.webp` | 839×162 | `Screenshot 2026-08-14 110949.png` |
| `review-03-neo-maluleka.webp` | 812×138 | `Screenshot 2026-08-14 110901.png` |
| `review-04-jane-steuart.webp` | 853×159 | `Screenshot 2026-08-14 111056.png` |

105KB of PNG became 47KB of webp, and the conversion was verified
pixel-identical to the sources, byte for byte across all four. **Keep
`lossless: true` if these are ever re-exported.** They are small grey glyphs on
flat white, which is the worst case for lossy webp: it rings around exactly
those edges, so the artefact lands on the one thing the picture exists to show.

A fifth upload, `Screenshot 2026-08-i14 110949.png`, was a second capture of
Rachel Molongoana's review and is not kept. The uploads landed in the repository
root and were removed once converted.

**These do not reflow.** An 812px-wide capture shown on a 390px phone is drawn
at 43%, so Google's already-small review type gets genuinely small. That is
inherent to a screenshot and cannot be fixed by CSS. If it proves to be a
problem, the fix is to make each one tappable through to the Google listing,
where it is readable and verifiable; it is deliberately not done yet.

### Transcribed

Verbatim, including the spelling. These transcriptions are the images' **alt
text** and nothing else is rendered from them; `lib/reviews.ts` is the live copy.

| Reviewer | Google's badge | Stars | Left | In the alt text |
|---|---|---|---|---|
| Lindokuhle Magasela | Local Guide · 11 reviews · 2 photos | 5 | "6 months ago" | In full |
| Rachel Molongoana | Local Guide · 26 reviews · 27 photos | 5 | "a year ago" | In full |
| Neo Maluleka | Local Guide · 65 reviews · 5 photos | 5 | "a year ago" | In full |
| Jane Steuart | 6 reviews | 5 | "a year ago" | The visible sentence only — see below |

**The badge and the date are not re-typed anywhere.** They are visible in the
pictures, which is where they belong: a date the site prints has to be kept
true, and one inside a screenshot is simply what Google showed that day. The
earlier text version had to carry a rule about this, because "6 months ago" goes
stale while the page does not. That problem left with the rebuild.

**Jane Steuart's is truncated at source.** Google collapsed it with its own
"…More", so what is quoted is the complete sentence that was visible and not the
whole review. Her screenshot also shows Google's structured-question label,
`Requested style:`, which is Google's furniture rather than her words and is left
off. If the owner can open the full text, it can be quoted in full.

**Lindokuhle Magasela's names a price that is not on the menu**: "their January
special (R100 for 45min massage)". Past tense and tied to a named month, so it
reads as a promotion that has been and gone, and it is quoted in full because
that is what she wrote. Worth asking the owner whether she wants it trimmed —
`lib/reviews.ts` says which clause to cut and to leave an ellipsis behind if so.

### ⛔ FOUR FIVE-STAR REVIEWS ARE NOT A RATING FOR THE BUSINESS

The profile shows **3.7 across 77 reviews**. These four are the good ones, which
is the owner's to choose and is what every business does with its own reviews —
but the site quotes them and counts nothing:

- no average, no review count, no "rated 5 stars" in any copy;
- no `aggregateRating` and no `review` in the JSON-LD. That rule is older than
  this section and is recorded in `components/local-business-jsonld.tsx`:
  Google's guidelines forbid a site marking up its own ratings about itself, and
  a manual action costs more than the stars are worth;
- the section ends in a link to the listing, so a reader is one tap from all 77
  rather than only these four. **That link is load-bearing. Do not remove it.**

A printed menu, "GRACE NAILS & BEAUTY SPA", with a full service list and
prices. This is the first real data we have against `HANDOFF.md` §2, which calls
the invented placeholder menu **the one thing blocking launch**.

### Why it is not in `public/`

`public/` is served — anything there is a live URL on the site. This poster
carries a phone number that does **not** match the confirmed one (below), so
publishing it would put a contradictory contact number on the site under our own
domain. It is reference material for whoever fills in Admin → Setup, and nothing
else.

### Transcribed

Verified against the image, character by character. Poster typos are preserved
in brackets so the transcription can be checked against the original; use the
corrected spelling when entering them.

| Category | Service | Price |
|---|---|---|
| Special package | Massage + Facial + Pedicure | R500 |
| Special package | Full Mani + Full Pedi + Gelish Eyebrows | R500 |
| Nails | Acrylic Overlay & Gel | R200 |
| Nails | Acrylic Tips & Gel | R300 |
| Nails | Acrylic Ombre Tips | R320 |
| Nails | Acrylic French Tips | R250 |
| Nails | Sculpture | R300 |
| Nails | Back Fill | R200 |
| Nails | Normal Nail Hand Polish | R80 |
| Nails | Normal Feet Nail Polish | R80 |
| Manicure *(see note)* | Express Pedi, Normal Paint | R200 |
| Manicure *(see note)* | Full Pedi & Gel | R300 |
| Manicure *(see note)* | Full Pedi & Polish | R250 |
| Add on | Paraffin Dip | R80 |
| Add on | Hot Stone | R50 |
| Art & repair | Nail Art | R10 |
| Art & repair | Nail Repair (one) *[poster: "REAPAIR"]* | R20 |
| Art & repair | Soak Off Gel *[poster: "SOAK OF GEL"]* | R50 |
| Art & repair | Soak Off Acrylic | R50 |
| Gel | Gel Overlay Feet | R200 |
| Gel | Gel Overlay Hand | R200 |
| Gel | Combo Hand & Feet | R400 |
| Massage | Swedish Massage, 60 minutes | R350 |
| Massage | Swedish Massage, 30 minutes *[poster: "MINITES"]* | R200 |
| Massage | Feet Massage, 30 minutes | R150 |
| Eyelash extensions | Classic New Set *(see note)* | R300 |
| Eyelash extensions | One Week Fill | R170 |
| Eyelash extensions | Two Weeks Fill | R200 |
| Eyelash extensions | Three Weeks Fill *[poster: "TREE WEEKS"]* | R250 |
| Eyelash extensions | Lashes Removal | R80 |
| Waxing | Eyebrows | R80 |
| Waxing | Chin | R80 |
| Waxing | Full Face | R150 |
| Waxing | Lip Wax | R80 |
| Waxing | Nose | R50 |
| Waxing | Ears | R50 |
| Waxing | Under Arms | R120 |
| Waxing | Half Arms | R120 |
| Waxing | Full Arms | R150 |
| Waxing | Half Legs | R120 |
| Waxing | Full Legs | R150 |
| Waxing | Bikini Wax | R150 |
| Waxing | Hollywood | R180 |

Also on the poster: **Contact +27 83-520-4875**, Address 11 Amanda Avenue,
Glenanda, 2091, JHB/SA. Footer: "Made with PosterMyWall.com".

**Two notes on the poster's own wording.** The heading reads `MANICURE` but
every service beneath it is a pedicure — that is how the poster prints it, not a
transcription slip; ask which is meant. And `CLASSIC` / `NEW SET` are on
separate lines with R300 against the second, so "Classic New Set at R300" is the
likely reading but not the certain one.

---

## Before any of this goes on the site

Four things, and none of them can be resolved from the image.

### 1. The phone number disagrees with the confirmed one

| Source | Number |
|---|---|
| `HANDOFF.md` §1, byte-for-byte from the GBP, already live in `0003_business.sql` | 063 352 5374 |
| This poster | +27 83-520-4875 |

Could be a second line, could be an old poster. **Do not take the poster's
number over the confirmed one** — the address in `0003_business.sql` is
described as byte-for-byte from the GBP and is what the site, the JSON-LD and
the confirmation emails already use. Ask the owner which is current.

### 2. Every duration is a guess except the three massages

Only the massages carry a length on the poster. `services.duration_minutes` is
`not null` and §6 builds the whole availability grid out of duration plus
turnaround, so `0006` had to supply one for all 43 to make the menu usable at
all. **Each of those needs confirming.** A wrong duration does not fail loudly:
it produces bookings that overlap in real life while looking correct in the
diary.

The estimates are all in `0006_poster_menu.sql`, rounded to the 15-minute
booking grid, and are the single most likely thing in this project to be wrong
right now.

Turnaround per treatment is needed too, and so is which treatments need a room
or a chair (`service_resources`) — a pedicure needs the chair, a hand polish
does not, and the engine has no way to guess.

### 3. Still no therapist names and no room or chair count

Neither is on the poster. `space-01` shows **two manicure stations** and a
reception desk, with no pedicure chair or massage room in frame — suggestive,
not authoritative, and not a substitute for asking.

### 4. Confirm the poster is current

Menus get reprinted and prices drift. None of these 43 services overlaps with
the six placeholder treatments in `0004_demo_data.sql`, so there is no ambiguity
about which set is real once it is confirmed — but confirm it *is* current
first.

Once all four are answered: enter the services in **Admin → Setup**, then run
`npm run db:demo-clear`. The sample-data banner disappears on its own when the
`dddddddd-` rows go (§4 of the handoff) — it is derived from the data, so there
is no flag to remember to switch off.

---

## The photographs — `public/photos/`

Ten images. `HANDOFF.md` outstanding item #8 asks for real photography for
`/gallery`, which until now had none — `lib/site.ts` uses the lacquer-swatch
colour system specifically *because* there were no photographs.

**Provenance is recorded here rather than in the filenames.** Everything under
`public/` is a public URL, and `…-customerselfie.webp` is not a URL to hand a
customer. The filenames are clean and stable; the uncertainty lives in this
table.

| File | Size | What it is | Confidence |
|---|---|---|---|
| `space-01-reception-and-manicure-stations.webp` | 1152×864 | The salon's reception desk, green hedge wall, two manicure stations | **The salon itself.** Verified by eye |
| `nails-01-ombre-rhinestone.webp` | 1280×960 | Ombre with rhinestones | **Salon's own work** — GRACE brand card in frame |
| `nails-02-brown-french-polkadot.webp` | 765×1020 | Brown french with polka dots | **Salon's own work** — brand card in frame |
| `nails-05-red-french-goldfoil.webp` | 765×1020 | Red french, gold foil accent, almond shape | **Salon's own work** — brand card in frame, verified by eye |
| `nails-08-red-floral.webp` | 765×1020 | Red with floral art | **Salon's own work** — brand card in frame |
| `nails-09-nude-squoval.webp` | 765×1020 | Nude squoval | **Salon's own work** — brand card in frame |
| `nails-03-nude-ombre-coffin.webp` | 765×1020 | Nude ombre, coffin shape | Unconfirmed — nothing ties it to this salon |
| `nails-04-yellow-coffin.webp` | 765×1020 | Yellow coffin. Carries a phone-camera watermark ("Hisense Infinity H50S 5G") and reads as a customer's own selfie posted to the GBP | Unconfirmed. Good social-proof texture |
| `nails-06-hotpink-square.webp` | 765×1020 | Hot pink, square | Unconfirmed |
| `nails-07-red-french-coffin.webp` | 720×884 | Red french, coffin | Unconfirmed, and **the most doubtful of the set** — satin backdrop and even studio lighting; looks like a catalogue photo rather than a phone shot. Verified by eye |

### What that means for captions

The five with the brand card can be captioned as the studio's own work. The
other four should not be, until the owner confirms them — `lib/site.ts` sets the
rule that the site makes only claims that are checkable, and "our work" over a
photo that may be a stock image is exactly the class of copy that rule exists to
keep out. `nails-07` in particular should be dropped rather than captioned if
the owner is unsure.

### Where they are likely to be used

- `/gallery` (`app/gallery/`) — the nail shots, once confirmed.
- Homepage hero, or an "our space" block — `space-01`. It is the only interior
  photograph in existence for this project.

Nothing references these files yet; putting them on a page is a separate piece
of work.
