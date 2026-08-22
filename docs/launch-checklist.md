# Ghost Light — launch checklist (external setup)

Everything here is stuff only you can do (accounts, keys, dashboards). The app
code is built to these exact names — where something **must match**, it's marked
⚠️. Bundle id is **`com.actorrise.ghostlight`** everywhere.

## 1. App Store Connect — the app record
- [ ] Create the app in App Store Connect, bundle id `com.actorrise.ghostlight`.
- [ ] Capabilities on the App ID: **Sign In with Apple** (the app already sets
      `ios.usesAppleSignIn`; EAS will request the entitlement).
- [ ] Display name / subtitle for ASO later (keep brand "Ghost Light", keyword
      in title/subtitle — e.g. "Ghost Light — Monologues for Actors").

## 2. In-app purchases (the subscriptions)
- [ ] Create an **auto-renewable subscription group** (e.g. "Monologues").
- [ ] Two products in it:
  - Monthly — **$4.99** — product id e.g. `ghostlight_monologues_monthly`
  - Annual — **$29.99** — product id e.g. `ghostlight_monologues_annual`
- [ ] Fill required localization + review screenshot for each (Apple requires it).

## 3. Keys Apple gives you (the "IAP secret" stuff)
RevenueCat needs these to validate purchases and hear renewals:
- [ ] **In-App Purchase key (.p8)** — App Store Connect → Users and Access →
      Integrations → In-App Purchase → generate. Note the Key ID + Issuer ID +
      download the .p8 (one-time). This is the modern StoreKit 2 key.
- [ ] **App-Specific Shared Secret** — App → App Information → copy it (RevenueCat
      may ask for it for legacy receipt validation).
- [ ] **App Store Server Notifications V2** — App → General → App Store Server
      Notifications → paste the URL RevenueCat gives you (Production + Sandbox).

## 4. RevenueCat  ⚠️ names must match the code
- [ ] Add the iOS app (bundle id `com.actorrise.ghostlight`); upload the .p8 +
      shared secret from step 3.
- [ ] Grab the **public SDK key** (`appl_…`) → put it in `.env` as
      `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (replacing the current `test_…` Test Store key).
- [ ] **Entitlement identifier must be exactly `monologues`** (code:
      `src/lib/purchases.ts` → `ENTITLEMENT_ID`). Attach both products to it.
- [ ] **Offering**: make the default offering contain an **Annual** and a
      **Monthly** package (code reads `offering.annual` / `offering.monthly`).
- [ ] **Webhook** → URL `https://api.actorrise.com/api/webhooks/revenuecat`,
      set an **Authorization header value** and put that SAME value in the
      backend env `REVENUECAT_WEBHOOK_AUTH` (code checks it).
- [ ] app_user_id is already set to the Supabase user id by the app — nothing to do.
- [ ] ⚠️ Rotate the `sk_…` secret key you pasted in chat earlier (regenerate it).

## 5. Supabase (project `actorrise`, shared with the web app)
- [ ] **Enable Anonymous sign-ins** (Auth → Sign In / Providers → Anonymous).
      Without this, launch can't mint a session and search/reads/saves stay off.
- [ ] **Apple provider** — configure so native Sign in with Apple validates
      (add the app bundle id to the allowed client IDs).
- [ ] **Google provider** — client id/secret.
- [ ] **Redirect URLs** (Auth → URL Configuration) — add `ghostlight://auth-callback`
      so the Google OAuth round-trip returns to the app.

## 6. Backend (actorrise repo, branch `ghostlight-mobile-backend`)
- [ ] Merge/deploy the branch.
- [ ] Run `backend/scripts/add_monologue_reads_column.sql` against the DB.
- [ ] Run `python backend/scripts/seed_pricing_tiers.py` (adds the Monologues tier).
- [ ] Set env `REVENUECAT_WEBHOOK_AUTH` (matches step 4).
- [ ] (The read-counter endpoint, usage fields, webhook, and server-side wall
      ship with the branch.)

## 7. Build & TestFlight (EAS)
- [ ] `eas build --platform ios` (production profile).
- [ ] `eas submit -p ios` → TestFlight.
- [ ] Test on a real device: tilt spotlight, 3 reads → wall → sandbox purchase →
      entitlement granted → unlimited. Restore on a second device.

## 8. Listing + privacy (needed for review)
- [ ] Icon + splash (from Claude Design → drop into `assets/`).
- [ ] 6.7" screenshots (1290×2796) — can be captured from the app.
- [ ] Privacy Policy + Terms URLs live (app links to `actorrise.com/privacy`
      and `/terms` — confirm those pages exist).
- [ ] App Privacy questionnaire: you collect email (auth), user content
      (saves/notes), identifiers. In-app **account deletion is already built**
      (Account → Delete account) — Apple requires it and it's done.
- [ ] No free trial in v1 (the 3 free reads are the trial).

## Fastest path to a testable build
1. Supabase anonymous toggle (5.1) — unblocks the whole app immediately.
2. Deploy backend (6).
3. RevenueCat app + `appl_` key + entitlement `monologues` + offering (4).
Then a dev build already exercises the full loop end to end.
