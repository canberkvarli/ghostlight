# Growth

Ghost Light has been live for a quarter. Here is the whole picture, from App Store Connect,
90 days to 19 Sep 2026:

| metric | 90 days |
|---|---|
| Impressions | **169** |
| Product page views | 40 |
| First-time downloads | **23** |
| Conversion rate | 19.8% |
| Paying users | not enough data |

**Read it in that order and the diagnosis writes itself.** 169 impressions is under two a day.
The store page converts at 19.8%, which is roughly category-average — it is doing its job on
the traffic it gets. There is no traffic. This is a distribution problem, and every hour spent
on screenshots, pricing or onboarding before impressions move is an hour spent optimising a
funnel nobody has entered.

So: **impressions is the only number that matters this quarter.** Two levers move it, and they
are the first two things below.

---

## 0. Fix the instrument first — half a day

`src/lib/analytics.ts` is a complete, well-built PostHog integration: nine typed events,
identity on sign-in, internal-user tagging, flush on background. Call sites are wired in
`paywall.tsx`, `auth.tsx`, `results.tsx` and `read/[id].tsx`.

**And it has never sent a single event in production.**

```js
const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;   // src/lib/analytics.ts:18
export function initAnalytics(): void {
  if (client || !KEY) return;                      // ← silently returns
```

`EXPO_PUBLIC_POSTHOG_KEY` appears in **no** `eas.json` build profile and in **no** `.env`
(only `.env.example`, which Expo never loads). Every production build has shipped with the key
undefined, so `initAnalytics()` returns on its first line and every `track()` call is a no-op.
The module degrades silently by design — correct behaviour, and exactly why this went unnoticed.

This is why 23 people installed the app and you cannot say whether one of them finished
onboarding.

**The fix:**

1. PostHog → Project Settings → copy the Project API key (starts `phc_`).
2. Add to all four `env` blocks in `eas.json`, beside the Supabase and RevenueCat keys —
   it is a publishable client key, same class as those, safe to commit:
   ```json
   "EXPO_PUBLIC_POSTHOG_KEY": "phc_...",
   ```
3. Add the same line to a local `.env` so `npm start` reports too.
4. Ship a build. **It must be a real binary** — this is a native-adjacent env var baked at
   build time, so an OTA update will not carry it.

Until this is done, do not spend money on Apple Search Ads. Paying for installs you cannot
measure is how you learn nothing expensively.

`docs/after-approval.md` still lists analytics as deferred. It is stale — the work landed; only
the key is missing.

---

## 1. ASO — half a day, free, compounding

The only free lever on impressions. Full metadata set in **`docs/growth/aso.md`**, description
in **`docs/growth/listing-description.md`**.

Headline changes: keep the name, add `Audition Prep for Actors` as subtitle, fill the 100-char
keyword field (it is the highest-value field nobody fills), and rename the two subscription
products — **in-app purchase display names are indexed** and yours currently rank for nothing.

Then wait four weeks. Ranking re-indexes slowly and 23 downloads is inside the noise floor.
**Judge it on impressions, not installs.**

---

## 2. Off-store traffic — ongoing

You are the distribution. Full copy in **`docs/growth/outreach.md`**: the Reddit post, the
overdone-list play, the drama-teacher email, and where not to bother.

The single best idea in there costs nothing: **publish the list of the 25 most overdone
monologues.** It is inherently argument-provoking, it is generated from a column no competitor
has, and it promotes the app by being useful rather than by asking.

---

## 3. The content engine — `scripts/cards.mjs`

Renders Instagram/TikTok cards from the corpus, in the app's own visual language, with captions.

```bash
node scripts/cards.mjs --count 7                  # a week, into content/cards/
node scripts/cards.mjs --count 7 --png            # also PNGs (npx playwright install first)
node scripts/cards.mjs --count 7 --seed 2026-W38  # deterministic — same seed, same batch
```

Rules it enforces, because they are not obvious:

- **Public domain AND written ≤1900.** `copyright_status` alone is not safe. It is US-centric:
  Coward's *Hay Fever* (1925) is flagged `public_domain` and is US-clear, but Coward died in
  1973 so the UK and EU protect it until 2043 — and several of those rows were transcribed from
  a **Samuel French Acting Edition**, which carries its own rights. Instagram is global. The
  year cutoff makes it unambiguous everywhere. Roughly 7,000 monologues survive it, across
  Shakespeare, Schiller, Molière, Ibsen, Euripides, Wilde, Shaw and Marlowe — you will not run
  out. `--before` overrides it; read the note in the script before you do.
- **One monologue per play *and* per author per batch.** Shakespeare is 2,064 of ~7,000
  eligible rows, so unbalanced random picks give you a third Shakespeare and undercut the
  entire "not overdone" pitch.
- **Text is scrubbed** of stage directions, other characters' inline lines (`(DUNCAN: ...)`)
  and trailing citations, all of which live inside `monologues.text` in the raw corpus.
  Rows carrying translator footnotes are dropped rather than repaired.

That last point is a **data bug, not just a rendering concern** — the app is showing that same
cruft on the reading screen. Worth a separate fix upstream.

---

## Cadence

| when | what |
|---|---|
| once | Ship the PostHog key. Push the ASO metadata. Add `ct=` campaign tokens to every link you post. |
| weekly | `node scripts/cards.mjs --count 7 --png`, queue the posts. |
| weekly | One Reddit or community post. Reply to every comment for 48h. |
| weekly | Five drama-teacher emails. Slow channel, compounds hardest. |
| monthly | Check impressions (not installs). Check the PostHog funnel: install → onboarding → search → read → paywall. |

---

## Useful queries

Catalogue counts, for keeping store copy honest:

```sql
select count(*) as live_monologues, count(distinct play_id) as live_plays
from monologues
where review_status is null
   or review_status not in ('duplicate','not_monologue','too_short');
-- 19,344 across 2,176 plays as of 2026-09-19
```

The overdone list, for the post that does the most work:

```sql
select p.title, p.author, m.character_name, m.overdone_score
from monologues m join plays p on p.id = m.play_id
where m.overdone_score >= 0.7
order by m.overdone_score desc, m.view_count desc nulls last
limit 25;
```

---

## What we are deliberately not doing yet

- **Screenshots and app preview video.** They convert 40 page views a quarter. Real work, no
  traffic to spend it on. Revisit past ~1,500 impressions/month.
- **Apple Search Ads.** After the PostHog key ships. Then $5/day on exact-match brand and
  `audition monologue` terms, as a *measurement* buy — it tells you which keywords convert,
  which feeds back into the keyword field.
- **Android.** Blockers are in `docs/after-approval.md`. It doubles the surface area to reach
  an audience that skews away from the one paying for audition tools.
- **Localisation.** Not where the actors are.
