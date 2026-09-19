# App Store metadata

**The problem this solves: 169 impressions in 90 days.** About two a day. At that volume
nothing else in growth is worth arguing about — the store page converts at 19.8%, which is
fine, and it is converting almost nobody because almost nobody is reaching it. Impressions
are the bottleneck and ASO is the only free lever that moves them.

## What Apple actually indexes

Ranking weight, heaviest first:

1. **App name** (30 chars)
2. **Subtitle** (30 chars)
3. **Keyword field** (100 chars, private)
4. **In-app purchase display names** — genuinely indexed, and almost everyone forgets

The **description is not indexed on iOS.** It is a conversion asset, not a discovery one.
Do not keyword-stuff it; write it for the actor reading it. (This is the opposite of Google
Play, which is why half the ASO advice online is wrong for us.)

Apple concatenates name + subtitle + keywords into one pool and builds multi-word queries from
it. So **never repeat a word across the three** — a repeat buys nothing and costs the slot.

## The set

### Name — 23/30
```
Ghost Light: Monologues
```
Unchanged. It already carries the primary noun, and the brand is worth keeping. "Ghost light"
has no search volume on its own, but it is not costing us anything either — it is the part
someone types once they have already heard of us.

### Subtitle — 24/30
```
Audition Prep for Actors
```
Adds `audition`, `prep`, `actors`. "Audition" is the higher-volume query — an actor in need
searches for the *occasion*, not the artifact. Reads as a plain English promise, which matters
because unlike the keyword field, a human being sees this one.

**Alternate to test after 4 weeks** (29/30) — more keyword reach, colder to read:
```
Shakespeare & Audition Scripts
```

### Keyword field — 94/100
```
acting,actor,theatre,theater,drama,shakespeare,scripts,plays,scene,casting,soliloquy,rehearsal
```

Rules this obeys, each of which people routinely break:

- **No spaces after commas.** A space is a wasted character; Apple splits on the comma.
- **`theatre` and `theater` both.** Apple does not normalise spellings. Half your audience
  trained in one and half in the other.
- **No repeats** of `ghost`, `light`, `monologues`, `audition`, `prep`, `actors` — all four
  already live in the name and subtitle.
- **No plurals of words already singular** (`actor` covers `actors` poorly, but Apple's
  stemming is inconsistent enough that the pair is usually worth it — here `actors` is already
  in the subtitle, so `actor` is the one that needs the slot).
- **No category words** (`entertainment`), no `app`, no competitor names — the first two are
  added automatically and the third gets metadata rejected.

Six characters spare. Leave them. They are not worth a weak term, and the next thing we learn
from Search Ads may want them.

### In-app purchase names — the forgotten index

The subscription display names are indexed. Currently they almost certainly say something like
"Annual" and "Monthly", which ranks for nothing. Change them in App Store Connect to:

| plan | display name |
|---|---|
| annual | `Full Monologue Library — Yearly` |
| monthly | `Full Monologue Library — Monthly` |

This is free keyword surface for `library` and reinforces `monologue`. It also reads better on
the paywall and in the App Store's own subscription sheet, so it is not purely a keyword play.

### Promotional text — 137/170

Not indexed, but it sits above the description and **can be changed without shipping a build**,
which makes it the one field we can move weekly.

```
19,000+ monologues from 2,000+ plays. Filter by age, gender, length and tone —
and hide the ones every other actor in the room is doing.
```
(139/170. Counts verified against the database — see `listing-description.md`.)

The last clause is the differentiator. "Overdone score" is a real column in the database and
no competitor has it. Lead with it everywhere.

### Description — first three lines are the whole game

The App Store truncates to roughly three lines before a "more" tap. Most people never tap.
Full text in `docs/growth/listing-description.md`.

## What we are not doing yet

- **Screenshots.** They convert 40 page views a quarter. Fixing them is real work for almost no
  traffic. Revisit once impressions clear ~1,500/month.
- **Localisation.** Same reason. (Turkish is tempting for obvious reasons. It is not where the
  actors are.)
- **Apple Search Ads.** Worth $5/day *after* the funnel is instrumented — see
  `docs/growth/README.md`. Paying for installs you cannot measure is how you learn nothing
  expensively.

## Doing it

These are all App Store Connect fields, not code. Nothing here needs a build except the IAP
display names, which need a new subscription review (fast, and does not block the app).

1. App Store Connect → Ghost Light → Distribution → prepare a new version (or edit the current
   one if it is still editable).
2. Paste name, subtitle, keywords, promotional text, description.
3. Subscriptions → each plan → edit display name.
4. Submit. Metadata-only changes usually clear review in under a day.

**Then wait four weeks before judging it.** App Store ranking re-indexes slowly and 23 downloads
is inside the noise floor. Judge on *impressions*, not installs — impressions is the number this
change is aimed at.
