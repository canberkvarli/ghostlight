# Ghost Light on Google Play

Started 3 Sep 2026, after 1.0.1 went to Apple. Decision on record: **full billing at
launch**, not a free tier first.

## Where it stands

Done in the repo, typechecked, and the Android bundle exports clean (8.4 MB):

| change | why |
|---|---|
| `src/lib/purchases.ts` picks the RevenueCat key by `Platform.select` | An `appl_` key on Android does not error, it configures against the wrong store and returns zero offerings. That reads exactly like "no products yet" and sends you hunting in Play Console instead of at one line of code |
| `experimentalBlurMethod="dimezisBlurView"` on Android, via `ANDROID_BLUR` in `PaywallShroud` | Android has no system blur. Without it `expo-blur` is a flat grey sheet over legible text |
| `eas.json` gained `android` build settings and `submit.production.android` | There was no Android key in any profile |
| `eas.json` profiles gained explicit `environment` | Was relying on EAS auto-resolving which env to pull. It resolves correctly today; now it cannot drift |
| `.gitignore` covers `google-play-service-account.json`, `metro-cache/`, `metro-file-map-expo-*` | The first is a private key with publishing rights. The last two were tracked by accident |

**Not a leak, contrary to first assessment.** The paywall shroud looked like it might
expose paid text on Android where the blur degrades. It does not: the API sends only
the opening lines alongside `paywalled: true` (`src/api/schema.d.ts:558`), so the
walled text never reaches the device. The blur is the look, not the lock.

**Sign-in is not email-only on Android**, contrary to the note in `after-approval.md`.
Apple's button is already `Platform.OS === 'ios'` guarded, and Google runs through
Supabase OAuth in `WebBrowser`. `Linking.createURL('auth-callback')` resolves to the
same `ghostlight://auth-callback` on both platforms, so the redirect already
whitelisted in Supabase covers Android with no change. Needs confirming on a device,
but there is no work to schedule.

## What Canberk needs to obtain

Start the first two today; both have multi-day lead times that nothing else can
overlap with.

1. **Google Play Developer account**, $25 once. **Settled 3 Sep 2026: United States,
   personal.** The App Store lists the seller as "Canberk Varli", so Apple holds an
   individual account, there is no D-U-N-S number to reuse, and Canberk is US tax
   resident for this app. Türkiye was considered and rejected: it is fully supported
   and would have been legitimate, but payouts land in TRY (Türkiye is not on the
   "paid in USD or EUR" footnote), the payments profile country can never be edited,
   and a US tax resident owes the IRS on worldwide income anyway, so it adds Turkish
   obligations and FX conversion without removing anything.

   Forming an LLC to reach an organization account and skip the tester gate was also
   rejected: entity formation plus a D-U-N-S number is 1 to 2 weeks, which is what
   the closed test costs anyway, in exchange for money and permanent filing
   obligations.

   So the **12 testers, opted in continuously for 14 days** gate applies. Since 2026
   Google also verifies they genuinely opened the app.
2. **Google Cloud service account** with Play Developer API access, JSON key saved to
   the repo root as `google-play-service-account.json` (gitignored). Used by both
   `eas submit` and RevenueCat.
3. **Feature graphic, 1024x500.** Play requires it, Apple never asked. No equivalent
   asset exists.
4. **`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`** (`goog_...`), added with
   `eas env:create --environment production`. Deliberately not inlined in `eas.json`
   next to the iOS key, so there is one place it lives and it cannot go stale.

## The ordering trap

Two constraints force the sequence.

Play will not let you create subscription products until an AAB **containing the
billing library** is already uploaded to a track. So billing cannot be set up first.

And the 14-day clock only counts a **closed** testing track. Internal testing does
not qualify, so the first upload goes to closed (`eas.json` is set to
`track: "alpha"`, which is Play's closed track). The build that starts the clock does
**not** have to be finished; the closed track can be updated throughout, because the
clock measures testers being opted in, not the build. Upload something early even
with billing unwired, then do everything else while the 14 days run.

1. Build an AAB and upload it by hand to the **closed** track.
2. Create the monthly and annual subscriptions in Play Console, with the 1-week free
   trial as an offer on each. Match the iOS product structure.
3. Connect RevenueCat: add the Play app, upload the service account JSON, map both
   products onto the existing `monologues` entitlement, add them to the current
   offering.
4. Rebuild, install from the internal track, and buy something with a licence tester
   account. A purchase that does not flip `monologues` is the failure to look for.
5. Store listing, Data Safety, content rating.
6. Day 15, apply for production access.

Recruit the 12 testers via a **Google Group** rather than pasting addresses; it is
far easier to manage, and the clock resets if people drop out. Twelve friends who
install and never launch the app will fail the usage check, so ask them to actually
search for a monologue.

## Still to verify on a real device

The simulator proves nothing about any of these.

- **Edge-to-edge.** Expo forces it on Android now. Every screen's safe-area insets
  need eyes, particularly the fixed row geometry in `src/theme/layout.ts` that the
  scroll spotlight depends on.
- **The blur.** `dimezisBlurView` is flagged experimental upstream and is the single
  most likely thing to look wrong or run slow.
- **Hardware back.** `gestureEnabled: false` on the paywall stops the iOS swipe; it
  does **not** stop Android's back button. Backing out lands on the shrouded read
  screen showing only the opening lines, so this is not a leak, and back-dismisses-
  modal is correct Android behaviour. Confirm it does not strand anyone.
- **The Android 12+ splash.** `app.json` gives `expo-splash-screen` a background
  colour and no image, so Android will centre the adaptive icon. Check it against
  `LaunchOverlay` fading up.
- **Skia, Reanimated worklets and the tilt spotlight**, none of which have run on
  Android hardware.

## Open decision: the review account

`appreview@actorrise.com` has 3 lifetime Ghost Light reads and 0 spent. Google's
reviewer and Apple's reviewer will now share that one balance, and the reads are
per-client, not per-store, so `X-Client: ghostlight` pools them.

Three reads is not enough for two reviewers. Either mint a separate Android review
account, or give review accounts an unlimited server-side entitlement. The second is
better: it also removes the standing risk that any future Apple resubmission finds
the account already spent and bounces under 2.1.
