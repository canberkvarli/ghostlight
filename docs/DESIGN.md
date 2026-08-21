# ActorRise Mobile App, v1 Design

Date: 2026-08-21
Status: design agreed in brainstorm, not yet planned or built

## Decision in one line

Ship an iOS app that is **monologue search only**, free to search, paywalled at the
monologue text, at **$29.99/year**. ScenePartner is v2.

## Why this and not the alternatives

**Not a ScenePartner / line-reader app.** That market is full. ScenePartner: AI Line Reader
claims 10,000+ actors; ActingPal is $9.99/mo with 53 voices, teleprompter, memorize mode and
self-tape; ActOnCue, Subtext, LineLearner, Memocoach and Scene Study all do the same job.
ActorRise's own ScenePartner had **4 script uploads by 3 users in the last 30 days**. Entering
that fight with the weakest product and no content advantage is the worst available move.

**Monologue search is uncontested.** The best-known monologue app, Soliloquy, ships **100
classical monologues** and lets you favorite 5. ActorRise has **10,863**, with semantic search,
film/TV/play sources, and gender, age, tone, duration and overdone filters. That is the moat.

**The usage data agrees** (last 30 days):

| surface | events | users |
|---|---|---|
| monologue views | 760 | 133 |
| searches | 466 | 128 |
| rehearsals | 51 | 25 |
| scripts uploaded | 4 | 3 |

## This is an acquisition product, not a retention product

The existing 546 users will not install this. Growth comes from **App Store search**: actors
typing "monologue", "audition monologue", "monologues for actors". Soliloquy ranks for those
terms with 100 monologues. ActorRise arrives with 10,863.

ASO ranking is driven by downloads, ratings and retention signal. That is why the free tier is
generous: it is not lost revenue, it is the marketing budget. A harsh wall damages all three
ranking inputs at once.

## Pricing

Tiered by **feature**, not by platform, so the app does not undercut web Plus.

| tier | price | what it is |
|---|---|---|
| Free | $0 | Unlimited search. 3 full monologue reads, lifetime. 1 save. |
| **Monologues** | **$29.99/yr** or $4.99/mo | Everything below. Annual shown first, "save 50%". |
| Plus | $99/yr (web, unchanged) | Monologues plus ScenePartner and the rest. |

Monologues tier includes: unlimited reads, unlimited saves, memorize mode, record yourself,
offline access.

**No free trial in v1.** The 3 free reads are the trial. Trials add churn tracking and paywall
complexity that a solo dev does not need on day one. Revisit once there is conversion data.

**Annual is pushed, not monthly.** The job is episodic: an actor needs a monologue when they
have an audition or a class assignment, then not again for months. On monthly billing they
notice in March that they have not opened it since January and cancel. Annual matches how an
acting career actually runs, in seasons, and one audition emergency in month 9 justifies the
whole year.

**Why not $5 one-time.** It caps every human at $5 forever minus Apple's 15%, and it anchors the
audience at "ActorRise is a $5 utility", which makes $99/yr Plus unsellable later. Migrating
one-time buyers onto a subscription is also the most reliable way to anger early users.

## Quota, and why the wall is where it is

**The wall is the monologue text, not the search, and not the save.**

The 90-day data on 218 searchers:

| searches | users | share |
|---|---|---|
| 1 | 57 | 26% |
| 2 | 38 | 17% |
| 3-5 | 97 | 44% |
| 6-15 | 24 | 11% |
| 16+ | 2 | 1% |

Median 3 searches. Only **28 of 218 (12.8%) ever favorited anything**, at 3.2 views each.

- **A save gate is too soft.** It speaks to 12.8% of users. Seven of eight never hear the offer.
- **A 2-search cap is too hard, and silent where it matters.** 43% of searchers do 2 or fewer
  searches, so the wall never reaches them at all. It blocks the engaged half and says nothing
  to the half that leaves.
- **A text gate reaches everyone.** Every searcher opens at least one monologue, 3.2 on average.
  It fires at the moment of desire rather than the moment of frustration: a search cap says "no"
  while the actor still does not know whether the app has their part, which is a one-star
  review. A text gate says "yes, this is exactly your part, unlock it."

