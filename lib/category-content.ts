/**
 * Rich category copy for the /treatments/[category] pages (outcomes build,
 * video system 3, second pass: 8 deep category pages instead of 58 thin
 * service pages).
 *
 * Every claim here is either generic knowledge about the treatment type
 * (what a pedicure involves, how long gel lasts) or is filled in from the
 * services row at render time (prices, durations). Nothing names a therapist,
 * claims an award, or quotes a review — the salon has none of those on record.
 * Durations on the menu are estimates, so copy says "about" and "allow".
 */

export interface CategoryFaq {
  q: string;
  a: string;
}

export interface CategoryContent {
  /** Matches the flyer key: services.description lowercased and trimmed. */
  key: string;
  slug: string;
  label: string;
  tagline: string;
  intro: string[];
  expect: string[];
  goodToKnow: string[];
  faqs: CategoryFaq[];
}

export const CATEGORY_CONTENT: CategoryContent[] = [
  {
    key: 'nails',
    slug: 'nails',
    label: 'Nails',
    tagline: 'Manicures, acrylics and gel that survive real life.',
    intro: [
      'Most of our chairs are nail chairs. Manicures shape and tidy the natural nail; acrylics add length and structure for nails that need to look done for weeks; gel gives a glossy colour that does not chip the way ordinary polish does.',
      'If you type all day, work with your hands, or just hate maintenance, say so when you book. The right choice depends on your nail length, your habits, and how often you want to come back.',
    ],
    expect: [
      'Nails are shaped, cuticles tidied, and the surface prepped before anything goes on.',
      'Acrylic sets are sculpted to the length you ask for, then finished smooth.',
      'Gel colour is cured under a lamp, so you leave with dry, hard nails. No smudging on the car keys.',
      'Removal is its own service: soaked off, never peeled or pried, so the natural nail underneath stays intact.',
    ],
    goodToKnow: [
      'Gel removal and reapplication is booked as one visit. Faster and kinder to the nail than two trips.',
      'Acrylic fills are due every two to three weeks as your nails grow out.',
      'Bring a colour idea or pick from the wall; changing your mind mid-appointment is normal.',
    ],
    faqs: [
      {
        q: 'How long do acrylic nails last?',
        a: 'A full set holds for about three weeks before regrowth shows at the cuticle. A fill every two to three weeks keeps them looking fresh indefinitely.',
      },
      {
        q: 'Is gel or acrylic better for me?',
        a: 'Gel suits natural nails you want glossy and chip-free for two weeks. Acrylic suits anyone wanting length, a different shape, or nails that survive hard use. If you are unsure, book a manicure first and ask. There is no charge for advice.',
      },
      {
        q: 'Will removal damage my natural nails?',
        a: 'Not when it is soaked off properly, which is why removal is a service on its own. Peeling product off at home is what causes the damage people blame on the salon.',
      },
      {
        q: 'Do I need an appointment or can I walk in?',
        a: 'Booking online takes under a minute and holds your chair. Walk-ins are welcome when there is space, but Saturday chairs go to bookings first.',
      },
    ],
  },
  {
    key: 'pedicure',
    slug: 'pedicure',
    label: 'Pedicure',
    tagline: 'Feet-first, from express tidy to the full works.',
    intro: [
      'A pedicure here starts with a warm soak and ends with you walking differently. The express keeps toenails shaped and tidy in one short sitting; the full treatments add exfoliation, massage, and gel colour that lasts for weeks in closed shoes and months in sandals.',
      'The Smart Pedicure is the works: full pedicure with a caviar scrub, warm paraffin for dry winter feet, and deep gel colour to finish.',
    ],
    expect: [
      'Feet soak while nails are trimmed, shaped and the cuticles tidied.',
      'Heels and rough skin are exfoliated smooth. Say the word if you want more or less pressure.',
      'Full treatments include a lower-leg and foot massage before polish.',
      'Gel toes are cured under the lamp, so sandals go straight back on with nothing smudged.',
    ],
    goodToKnow: [
      'Gel on toes outlasts gel on hands by a lot. Most clients get four to six weeks.',
      'Paraffin is especially good for cracked winter heels; ask for it to be added.',
      'Open shoes straight after a gel pedicure are fine. After ordinary polish, give it time to harden.',
    ],
    faqs: [
      {
        q: 'How long does a pedicure take?',
        a: 'Allow about half an hour for the express and up to two hours for the full treatments with gel. The booking page shows the time for each option before you commit.',
      },
      {
        q: 'What is the difference between the pedicures?',
        a: 'Express is nails and tidy. Full adds exfoliation and massage. Full Plus Gel adds gel colour. The Smart Pedicure adds a caviar scrub and warm paraffin dip on top of all of it.',
      },
      {
        q: 'Can men book a pedicure?',
        a: 'Yes. Feet do not check IDs. The express pedicure without polish is the usual pick, and nobody will try to sell you colour.',
      },
      {
        q: 'Should I shave my legs before a pedicure?',
        a: 'It makes no difference to us either way. If the pedicure includes exfoliation, unshaved skin actually takes the scrub better.',
      },
    ],
  },
  {
    key: 'massage',
    slug: 'massage',
    label: 'Massage',
    tagline: 'A full hour on the table, with proper attention to each area.',
    intro: [
      'The massages here run a full hour. Short massages rush; an hour lets shoulders, back and legs each get proper attention instead of a greatest-hits tour.',
      'Deep tissue works out knots for people who carry tension in their back and neck. Aromatherapy is the slower, scented wind-down. Hot stone adds warm stones that loosen muscle before hands even start. Couples massage books two tables side by side.',
    ],
    expect: [
      'You will be asked about pressure, problem spots, and anything to avoid. Speak up, the massage adjusts to you.',
      'Warm oil, a heated room, and an hour with no phone: that is the whole formula.',
      'Deep tissue can leave you tender the next day, the way a good workout does. That is normal.',
      'The 90-minute full body exists for people who want everything unhurried: back, legs, arms, neck, all of it.',
    ],
    goodToKnow: [
      'Drink water afterwards; it helps with next-day stiffness.',
      'Arrive a few minutes early so the hour on the table is a full hour.',
      'Massage and a facial pair well back to back. Book both and make an afternoon of it.',
    ],
    faqs: [
      {
        q: 'Which massage should I book?',
        a: 'Tight shoulders and knots: deep tissue. Stress and poor sleep: aromatherapy. Cold-stiff muscles in winter: hot stone. Cannot decide: full body, medium pressure. It is the safe default.',
      },
      {
        q: 'How long is the massage really?',
        a: 'A full hour hands-on for every massage on the menu, ninety minutes for the extended full body. The time on the table is the time you paid for.',
      },
      {
        q: 'What is a couples massage?',
        a: 'Two people, two tables, one room, same hour. Popular for anniversaries and for friends who want the spa afternoon together.',
      },
      {
        q: 'Do I undress fully?',
        a: 'To whatever level you are comfortable with. You are draped with towels throughout and only the area being worked on is uncovered.',
      },
    ],
  },
  {
    key: 'facials',
    slug: 'facials',
    label: 'Facials',
    tagline: 'Skin assessed first, treated second.',
    intro: [
      'Every facial starts with a look at your skin as it is that day, oily, dry, congested, tired, and the treatment follows from there, not from a fixed script. Deep cleansing with extraction suits congested skin and blackheads; hydrating suits dry, tight winter skin; anti-aging and glow facials target fine lines and dullness.',
      'The relaxing facial is exactly what it sounds like: cleansing, massage, and masks with no extraction, for people who want the glow without the pinch.',
    ],
    expect: [
      'Skin is cleansed properly first. Most home routines do not get this far, which is half the result.',
      'Extraction, where included, clears blackheads and congestion. It can leave temporary redness.',
      'A mask matched to your skin type follows, usually with a face, neck and shoulder massage while it works.',
      'You leave with aftercare advice: what was used, and what to avoid for the next day or two.',
    ],
    goodToKnow: [
      'Avoid heavy sun the day after a facial, especially after extraction.',
      'Do not book extractions the morning of an event. Allow a day for any redness to settle.',
      'Men are welcome: the Men\'s Facial accounts for thicker skin and shaving irritation.',
    ],
    faqs: [
      {
        q: 'Which facial is right for my skin?',
        a: 'Blackheads and congestion: deep cleansing with extraction. Dry and tight: hydrating. Fine lines: anti-aging. Dull before an event: glow. Just want to relax: the relaxing facial. Still unsure: describe your skin when booking and we will steer you.',
      },
      {
        q: 'Will extractions hurt?',
        a: 'There is some discomfort. Clearing a blocked pore is never nothing, but it is quick, and the massage and mask afterwards make up for it.',
      },
      {
        q: 'How often should I get a facial?',
        a: 'Monthly keeps skin consistently clear; most clients come every four to six weeks. One before a big event works too. Just allow a few days after extractions.',
      },
      {
        q: 'Can I wear makeup straight after?',
        a: 'You can, but skin absorbs product best right after a facial. Give it the evening off if you can.',
      },
    ],
  },
  {
    key: 'lashes',
    slug: 'lashes',
    label: 'Lashes',
    tagline: 'Lifts and extensions, from natural to full volume.',
    intro: [
      'Lash work divides into two families. Extensions add individual or fanned lashes to your own for length and fullness that lasts weeks. A lash lift curls your natural lashes upward with a tint, so they look longer with nothing attached.',
      'Classic is one extension per natural lash: the natural look. Hybrid mixes classic with volume fans. Volume is fans only, for the full dramatic set. Refills every two to three weeks keep any of them going.',
    ],
    expect: [
      'You lie back with your eyes closed for the full appointment. Most clients nap.',
      'Extensions are isolated lash by lash, which is why a full set takes its time.',
      'A lift takes under an hour and needs no maintenance until it grows out in six to eight weeks.',
      'Removal is done here, never pulled at home. Extensions come off with remover, not force.',
    ],
    goodToKnow: [
      'Keep lashes dry for the first 24 hours so the adhesive cures fully.',
      'Oil-based removers and mascaras loosen extension adhesive, so stick to water-based products.',
      'Refills cost less than full sets and take less time; book them before gaps show.',
    ],
    faqs: [
      {
        q: 'Classic, hybrid or volume: which one?',
        a: 'First-timers usually start classic: it looks like very good mascara. Hybrid adds noticeable fullness. Volume is the dramatic, ultra-full look. Bring a photo of what you like and we will match it.',
      },
      {
        q: 'How long do lash extensions last?',
        a: 'Two to three weeks before regrowth creates gaps, which is when a refill is due. With regular refills a set can be maintained for months.',
      },
      {
        q: 'Will extensions ruin my natural lashes?',
        a: 'Correctly applied extensions, the right length and weight for your lashes and removed professionally, do not damage them. Picking them off yourself does.',
      },
      {
        q: 'What is the difference between a lift and extensions?',
        a: 'A lift curls and tints your own lashes: low maintenance, lasts six to eight weeks, no refills. Extensions add lashes: more dramatic, need refills every few weeks.',
      },
    ],
  },
  {
    key: 'waxing',
    slug: 'waxing',
    label: 'Waxing',
    tagline: 'Small areas take minutes; bigger areas get proper time.',
    intro: [
      'Waxing here covers face and body, women and men: brows, lip, chin, full face, underarms, arms, legs, bikini and Brazilian, back and full body. Small areas take minutes; a full leg or full body is booked with proper time so nothing is rushed.',
      'Brows are shaped, not just cleared. Bring a photo or describe the shape and it will be followed, not improvised.',
    ],
    expect: [
      'Skin is cleansed first so the wax grips hair, not lotion.',
      'Strip wax for larger areas, hot wax for sensitive spots like brows, lip and bikini.',
      'A soothing product goes on after. Expect some redness for an hour or two, especially on the face.',
      'Ingrown-hair advice comes free with every intimate wax.',
    ],
    goodToKnow: [
      'Hair needs to be about a grain of rice long, roughly two to three weeks of growth.',
      'Exfoliate the day before a body wax, not the day of.',
      'Avoid sun, saunas and workouts for 24 hours after; freshly waxed skin is sensitive skin.',
    ],
    faqs: [
      {
        q: 'How long should my hair be for waxing?',
        a: 'About half a centimetre, a grain of rice. Too short and the wax cannot grip; too long and it hurts more than it needs to. Two to three weeks of growth is the rule.',
      },
      {
        q: 'Does a Brazilian hurt?',
        a: 'The first one is uncomfortable, and it gets much easier from the second visit as hair grows back finer. Hot wax, quick work, and breathing through it. Most clients wonder what they worried about.',
      },
      {
        q: 'How long does waxing last?',
        a: 'Three to four weeks of smooth, longer with regular visits as regrowth slows and thins. Shaving in between resets the clock, so try not to.',
      },
      {
        q: 'Can I be waxed on my period?',
        a: 'Yes. Skin is more sensitive then, so expect a bit more sting, but it changes nothing about the result.',
      },
    ],
  },
  {
    key: 'makeup',
    slug: 'makeup',
    label: 'Makeup',
    tagline: 'Event makeup that photographs well and lasts the night.',
    intro: [
      'Professional makeup for weddings, matric dances, photoshoots and nights out, applied with proper prep and setting so it survives heat, dancing and Joburg humidity.',
      'Bring reference photos and, if it matters, the outfit: undertones that suit the clothes beat undertones that suit the mirror.',
    ],
    expect: [
      'Skin is prepped first: cleanse, moisturise, prime, because makeup sits as well as the skin underneath allows.',
      'The look is built with you watching, and adjusted before setting, not after.',
      'Setting spray and the right base mean it holds for the event, not just the selfie.',
      'Lashes can be added, individual or cluster, to finish the eyes.',
    ],
    goodToKnow: [
      'Book a trial before a wedding, not the week of it.',
      'Arrive with clean, moisturised skin; exfoliate the night before, not the morning of.',
      'Allow extra time if the whole bridal party is coming through. Mornings fill fast.',
    ],
    faqs: [
      {
        q: 'Should I get a makeup trial?',
        a: 'For weddings, yes, it settles the look in daylight with no time pressure. For parties and photoshoots, reference photos usually do the job.',
      },
      {
        q: 'How long does event makeup last?',
        a: 'Properly prepped and set, all day into the night. Blotting papers for the T-zone and lipstick for touch-ups are the only maintenance.',
      },
      {
        q: 'Do I bring my own products?',
        a: 'No need — everything is provided. If you have a holy-grail foundation shade or sensitive skin with products that work, bring them along.',
      },
    ],
  },
  {
    key: 'body treatments',
    slug: 'body-treatments',
    label: 'Body Treatments',
    tagline: 'A head-to-toe scrub that leaves skin smooth.',
    intro: [
      'The body scrub is exfoliation head to toe: dead skin buffed away, circulation woken up, skin left smooth in a way lotion alone never achieves. It is the treatment people book before holidays, weddings, and summer.',
      'It pairs naturally with a massage straight after: smooth skin takes oil beautifully, and the two together make a full spa afternoon.',
    ],
    expect: [
      'Skin is exfoliated with a scrub, section by section, with pressure to match your preference.',
      'Everything is rinsed or toweled off, then moisturised. You leave soft, not sticky.',
      'Allow about an hour; longer when combined with a massage in the same visit.',
      'Drink water after, the same as with massage. Exfoliation moves things around.',
    ],
    goodToKnow: [
      'Book the scrub a day or two before an event, not the morning of. Freshly exfoliated skin and sun do not mix.',
      'Do not shave right before a scrub; exfoliation on freshly shaved skin stings.',
      'It is excellent before spray tans or self-tan, for an even base with no patchiness.',
    ],
    faqs: [
      {
        q: 'What does a body scrub actually do?',
        a: 'It removes the layer of dead skin that makes skin look dull and blocks moisturiser. The result is smoother skin, better circulation, and products that absorb properly afterwards.',
      },
      {
        q: 'Is a body scrub painful?',
        a: 'It is vigorous by nature, but pressure is adjustable. Speak up and it adjusts. Most people find it energising rather than painful.',
      },
      {
        q: 'Can I combine it with a massage?',
        a: 'Yes, and it is the best combination on the menu: scrub first, massage after. Book both and allow the afternoon.',
      },
    ],
  },
];
