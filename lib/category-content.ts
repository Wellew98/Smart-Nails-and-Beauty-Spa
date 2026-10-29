/**
 * Rich category copy for the /treatments/[category] pages.
 *
 * Every claim here is either generic knowledge about the treatment type (what a
 * wax involves, how long gel lasts) or is filled in from the services row at
 * render time (prices, durations). Nothing names a therapist, claims an award,
 * or quotes a review. Durations on the menu are estimates, so copy says "about"
 * and "allow".
 *
 * REBUILT 2026-10-30 for the owner's new price list (migration 0013). The
 * flyer's nine headings replace the old eight, so four entries were retired
 * (facials, makeup, body-treatments, pedicure) and five were added (special
 * package, art & repair, gel, eyelash extensions, manicure, add on). The
 * retired prose is in git history if those ranges come back.
 *
 * The order of this array is the order of the /treatments hub, the footer
 * links and the sitemap, so it follows the flyer.
 *
 * HOUSE STYLE: no em dashes in anything a visitor reads.
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
    key: 'special package',
    slug: 'special-package',
    label: 'Special Package',
    tagline: 'Two bundles, one booking, one price.',
    intro: [
      'The packages are the best value on the menu. Both bundle treatments that normally run one after the other anyway, so you save on the combined price and you only make one trip.',
      'The first pairs a massage, a facial and a pedicure. The second pairs a full manicure, a full pedicure and gelish brows. Book whichever suits the occasion, or book both if you are preparing for something big.',
    ],
    expect: [
      'One appointment covers every treatment in the package back to back. You do not book the parts separately.',
      'Allow the full time shown on the booking page. A package is by definition a long appointment and the diary reserves it in one block.',
      'Each part is done to the same standard as it would be on its own. Nothing is shortened to make the package fit.',
      'If you only want part of it, book that treatment on its own instead. Single treatments are listed under their own headings.',
    ],
    goodToKnow: [
      'Packages need the longest notice of anything on the menu, so book a few days ahead where you can. Saturday is the hardest slot to find.',
      'Eat something beforehand. A package runs long and a massage on an empty stomach is a waste.',
      'Arrive with clean skin and no fresh polish on your toes if you are having a pedicure. It saves time and it is time you paid for.',
    ],
    faqs: [
      {
        q: 'Can I swap one treatment in a package for another?',
        a: 'Ask when you book and we will tell you straight away. Packages are priced as a set, so a swap may change the price or may not be possible at all. Nothing is agreed until we confirm it with you.',
      },
      {
        q: 'How long should I set aside?',
        a: 'The booking page shows the exact time for each package before you commit. Do not book one in a lunch break unless the time shown fits with room to spare.',
      },
      {
        q: 'Can two people share a package?',
        a: 'No. A package is one person, one appointment. For two people, book the treatments separately or book one package each so the diary holds both chairs.',
      },
    ],
  },
  {
    key: 'nails',
    slug: 'nails',
    label: 'Nails',
    tagline: 'Acrylics, structure and polish that survive real life.',
    intro: [
      'This is the core of the studio. Acrylic work here covers an overlay for natural nails that need strength, tips for added length, ombre and French finishes, and full sculpture when you want a shape built from nothing.',
      'Between visits, a back fill keeps a set looking fresh as your nails grow out. If you just want colour on your own nails, plain polish on hands or feet is the simple option.',
    ],
    expect: [
      'Nails are shaped, cuticles tidied, and the surface prepped before anything goes on. That prep is most of how long a set lasts.',
      'Acrylic is applied and then shaped to the length and thickness you ask for, not to a house default.',
      'A finish goes on top: gel colour, French, or ombre, depending on what you booked.',
      'You leave with dry, hard nails. No waiting around for polish to set before you can find your car keys.',
    ],
    goodToKnow: [
      'A back fill is due every two to three weeks as your nails grow out. Booking it before the regrowth shows is cheaper than a full rebuild.',
      'Bring a colour idea or pick from the range in the studio. Changing your mind at the start is normal and costs nothing.',
      'Acrylic comes off by soaking, never by prizing. Peeling it off at home is what damages the natural nail people blame on the salon.',
    ],
    faqs: [
      {
        q: 'How long does an acrylic set last?',
        a: 'Expect about three weeks before regrowth shows clearly at the cuticle. With a back fill every two to three weeks a set can be kept going indefinitely.',
      },
      {
        q: 'What is the difference between an overlay and tips?',
        a: 'An overlay adds strength over your own nail at roughly your own length. Tips extend past the natural nail for added length. If you want noticeably longer nails, you want tips or sculpture, not an overlay.',
      },
      {
        q: 'Can I book a back fill if my set was done somewhere else?',
        a: 'Usually, but say so when you book. Work from another studio sometimes needs reshaping or repair first, and that adds time to the appointment.',
      },
      {
        q: 'Do I need an appointment or can I walk in?',
        a: 'Booking online takes under a minute and holds your chair. Walk-ins are welcome when there is space, but Saturday chairs go to bookings first.',
      },
    ],
  },
  {
    key: 'art & repair',
    slug: 'art-and-repair',
    label: 'Art & Repair',
    tagline: 'Small fixes, designs and removals, on their own or added on.',
    intro: [
      'Not every visit is a full set. This heading covers the small jobs: a design painted on, a single nail rebuilt after a break, gel touched in where a set has lifted, or an acrylic set taken off properly.',
      'These are bookable on their own, and most of them can be added to a manicure or pedicure in the same sitting. Say so when you book and the appointment is given the extra time.',
    ],
    expect: [
      'The nail is prepped and cleaned before any art or repair goes on, so it sits flush and lasts.',
      'A single broken nail is matched to the rest of the set in shape, length and colour. It should not read as the repaired one.',
      'Removal is a soak and a gentle lift. Nothing is filed off your natural nail or pulled.',
      'Designs are quoted and confirmed with you before they go on, since art is priced per design.',
    ],
    goodToKnow: [
      'Come in with the broken nail still attached if it is hanging, and do not glue it back yourself. Home glue makes the repair harder.',
      'Bring a photo if you want a specific design. A picture settles in seconds what a description takes minutes to agree.',
      'Soak-off is worth booking before a break happens. Taking acrylic off properly protects the nail underneath it.',
    ],
    faqs: [
      {
        q: 'Can I just book a nail repair, without a full appointment?',
        a: 'Yes. Repair of one nail is its own line on the menu and can be booked on its own. If several nails have gone, book a back fill instead, which works out cheaper.',
      },
      {
        q: 'What does soak off acrylic mean?',
        a: 'The product is dissolved with a remover so it lifts away from the natural nail instead of being filed or pulled off. It takes time and it is the only safe way to remove acrylic.',
      },
      {
        q: 'Can nail art go on top of gel or acrylic?',
        a: 'Yes, and it holds better on a set than on plain polish. If you are having a set done and want art too, book both so the appointment runs long enough.',
      },
    ],
  },
  {
    key: 'gel',
    slug: 'gel',
    label: 'Gel',
    tagline: 'Glossy colour cured under a lamp, hands and feet.',
    intro: [
      'Gel is colour that sets hard under a UV lamp instead of drying in the air, so it does not smudge and it does not chip the way ordinary polish does.',
      'It is available as an overlay on hands or feet, or as a combo if you want both done in one visit. On toes it lasts considerably longer than on hands, simply because toes take less punishment.',
    ],
    expect: [
      'The nail is shaped and buffed so the gel has something to grip, then a base coat goes on.',
      'Colour is applied and cured under the lamp, layer by layer. The cure is what makes it hard, so it is not a step that can be rushed.',
      'A top coat seals it and gets its own cure. You leave with fully set nails.',
      'Removal, when the time comes, is a soak. Gel is not peeled off.',
    ],
    goodToKnow: [
      'Gel on toes commonly runs four to six weeks. On hands, expect around two before regrowth shows.',
      'Oil-based hand creams and cuticle oils loosen gel over time. Use them, but not every day if you want maximum wear.',
      'If a nail lifts at the edge, book a removal rather than picking at it. Water gets under a lifted edge and that is how nail problems start.',
    ],
    faqs: [
      {
        q: 'Gel or acrylic, which should I choose?',
        a: 'Gel suits natural nails you want glossy and chip-free for a couple of weeks. Acrylic suits anyone wanting length, a different shape, or nails that survive hard use. If you are unsure, book a manicure first and ask. There is no charge for advice.',
      },
      {
        q: 'How long does gel take?',
        a: 'The booking page shows the time for each option. An overlay on one hand or one foot is a short appointment; the combo takes about twice as long because it is twice the work.',
      },
      {
        q: 'Will gel damage my natural nails?',
        a: 'Not when it is applied and removed properly. Damage almost always comes from picking or peeling gel off at home rather than soaking it off.',
      },
    ],
  },
  {
    key: 'eyelashes extensions',
    slug: 'eyelash-extensions',
    label: 'Eyelash Extensions',
    tagline: 'Classic sets and fills, kept on schedule.',
    intro: [
      'Eyelash extensions add individual lashes to your own, one at a time, for length and fullness that lasts weeks rather than hours. The classic look is one extension per natural lash, which reads as very good mascara rather than obviously false lashes.',
      'The menu is built around keeping a set going. Fills are priced and timed by how many weeks it has been, so a fill booked at the right interval costs less than one left too long.',
    ],
    expect: [
      'You lie back with your eyes closed for the whole appointment. Most clients fall asleep.',
      'Your lower lashes are taped down and each natural lash is isolated before an extension goes on. This is why a set takes its time.',
      'A patch test can be arranged if you have reacted to adhesive before. Ask when you book.',
      'Removal is done here with a proper remover. Extensions are never pulled off.',
    ],
    goodToKnow: [
      'Keep lashes dry for the first 24 hours so the adhesive cures fully. No swimming, no steam, no crying at a wedding.',
      'Oil-based cleansers and mascaras break down the adhesive. Stick to water-based products around the eyes.',
      'Book fills by the week count. One week, two weeks and three weeks are separate lines because the work differs, and the three week fill is the most expensive for a reason.',
    ],
    faqs: [
      {
        q: 'How long do lash extensions last?',
        a: 'Your natural lashes shed on a cycle, so a set thins gradually over two to three weeks. That is when a fill is due. With fills kept on schedule a set can be maintained for as long as you want it.',
      },
      {
        q: 'How often should I book a fill?',
        a: 'Every two to three weeks suits most people. The longer you leave it, the more lashes have shed, which means more work and a higher fill price.',
      },
      {
        q: 'What is the difference between a new set and a fill?',
        a: 'A new set starts from bare lashes and applies extensions from scratch. A fill tops up what is left. Booking a fill on bare lashes will not work, so if you have removed your set, book a new set.',
      },
      {
        q: 'Will extensions ruin my natural lashes?',
        a: 'Correctly applied extensions, at a length and weight your lashes can carry, do not damage them. Picking them off yourself does.',
      },
    ],
  },
  {
    key: 'manicure',
    slug: 'manicure',
    label: 'Manicure & Pedicure',
    tagline: 'Hands and feet, from an express tidy to full gel.',
    intro: [
      'The pedicures and manicures sit together on the price list because they are the same kind of appointment: tidy up, then finish. The express option refreshes nails and adds ordinary polish; the full options add more time and, in one case, gel.',
      'Full Pedi and Polish finishes in ordinary polish, which you let harden before putting shoes on. Full Pedi and Gel cures under a lamp, so you walk out ready to go.',
    ],
    expect: [
      'Feet or hands soak first while nails are trimmed, shaped and the cuticles tidied.',
      'Rough skin is worked over. Say the word if you want more or less pressure, it is easier to adjust as we go than to fix afterwards.',
      'Polish or gel goes on last, once the nail is clean and dry.',
      'Gel finishes are cured under the lamp, so there is nothing to smudge on the way out.',
    ],
    goodToKnow: [
      'Give ordinary polish time before shoes and socks. Gel does not have this problem, which is why it is the usual pick before an event.',
      'Come with bare nails if you are having gel removed. It is a separate job and it adds time.',
      'If you only want nails tidied with no polish at all, say so when you book. It is a shorter and cheaper visit.',
    ],
    faqs: [
      {
        q: 'What is the difference between the full pedicures?',
        a: 'Both include the soak, the shaping and the skin work. One finishes in gel, which is cured under a lamp and lasts. The other finishes in ordinary polish, which is cheaper and comes off with remover.',
      },
      {
        q: 'Can men book a pedicure?',
        a: 'Yes. Feet do not check IDs. Say if you want no polish, and nobody will try to sell you colour.',
      },
      {
        q: 'Should I shave my legs before a pedicure?',
        a: 'It makes no difference to us either way. If the treatment includes any exfoliation, unshaved skin actually takes it better.',
      },
      {
        q: 'How long does a pedicure take?',
        a: 'The booking page shows the time for each option before you commit. The express is a short sitting; the full treatments with gel take considerably longer.',
      },
    ],
  },
  {
    key: 'add on',
    slug: 'add-ons',
    label: 'Add On',
    tagline: 'Small extras that change the appointment.',
    intro: [
      'These two are extras rather than treatments in their own right. Paraffin dip is warm wax that softens dry skin on hands or feet. Hot stone adds heated stones to a massage, which loosens muscle before any hands are involved.',
      'Both are booked alongside something else. On their own they are a short appointment with little to show for it.',
    ],
    expect: [
      'Paraffin is warmed, applied to the hands or feet, and left to set while the skin underneath softens.',
      'Hot stones are heated and used along the back and shoulders, usually as part of a massage rather than instead of one.',
      'Both add time to the appointment. Book them with the main treatment, not after it.',
      'Neither replaces a treatment. If your skin is very dry or your back is very tight, book the full version instead.',
    ],
    goodToKnow: [
      'Say you want an add on when you book, so the diary holds enough time. Turning up and asking is often fine but not guaranteed on a busy day.',
      'Paraffin is particularly good for cracked heels in winter.',
      'Hot stone is not suitable in pregnancy or with some circulatory conditions. Tell us when you book and we will advise.',
    ],
    faqs: [
      {
        q: 'Can I book an add on on its own?',
        a: 'It can be booked, but it is a few minutes of work and you will get more out of it paired with a manicure, a pedicure or a massage. Add it to a main treatment when you book.',
      },
      {
        q: 'What does paraffin dip actually do?',
        a: 'Warm paraffin holds heat against the skin, which softens dry, hard skin and leaves hands or feet noticeably smoother. It is a comfort treatment more than a repair.',
      },
    ],
  },
  {
    key: 'massage',
    slug: 'massage',
    label: 'Massage',
    tagline: 'Swedish body work, thirty minutes or a full hour.',
    intro: [
      'Two lengths of Swedish massage are on the menu, thirty minutes and sixty, plus a foot massage if feet are what ache. The half hour suits a single problem area or a lunch break. The hour lets back, shoulders and legs each get proper attention instead of a greatest-hits tour.',
      'Swedish is the familiar relaxing style: long strokes, kneading, warm oil. It is not deep tissue work, so if you need knots worked out hard, say so when you book and we will tell you honestly whether it is the right choice.',
    ],
    expect: [
      'You will be asked about pressure, problem areas and anything to avoid. Speak up during as well, the massage adjusts to you.',
      'Warm oil, a quiet room, and the time you booked with no phone.',
      'You are draped with towels throughout and only the area being worked on is uncovered.',
      'The foot massage is done seated or reclined, and covers feet, ankles and lower legs.',
    ],
    goodToKnow: [
      'Drink water afterwards. It helps with next-day stiffness.',
      'Arrive a few minutes early so the time on the table is the time you paid for.',
      'Do not book a massage straight after a big meal. Give it an hour.',
      'Pair the hour massage with a pedicure and make an afternoon of it. Book both together so the diary holds the time.',
    ],
    faqs: [
      {
        q: 'Should I book thirty minutes or sixty?',
        a: 'One area, like shoulders and neck, fits in thirty minutes. If you want the whole body covered without rushing, book the hour. A thirty minute full body massage is a quick pass, not a thorough one.',
      },
      {
        q: 'Do I undress fully?',
        a: 'To whatever level you are comfortable with. You stay draped with towels throughout and only the area being worked on is uncovered.',
      },
      {
        q: 'Is Swedish massage the same as deep tissue?',
        a: 'No. Swedish is relaxing, flowing pressure. Deep tissue is slower and more targeted on knots, and it can leave you tender the next day. If you want knots worked out, ask for it by name.',
      },
      {
        q: 'Can I have a massage while pregnant?',
        a: 'Tell us when you book and we will advise on what is suitable. Some techniques and positions are not appropriate at certain stages, and that is a conversation rather than a yes or no.',
      },
    ],
  },
  {
    key: 'waxing',
    slug: 'waxing',
    label: 'Waxing',
    tagline: 'Face and body, a few minutes to a full leg.',
    intro: [
      'Waxing here covers the face and the body. Brows, lip, chin, nose and ears are quick appointments. Underarms, arms, legs, bikini and Hollywood take longer and are booked with the time they need.',
      'Brows are shaped, not just cleared. Bring a photo or describe the shape and it will be followed rather than improvised.',
    ],
    expect: [
      'Skin is cleansed first so the wax grips hair rather than lotion.',
      'Strip wax for larger areas, hot wax for sensitive spots like brows, lip and bikini.',
      'A soothing product goes on afterwards. Expect some redness for an hour or two, longer on the face.',
      'Ingrown-hair advice comes free with every intimate wax.',
    ],
    goodToKnow: [
      'Hair needs to be about a grain of rice long, roughly two to three weeks of growth. Too short and the wax cannot grip.',
      'Exfoliate the day before a body wax, not the day of.',
      'Avoid sun, saunas and workouts for 24 hours after. Freshly waxed skin is sensitive skin.',
      'Do not shave between waxes. Shaving resets the growth cycle and undoes the thinning that regular waxing gives you.',
    ],
    faqs: [
      {
        q: 'How long should my hair be for waxing?',
        a: 'About half a centimetre, a grain of rice. Too short and the wax cannot grip; too long and it hurts more than it needs to. Two to three weeks of growth is the rule.',
      },
      {
        q: 'Does a bikini wax hurt?',
        a: 'The first one is uncomfortable, and it gets noticeably easier from the second visit as hair grows back finer. Hot wax and quick work make the difference. Most clients wonder what they worried about.',
      },
      {
        q: 'What is the difference between a bikini wax and Hollywood?',
        a: 'A bikini wax takes the hair at the edges and leaves a strip. Hollywood removes everything, front to back. Say which you want when you book, because the two take different amounts of time.',
      },
      {
        q: 'How long does waxing last?',
        a: 'Three to four weeks of smooth, and longer with regular visits as regrowth slows and thins. Shaving in between resets the clock, so try not to.',
      },
    ],
  },
];