**3 free reads, lifetime, not monthly.** A monthly reset teaches people to wait, and since the
job is episodic they would simply return next month for free and never pay.

## User flow

1. **Open the app. No signup wall.** Search immediately. Requiring an account before any value
   is the standard way new App Store apps die.
2. **Search** ("angry young woman, contemporary, under 2 minutes"). Results show title, play or
   film, character, age, gender, length, overdone badge, and the **first two lines**.
3. **Tap a result.** Full text. Read 1 of 3.
4. **Reads 2 and 3.** On closing read 3, a soft counter: "3 of 3 free reads used."
5. **Tap a 4th monologue.** Paywall. Not a blank blocking modal: the monologue's real title,
   character and first two lines stay visible, with the rest blurred behind the offer. They see
   exactly what they are buying.
6. **Paywall screen.** "Unlock 10,863 monologues." Annual $29.99 highlighted, monthly $4.99
   secondary. Bullets: every monologue, unlimited saves, memorize mode, record yourself, works
   offline. "Restore purchases" link, required by Apple.
7. **Account creation comes after value**, at the first save attempt or immediately after
   purchase. The account is what links the purchase to their ActorRise Monologues entitlement.

## Stack

Existing stack, for reference: Next.js 16, React 19, Tailwind 4, Supabase, TanStack Query,
framer-motion, FastAPI backend on Render with 22 API route modules.

Researched 2026-08-21. Versions below are current as of that date.

### Core

| layer | choice | why |
|---|---|---|
| Runtime | **Expo SDK 57**, React Native 0.86.2, React 19.2 | SDK 55 (Feb 2026) dropped the Legacy Architecture entirely; New Architecture is now the only option. SDK 57 is a deliberately zero-breaking-change release. **Pin `expo@>=57.0.9`** (Aug 13): earlier 57.x carries a Hermes V1 memory regression that badly inflates memory in any app importing `react-native-reanimated` or `react-native-worklets`, which this app does. |
| Navigation | **expo-router v7** | File-based routing, native toolbars, zoom transitions. Note: v7 **no longer depends on react-navigation**, so anything imported from `@react-navigation/*` will not work alongside it. Do not follow older tutorials. |
| Backend | **The existing FastAPI service, unchanged** | Search, filters and monologue endpoints already exist and already serve the web app. The app is a new client, not a new backend. |

### Styling and components

| layer | choice | why |
|---|---|---|
| Styling | **Uniwind** (not NativeWind) | Tailwind v4 bindings for React Native from the Unistyles team. In 2,000-view iOS render benchmarks NativeWind v5 takes 258ms against Unistyles' 66ms; Uniwind's open-source engine is ~2.5x faster than NativeWind. NativeWind v5 also targets Tailwind v4 but **dropped bare React Native support**. Uniwind is at ~115k weekly downloads with a stable Pro 1.0, so it is no longer bleeding-edge. |
| Components | **HeroUI Native** | v3 (March 2026), 37 React Native components, built directly on Uniwind and Tailwind v4, React Aria underneath for accessibility, animations moved to CSS with no JS runtime. Pairs natively with the styling choice rather than fighting it. |

Alternatives considered: Gluestack UI (strongest accessibility story, `@react-native-aria` focus trapping) and
Tamagui (optimizing compiler, universal web+native). Both are fine. HeroUI + Uniwind wins on
coherence: one Tailwind v4 vocabulary shared with the existing web app.

### Animation

| layer | choice | why |
|---|---|---|
| Base | **Reanimated 4** | UI-thread animations via worklets. The baseline everything else assumes; Skia 2.10+ requires it. |
| Special moments | **react-native-skia**, sparingly | GPU/shader work that bypasses the bridge via JSI. Use it for the two moments that sell the app: the ghost-light glow and the paywall blur-and-reveal. Not for ordinary UI motion. |

### Data and lists

