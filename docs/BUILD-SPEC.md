# Ghost Light iOS — Build Spec

Date: 2026-08-21
Companion to: `2026-08-21-monologue-mobile-app-design.md` (the why). This document is the what.

**This file is written to be handed to a fresh Claude Code session in a new, empty repo.** It is
deliberately self-contained: the new repo has none of ActorRise's context.

---

## 0. What you are building

An iOS app that does one job: help an actor find a monologue. Search 10,863 monologues, read
them, save them, prepare them. **Not** a line-reader or scene-partner app; that is explicitly v2.

Business model: free unlimited search, **3 full monologue reads (lifetime)**, then a paywall.
$29.99/yr or $4.99/mo, annual pushed. The paywall placement is the product decision the whole
app is built around; do not move it without re-reading the design doc.

iOS only for v1. Android later. Do not add Android-specific code, but do not actively prevent it.

---

## 1. Repo

**A separate repo from `actorrise`.** Justification: the mobile app shares no UI with the Next.js
web app (deliberately — see the design doc), the FastAPI backend is already a separate service,
and tangling EAS builds with Vercel deploys helps nobody.

The one real cost of a split repo is **API type drift**. Solve it properly on day one rather than
by hand: the backend is FastAPI, so it publishes an OpenAPI schema. Generate a typed client from
it and re-generate whenever the backend changes.

```bash
# from the new repo, against the running API
npx openapi-typescript https://<api-host>/openapi.json -o src/api/schema.d.ts
```

Suggested location: `~/Development/ghostlight`. App name is **deferred pending ASO keyword
research** — do not spend time on it. Use the bundle id `com.actorrise.ghostlight` and rename
later; the App Store display name is a field in App Store Connect, not a code change.

---

## 2. Stack (versions current as of 2026-08-21)

| layer | package | notes |
|---|---|---|
| Runtime | **Expo SDK 57**, React Native 0.86.2, React 19.2 | **Pin `expo@>=57.0.9`.** Earlier 57.x has a Hermes V1 memory regression that badly inflates memory in any app importing Reanimated or worklets. This app does. |
| Architecture | New Architecture only | Legacy was removed in SDK 55. There is no flag to set; it is the only option. |
| Navigation | **expo-router v7** | **Does not depend on react-navigation.** Anything imported from `@react-navigation/*` will not work. Ignore older tutorials — this is the single most common way to waste an afternoon here. |
| Styling | **Uniwind** | Tailwind v4 bindings from the Unistyles team, ~2.5x faster than NativeWind. Not NativeWind: v5 dropped bare RN support and benchmarks 258ms vs 66ms on 2,000 iOS views. |
| Components | **HeroUI Native** v3 | Built directly on Uniwind + Tailwind v4, React Aria underneath. |
| Animation | **react-native-reanimated** v4 | UI-thread worklets. Everything animated goes through this. |
| Graphics | **@shopify/react-native-skia** | Only for the spotlight and the paywall fade. Not for ordinary motion. |
| Sensors | **expo-sensors** (DeviceMotion) | Drives the tilt spotlight. |
| Haptics | **expo-haptics** | |
| Lists | **@shopify/flash-list** v2 | Rewritten for New Arch, needs no size estimates. List performance *is* the product here. |
| Server state | **@tanstack/react-query** | Same patterns as the web app. |
| Client state | **zustand** + **react-native-mmkv** | |
| Local storage | **expo-sqlite** | Offline saved monologues (a paid feature, so it must be real). |
| Auth | **@supabase/supabase-js** + **expo-apple-authentication** | Native Apple sign-in, not a browser detour. |
| Payments | **react-native-purchases** (RevenueCat) | |
| Build | EAS Build + EAS Submit | **A development build is required from day one** — IAP needs custom native code and cannot run in Expo Go. |

Apple Developer account, tax and banking are **already done** (Canberk has a shipped app under
his name). Nothing is blocked on Apple paperwork.

---

## 3. Design system — Ghost Light

Ported from `actorrise/app/globals.css` and `actorrise/components/brand/`. The app must feel like
the web app; this is not negotiable and is the point of the whole aesthetic.

### Tokens

| token | value | role |
|---|---|---|
| `--stage-glow` | `oklch(0.72 0.17 55)` | the warm orange bulb |
| `--primary` | `oklch(0.58 0.18 45)` | brand orange, hex `#CB4B00`, hover `#B03000` |
| `--stage-line` | `oklch(0.30 0.02 55)` | the stand below the bulb |
| dark `--background` | `oklch(0.16 0.015 50)` | warm near-black. **Never flat black.** |
| dark `--card` | `oklch(0.20 0.018 52)` | |
| dark `--foreground` | `oklch(0.95 0.012 78)` | |
| light `--background` | `oklch(0.97 0.007 70)` | the reading page |
| light `--foreground` | `oklch(0.18 0.008 45)` | |
| `--radius` | `16px` | |

