# App Store description

Not indexed by Apple (see `aso.md`). This is a conversion asset — written for an actor who has
already landed on the page and is deciding in about four seconds.

**The first three lines are the whole game.** The App Store truncates there; most people never
tap "more". Everything below the fold is for the minority who are already interested.

---

## Paste this

```
Every actor knows the feeling: an audition on Friday, and no piece.

Ghost Light holds 19,000+ monologues from 2,000+ plays. Filter by age, gender, length
and tone — then hide the ones every other actor in the room is doing.

FIND SOMETHING THAT FITS
Search by what the casting notice actually asks for. Age range, gender, comic or
dramatic, under two minutes. The filters are the ones on the breakdown, not the ones
a database happened to have.

DON'T WALK IN WITH THE SAME PIECE AS THE GIRL BEFORE YOU
Every monologue carries an overdone score. Turn the dial down and the warhorses
disappear — no more Saint Joan, no more "to be or not to be" for the fortieth time
that afternoon. Nobody else does this.

BUILT TO READ, NOT TO SKIM
The reading screen is a lit page in a dark house. Typewriter text, the way a script
is actually set. No ads, no autoplay, no feed. Just the words.

KEEP A BOOK
Save what fits. Your pieces stay on your phone and work without a signal — green
rooms have terrible reception.

CLASSICAL OR CONTEMPORARY, THE WAY THE NOTICE ASKS
Filter by era in one tap. If the breakdown says one classical and one
contemporary, that is a search, not an afternoon of scrolling.

STAGE AND SCREEN
Shakespeare, the Greeks, Ibsen and Molière through to modern American theatre,
plus monologues from film and television.

——

Free: search everything, read three pieces.
Then $4.99/month or $29.99/year with a one-week free trial.

Subscriptions renew automatically unless cancelled at least 24 hours before the end of
the period. Manage or cancel in your Apple ID settings.

Privacy Policy: https://actorrise.com/privacy
Terms: https://actorrise.com/terms
```

---

## Why it is written this way

**It opens on the problem, not the product.** "10,000 monologues" is a feature; "an audition on
Friday, and no piece" is the moment someone is actually in when they search. Nobody downloads a
database. They download a way out of a Friday.

**The overdone score is the lead differentiator and it appears twice.** It is the one thing in
this app that no competitor has, it comes from a real column, and it is instantly legible to an
actor — every one of them has sat in a hallway listening to four people do the same speech. Any
version of this page that buries it is wasting the only unfair advantage we have.

**The subhead is the crudest line on the page on purpose.** It is how actors talk to each other.
The page should sound like a person who has done this, because it was written by one.

**Pricing is stated plainly and early-ish.** Hiding it lifts installs and destroys retention,
and a one-star review that says "didn't say it was paid" costs more than the install was worth.

## Maintenance

- **Promotional text** (in `aso.md`) sits above all of this and can change weekly without a
  build. That is the field to experiment in.
- Re-check the monologue counts against the database before each release. Live today:
  **19,344 monologues across 2,176 plays**, counting only rows not flagged `duplicate`,
  `not_monologue` or `too_short`. "19,000+ / 2,000+" is the conservative rounding and stays
  true. The query is in `docs/growth/README.md`; run it before you change the number.

  The spec's "10,863" is stale and the first draft of this page said "750+ plays" — that was
  the *public-domain* play count, not the catalogue. Undersold the library by two thirds.
- If the Film & TV catalogue grows, the STAGE AND SCREEN block earns a number.