| layer | choice | why |
|---|---|---|
| Lists | **FlashList v2** | This is a search-results app over 10,863 monologues, so list performance *is* the product. v2 is a ground-up rewrite for the New Architecture and needs no size estimates. LegendList benchmarks faster on 10k-item scrolls but is far less battle-tested; FlashList remains the recommendation above ~5,000 items. |
| Server state | **TanStack Query** | Already in use on web. Same caching patterns, same code shape, and it carries the offline persistence story. |
| Client state | **Zustand + MMKV** | 1.1 KB, with MMKV persistence for anything surviving app restart. The 2026 consensus is server state in TanStack Query, client state in a tiny store. |
| Offline reads | **expo-sqlite** | Saved monologue text stored locally. Offline access is a paid-tier feature, so it has to be real. |

Rejected: Legend State. Genuinely good fine-grained reactivity and offline-first sync, but 210 open
issues against 4k stars is not a dependency a solo developer should take on the critical path.

### Auth and payments

| layer | choice | why |
|---|---|---|
| Apple sign-in | **expo-apple-authentication** | Native, not a browser detour. Web-style OAuth is the wrong default on iOS, and **Sign in with Apple is mandatory** given Google sign-in is offered. |
| Google sign-in | **Supabase `signInWithOAuth`** | Supabase verifies tokens against Google's public keys server-side, so the app never validates them itself. The hard parts here are session persistence, deep linking and redirect handling, not the buttons. |
| Payments | **RevenueCat** | Wraps StoreKit 2 behind receipt validation, Restore Purchases and entitlement sync, then fires a webhook that grants the Monologues entitlement in Supabase next to the existing Stripe grants. 1% of revenue above $2,500/mo, so effectively free at current scale. Its **visual paywall builder** matters unusually much here: the paywall's placement and copy *is* the business model, and this allows A/B testing it without shipping an app update. |

Rejected: `expo-iap`. Direct native purchase APIs with React hooks, but it leaves server-side receipt
validation and entitlement management entirely to you. That is the exact work worth paying 1% to skip.

### Build

EAS Build and EAS Submit. A **development build is required** from day one, since in-app purchases
need custom native code and cannot run in Expo Go.

**Do not try to share UI components with the web app.** React Native shares TypeScript, types and
API clients with Next.js, but not the DOM. Bridging tools (react-native-web, Solito, Tamagui)
cost a solo dev more than they save on a v1 that is roughly eight screens. Share the types and
the API client; write the screens fresh.

**Rejected: Capacitor or a WebView wrapper around the existing Next.js app.** Fastest to ship and
the wrong call here. App Store Review Guideline 4.2 rejects thin web wrappers, and this is an ASO
product where ratings decide whether it ranks. A web-feeling app earns the ratings that kill it.

**Rejected: native Swift/SwiftUI.** Better feel and performance, but it means learning a new
language solo, sharing nothing with the web codebase, and doubling the work when Android comes.

Costs: Apple Developer Program $99/yr. RevenueCat free at this revenue. EAS free tier is likely
enough at first.

## Design: porting Ghost Light to a phone

The app must feel like the web app. The existing language, read from `app/globals.css` and
`components/brand/`:

| token | value | role |
|---|---|---|
| `--stage-glow` | `oklch(0.72 0.17 55)` | the warm orange bulb. Brighter than `--primary` `oklch(0.58 0.18 45)`. |
| `--stage-line` | `oklch(0.30 0.02 55)` | the stand falling away below the bulb |
| dark `--background` | `oklch(0.16 0.015 50)` | warm near-black, never flat black |
| `--radius` | `16px` | |
| `.stage-spotlight` | 42rem radial at `--spot-x/--spot-y`, 16% → 7% → transparent at 68% | the cursor-following stage light |
| `.stage-wash` | `120% 90% at 50% -20%`, 11% glow | overhead wash so dark never reads flat |
| `.stage-grain` | feTurbulence noise | stops banding on dark surfaces |
| `ghost-flicker` | 7s linear infinite, dips at 92–97% | the bulb's unsteadiness |
| `.stage-direction` | Courier Prime, italic, lowercase, `0.08em` tracking | "(lights up.)" eyebrows |
| `GhostLight` | bulb + 38% radial halo + optional stem | the motif itself |