### Fonts

- **Playfair Display** (`font-brand`) — big display titles only
- **Courier Prime** (`font-typewriter`) — monologue text and stage directions. Never UI chrome.
- **Montserrat** (`font-sans`) — all UI chrome, labels, buttons

Load via `expo-font`. Rule from the web app, carry it exactly: typewriter is for the *words of the
play*, sans is for everything the app itself says.

### Effects

```
.stage-spotlight  radial-gradient(42rem circle at var(--spot-x) var(--spot-y),
                    glow@16% 0%, glow@7% 32%, transparent 68%)
.stage-wash       radial-gradient(120% 90% at 50% -20%, glow@11% 0%, transparent 60%)
.stage-grain      feTurbulence noise overlay — stops dark surfaces banding
.stage-direction  Courier Prime, italic, lowercase, letter-spacing 0.08em  → "(lights up.)"
ghost-flicker     7s linear infinite; opacity dips at 92-97% (1 → .55 → .9 → .65 → 1)
GhostLight        bulb + radial halo at 38% + optional stem line fading downward
```

### The core port problem

The web's `SpotlightSurface` follows the **mouse** and explicitly bails on touch
(`if (e.pointerType !== "mouse") return`). Phones have no cursor. A direct port ships Ghost Light
with its best idea removed. Two replacements:

1. **Tilt** — `expo-sensors` DeviceMotion → Reanimated shared value → Skia gradient centre.
2. **Scroll** — in the results list, scroll offset lights the card at the viewport centre and
   lets the others fall toward stage dark.

Both must run entirely on the UI thread: sensor and scroll values become Reanimated shared values
read directly by Skia. **JavaScript must not run per frame.** If you find yourself calling
`setState` on scroll, stop and rewrite it.

Honour `prefers-reduced-motion` (`AccessibilityInfo.isReduceMotionEnabled`): kill the flicker and
freeze the spotlight centred. The web app already does this.

---

## 4. API

Base: the existing FastAPI service (Render, `srv-d64941chg0os73d11260`). **No new backend service.**

Auth is a Supabase JWT in `Authorization: Bearer <token>`.

| endpoint | use |
|---|---|
| `GET /api/monologues/search` | the main search. Params: `q`, `gender`, `age_range`, `emotion`, `theme`, `difficulty`, `tone`, `category`, `author`, `max_duration`, `exclude_overdone`, `max_overdone_score`, `source_type` (`play,film,tv`), `limit` (≤100), `page`. Omit `q` for discover/random. |
| `GET /api/monologues/{id}` | full monologue |
| `GET /api/monologues/{id}/similar` | "more like this" |
| `POST` / `DELETE /api/monologues/{id}/favorite` | save / unsave |
| `GET /api/monologues/favorites/my` | saved list |
| `PATCH /api/monologues/{id}/favorite/notes` | notes on a save |
| `POST /api/monologues/{id}/memorized` · `/studied` · `/cut` | prep state |
| `GET /api/monologues/discover` · `/trending` | onboarding and empty states |
| `GET /api/subscriptions/me` | entitlement |
| `GET /api/subscriptions/usage` | quota |

### Backend changes required (do these first, in the `actorrise` repo)

1. **`/api/monologues/search` currently requires auth** (`current_user: User = Depends(get_current_user)`,
   not optional). This directly blocks "open the app and search immediately", which is the design's
   load-bearing conversion decision.

   **Fix: Supabase anonymous sign-in.** On first launch the app calls `signInAnonymously()`, so a
   real `user_id` exists from second zero with no signup wall. Later, `linkIdentity()` upgrades
   that same anonymous user to Apple or Google without losing their saves or read count. This is
   better than loosening the endpoint: the free-read counter gets a server-side home, saves work
   pre-signup, and the account-linking moment stays graceful.

   Verify `require_ai_search_when_query` and `BurstLimiter("ai_search")` permit anonymous/free
   users to search. If the AI-search gate blocks free tier, search dies at launch.

2. **Free-read counter, server-side.** Add `monologue_reads` to `usage_metrics`, incremented by a
   read endpoint. Lifetime, not monthly (a monthly reset teaches actors to wait rather than pay).
   Do not keep this only in MMKV — device-local is trivially reset.

