# Parked until 1.0 is approved

Nothing here goes in build 13. The App Store submission is the only live thread;
everything below waits until the app is through review, because each one is either a
new rejection surface or a distraction from clearing the one we have.

## 1. Let the splash hold, then tap to continue

**Asked for by Canberk, 1 Sep 2026.** The splash shows a quote and then leaves before
anyone has read it. Give the words a beat.

The reference is Insight Timer: the opening screen is not a loading state you endure,
it is a small thing you are meant to look at, and it does not move until you say so.

Shape:

- Hold roughly a second longer than it takes to load, so the quote is legible rather
  than glimpsed. The hold is the point, not a side effect of a slow boot.
- Then a Continue affordance. `WordArrow` already is the app's primary action
  everywhere else, so this is `<WordArrow label="Enter" />` and not a new button.
- The quote has to be readable before the arrow appears, or the arrow is just a
  second thing competing for the eye.

Open questions to settle when we build it, not now:

- Does it hold every launch, or only the first of the day? Every launch is charming
  for a week and then it is a toll booth. Leaning toward first-launch-of-the-session.
- Does the quote rotate? If yes it needs a source, and the monologue corpus is right
  there.
- Reduced motion and VoiceOver: an auto-advancing splash is a problem for both, so
  a tappable Continue is the accessible version anyway. That argues for the arrow
  always being present rather than fading in.
- `expo-splash-screen` controls the native splash. This is a *second*, JS-rendered
  screen after it, not a change to the native one. Do not try to make the native
  splash interactive; it cannot be.

## 2. Everything else parked in the same conversation

| what | why it waits |
|---|---|
| Analytics in the app (no deps, no events today; web has GA4 + Vercel) | Deferred by Canberk |
| Android | Deferred by Canberk. Blockers written up separately: purchases are iOS-key only, no `android` key in any `eas.json` profile, BlurView needs `experimentalBlurMethod`, sign-in becomes email-only |
| Supabase RLS on `monologues` / `plays` / `film_tv_references` | Real exposure: readable with the publishable key shipped in the app. Do **not** naively enable RLS, `src/lib/screen.ts` reads Supabase directly and anonymous sessions carry the `authenticated` role. The fix is routing Film & TV through `api.actorrise.com` |
| `search_logs` cannot tell app traffic from web | Needs a platform or User-Agent column on the backend. Mobile never sends `slid` either, so the mobile funnel is unlinked |
| Paywall degrades badly if RevenueCat cannot fetch offerings | Shows prices and a CTA that answers "Couldn't reach the App Store". Should hide prices and the CTA, keep Restore |
| `metro-cache/` is untracked and not in `.gitignore` | Noise in every `git status` |
| `interjection` mis-typed in the backend segmenter | Fixes web and mobile with no app update |
| ~~Free reads: monthly or lifetime?~~ | **Settled 1 Sep 2026.** Both sides were right about different products. The web is a free tier: 5 pieces a calendar month. Ghost Light is a trial: 3 pieces for life, then the paywall, then the 1-week trial behind it. Counts do not pool; `monologue_views.client` keeps them apart and the app sends `X-Client: ghostlight`. Nothing left to decide |