Fonts: Playfair (`font-brand`) for display, Courier Prime (`font-typewriter`) for monologue text
and stage directions, Montserrat (`font-sans`) for chrome.

### The core problem

**The signature effect is cursor-driven, and phones have no cursor.** `SpotlightSurface` listens
to `pointermove` and bails on anything that is not a mouse. A direct port would ship the web
design with its best idea silently removed.

Two replacements, both better than a cursor because they are things the web cannot do:

1. **Tilt.** `expo-sensors` DeviceMotion feeds a Reanimated shared value that drives the Skia
   radial gradient's centre. Tilt the phone and the stage light slides across the surface. This
   is the screenshot people post.
2. **Scroll.** In the results list the spotlight tracks scroll position, so the card at the centre
   of the viewport is lit and the cards above and below fall toward stage dark. A light moving
   along a row of actors waiting to audition.

Both run on the UI thread: scroll offset and device motion become shared values, Skia renders the
gradient, and JavaScript never enters a frame. This is precisely the job Reanimated 4 and Skia
exist for, and it is the reason they are in the stack rather than decoration.

### The five moments

1. **Open.** No dashboard, no tabs-first shell. A dark stage, the ghost light bulb flickering, one
   line of Playfair, and the search field as the hero. Search *is* the home screen.
2. **Filter.** Not dropdowns. A row of `.stage-direction` chips in lowercase Courier italic:
   `(female.)` `(20s.)` `(comedic.)` `(under 2 min.)`. Tapping lights a chip orange; unlit chips
   sit dim. A form that reads as a script, not a database query.
3. **Results.** FlashList v2. Each card shows title, source, character, age, gender, length, and
   the **first two lines in Courier**. The centre card is lit by the scroll spotlight; the rest
   sit in shadow. Reading is how an actor judges a monologue, so the text must be legible, not
   swiped past. No card-deck metaphor.
4. **Read.** Lights up. The card rises, the background settles to full stage dark, and the text
   fades in. A `(lights up.)` eyebrow in Courier italic. **The reading canvas stays light**, warm
   paper against the dark shell, exactly as the web decided. Long text on pure dark is worse to
   read, and that decision is already correct.
5. **Memorize** (paid). Lines dim out one at a time as they are learned. The lights going down,
   line by line.

### The paywall is the metaphor

After three reads, tapping a fourth: the title, character and first two lines come up **lit** —
they see it is genuinely their part — and then the ghost light dims and the rest of the text
falls away into shadow under a gradient mask. Not a blur, not a modal slammed over a blank
screen. The bulb then comes back up carrying the offer.

The business model and the brand metaphor turn out to be the same gesture. That is the best idea
in this document, and it is worth building carefully.

Supporting details: `expo-haptics` gives the flicker a barely-there tick. Empty and soft-fail
states use `GhostLight` with the stem, alone on a dark stage, under `(nothing here yet.)` —
reusing the motif the web already uses for the same purpose. Honour `prefers-reduced-motion`;
`globals.css` already disables the flicker under it, and the tilt spotlight must respect it too.

## Name

**"Ghost Light: Monologues for Actors"**, published under the developer name ActorRise.

The App Store title is the strongest ASO ranking signal, so it has to carry the keyword. "Ghost
Light" alone would land among ghost-hunting and paranormal apps, which is where App Store search
for "ghost" actually goes. The paired form keeps the poetry and still ranks for *monologue*.

"Ghost Light" appears clear on the App Store. The nearest neighbour is **Ghostlight ETC**, an
account and class-registration app from a stage-lighting company: adjacent industry, different
category, no real conflict. Verify directly in App Store Connect before committing.

Suggested subtitle: *Find your next audition piece.*

Keeping ActorRise as the developer name resolves the two-brand problem: the company signs the
app, the app carries the name Canberk actually loves, and the account-linking screen can say
"your ActorRise account" without confusing anyone.

## Open questions, deliberately deferred

- **iOS first, Android later — confirmed 2026-08-21.**
- Exact shape of the RevenueCat webhook to Supabase entitlement grant, alongside Stripe.
- Whether the web free tier should adopt the same text gate. Careful: it would collide with the
  programmatic SEO plan, which depends on public monologue pages.