3. **RevenueCat webhook → entitlement.** New endpoint alongside the existing Stripe webhooks that
   grants the Monologues tier on a RevenueCat `INITIAL_PURCHASE` / `RENEWAL` and revokes on
   `EXPIRATION` / `CANCELLATION`. Match on the RevenueCat `app_user_id`, which must be set to the
   Supabase user id at login.

4. **New `monologues` pricing tier** in the DB, between free and Plus.

---

## 5. Screens, in build order

Build in this order. Each step is shippable-ish and de-risks the next.

### Step 0 — the spike (build this first, alone)

**Only the results list.** 20 hardcoded monologues, FlashList v2, dark stage, scroll spotlight
lighting the centre card, tilt spotlight on the background. No search, no auth, no navigation, no
payments.

The only question it answers: **does Ghost Light feel right in the hand?** Everything else in this
project is known-solvable. This is the one genuinely unproven assumption, and the whole product
rests on it. If the tilt reads as a gimmick or the lit-card scroll feels sluggish, that must be
discovered on day two, not week six.

Do not proceed until this feels good.

### Step 1 — Onboarding

Three screens maximum, swipeable, skippable. Dark stage, ghost light, Playfair. It sells the
promise — 10,863 monologues, filtered by who you actually are — it does not explain the UI.
Anonymous Supabase session is created silently here. **No account required to continue.**

Keep it ruthlessly short. Every onboarding screen costs installs.

### Step 2 — Search (the home screen)

Search *is* home. No dashboard, no tab bar landing on something else. Dark stage, flickering
bulb, one line of Playfair, and the search field as the hero.

Filters are **not dropdowns**. A row of `.stage-direction` chips in lowercase Courier italic:
`(female.)` `(20s.)` `(comedic.)` `(under 2 min.)`. Tapping lights a chip orange; unlit chips sit
dim. Maps to the `gender` / `age_range` / `tone` / `max_duration` query params.

### Step 3 — Results

FlashList v2 over `/api/monologues/search`. Each card: title, source, character, age, gender,
length, overdone badge, and the **first two lines in Courier**. Scroll spotlight lights the centre
card. Actors judge a monologue by reading it, so text must be legible — **no swipeable card deck**.

Empty and soft-fail states: `GhostLight` with the stem, alone on the dark stage, under
`(nothing here yet.)`.

### Step 4 — Read

Lights up. Card rises, background settles to full stage dark, text fades in. A `(lights up.)`
eyebrow in Courier italic.

**The reading canvas is light** — warm paper against the dark shell. This inverts the app's
brightness on purpose; the web app already made this call and it is correct. Long text on pure
dark reads worse.

This screen increments the read counter.

### Step 5 — Auth

Triggered by the first **save**, not by app launch. `expo-apple-authentication` for native Apple
sign-in; Supabase `signInWithOAuth` for Google. **Sign in with Apple is mandatory** given Google
is offered — Apple rejects otherwise.

Uses `linkIdentity()` to upgrade the existing anonymous user, so nothing they did is lost. The
hard parts here are session persistence, deep linking and redirect handling, not the buttons.

### Step 6 — Saves and prep

Saved list, notes, memorized/studied state. Offline copies into expo-sqlite for paid users.

### Step 7 — Paywall

**Build this last and build it slowly. It is the product.**

On the 4th read: title, character and first two lines come up **lit** — they must see it is
genuinely their part — then the ghost light dims and the rest of the text falls into shadow under
a Skia gradient mask. Not a blur. Not a modal slammed over a blank screen. Then the bulb comes
back up carrying the offer.

Offer screen: annual $29.99 highlighted, monthly $4.99 secondary. Bullets: every monologue,
unlimited saves, memorize mode, record yourself, works offline. **"Restore Purchases" link is
required by Apple** — omitting it is a guaranteed rejection.

No free trial in v1. The 3 reads are the trial.

Use RevenueCat's remote paywall config where possible, so copy and layout can be A/B tested
without shipping an app update. Given the entire business model is *where the wall sits*, that
capability is worth more here than in a typical app.

---

## 6. Do not build in v1

- ScenePartner, script upload, AI line reading — v2, deliberately
- Self-tape recording — `user_tapes` has 0 rows all-time on web; no evidence of demand yet
- Android
- Social, community, Green Room
- A web version of this app — that already exists

---

## 7. Definition of done for v1

- Cold launch to first search result with no account, under 3 seconds
- Scroll at 60fps through 100+ results on a real device, not a simulator
- 3 reads, then the paywall fires reliably, including after reinstall (server-side counter)
- Purchase → entitlement granted on the ActorRise account → unlimited reads, verified end to end
- Restore Purchases works on a second device
- Sign in with Apple works, and linking preserves anonymous saves and read count
- Reduced-motion disables flicker and freezes the spotlight
