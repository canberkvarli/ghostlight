# Ghost Light — payments setup (copy-paste config)

Everything the code already expects, with exact values. Names marked ⚠️ **must
match the code** or entitlements won't grant. Bundle id is
`com.actorrise.ghostlight` everywhere.

Status today: the app plumbing is complete; **no real payments are live** because
the RevenueCat key is still the `test_…` Test Store key and the backend branch
isn't deployed. Work top-to-bottom.

---

## 0. The exact identifiers (pick these, reuse verbatim)

| thing | value | where the code reads it |
|---|---|---|
| Bundle id | `com.actorrise.ghostlight` | `app.json` |
| RevenueCat entitlement | `monologues` ⚠️ | `src/lib/purchases.ts` → `ENTITLEMENT_ID` |
| Offering | the **Current/default** offering | `getCurrentOffering()` |
| Package — annual | RevenueCat **Annual** (`$rc_annual`) | `offering.annual` |
| Package — monthly | RevenueCat **Monthly** (`$rc_monthly`) | `offering.monthly` |
| Product id — monthly | `ghostlight_monologues_monthly` | your choice; must match ASC ↔ RC |
| Product id — annual | `ghostlight_monologues_annual` | your choice; must match ASC ↔ RC |
| Monthly price | **$4.99** | backend seed `monthly_price_cents=499` |
| Annual price | **$29.99** | backend seed `annual_price_cents=2999` |
| Backend tier name | `monologues` ⚠️ | `app/core/seed.py`, granted by webhook |

The two prices in `app/paywall.tsx` are only the static fallback — once the
offering is live, `priceString` comes from RevenueCat.

---

## 1. App Store Connect
1. Create the app: bundle id `com.actorrise.ghostlight`. Enable **Sign In with Apple** on the App ID.
2. Create an **auto-renewable subscription group** (e.g. "Monologues").
3. Add two products in it:
   - `ghostlight_monologues_monthly` — **$4.99/month**
   - `ghostlight_monologues_annual` — **$29.99/year**
4. Fill each product's localization + a review screenshot (Apple requires it).

## 2. Apple keys → RevenueCat
- **In-App Purchase key (.p8)**: Users and Access → Integrations → In-App Purchase → generate. Save Key ID + Issuer ID + the `.p8` (one-time download).
- **App-Specific Shared Secret**: App → App Information → copy.
- **App Store Server Notifications V2**: App → General → paste the URL RevenueCat gives you (Production + Sandbox).

## 3. RevenueCat  ⚠️ names must match §0
1. Add the iOS app (bundle `com.actorrise.ghostlight`); upload the `.p8` + shared secret.
2. **Entitlement** `monologues`. Attach both products to it.
3. Create the two products, put them in the **Current** offering as the **Annual** and **Monthly** packages.
4. Copy the **public SDK key** (`appl_…`) → set in `.env`:
   ```
   EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_XXXXXXXXXXXXXXXX
   ```
   (replaces the current `test_…`). Rebuild the app after changing this.
5. **Webhook**: Integrations → Webhooks →
   - URL: `https://api.actorrise.com/api/webhooks/revenuecat`
   - Authorization header value: paste the secret below **verbatim** (no `Bearer ` prefix — the backend compares the whole header string for equality):
     ```
     baa64facd6161c7986a697255b588ff128424c8581bb12d9
     ```
   - (Regenerate your own with `openssl rand -hex 24` if you prefer; just keep app + backend identical.)
6. `app_user_id` is already set to the Supabase user id by the app → maps onto `users.supabase_id`. Nothing to do.

## 4. Backend deploy (repo `actorrise`, branch `ghostlight-mobile-backend`)
The code is committed. To go live:
1. Merge/deploy `ghostlight-mobile-backend` (Render auto-deploys on push).
2. **Run the migration** against Supabase Postgres (additive, safe, `ADD COLUMN IF NOT EXISTS`):
   ```sql
   ALTER TABLE usage_metrics
     ADD COLUMN IF NOT EXISTS monologue_reads INTEGER NOT NULL DEFAULT 0;
   ```
3. **Seed the tier** (idempotent upsert — existing tiers untouched):
   ```
   python backend/scripts/seed_pricing_tiers.py
   ```
4. Set the backend env on Render:
   ```
   REVENUECAT_WEBHOOK_AUTH=baa64facd6161c7986a697255b588ff128424c8581bb12d9
   ```
   ⚠️ If this is unset the webhook still **processes unauthenticated** (it only
   logs a warning) — anyone could POST to grant entitlements. Set it before launch.

### ⚠️ Deploy risk found in the audit
`render.yaml` on the branch has **uncommitted** changes: it removes the
`databases:` block (Postgres is in Supabase, not Render) and bumps the web plan
`free → starter`. If you deploy via **Render Blueprint** before committing these,
a blueprint sync could **re-provision a Render Postgres**, repoint `DATABASE_URL`
at an empty DB, and/or **downgrade the API to `free`** (sleeps after 15 min idle).
Commit `render.yaml` first, or deploy by pushing the branch to the existing
service rather than a fresh blueprint.

## 5. Supabase (project `actorrise`, `ppvqmbzuqvzpiuqaiqfy`)
- **Enable Anonymous sign-ins** (Auth → Providers → Anonymous). Without it there's
  no session, so reads/saves/the read-counter don't work at all.
- Configure **Apple** and **Google** providers; add redirect `ghostlight://auth-callback`.

## 6. Security
- **Rotate the `sk_…` RevenueCat secret key** pasted in chat earlier — treat it as compromised.
- Consider re-enabling **RLS** on `monologues` / `plays` / `film_tv_references`
  (currently off) — full monologue text is publicly readable via the anon key,
  which is a paywall bypass at the data layer. Ghost Light's Film & TV listing
  reads these directly (`src/lib/screen.ts`); if you lock them down, that path
  needs a policy or a server endpoint.

## Fastest path to a real sandbox purchase
1. Supabase anonymous toggle (§5).
2. Deploy backend + migration + seed + webhook-auth env (§4).
3. RevenueCat app + `appl_` key + entitlement `monologues` + offering (§3).
4. Rebuild the app with the new key → 3 reads → wall → sandbox purchase → entitlement → unlimited. Restore on a second device.
