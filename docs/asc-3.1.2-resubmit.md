# Guideline 3.1.2 — two rejections, two different halves

Submission `e3b85f4e-2856-4de2-ba8e-3e64ae63edfc`, build 1.0.0 (12).

| # | date | clause | what was wrong | where the fix lives |
|---|---|---|---|---|
| 1 | 28 Aug 2026 | 3.1.2 | No Terms of Use link on the product page | Metadata (App Description) |
| 2 | 31 Aug 2026 | 3.1.2(c) | Trial offered without making the charge that follows it clear | The binary (paywall) |

Rejection 1 was automated. Rejection 2 came from a human on an iPad Air 11-inch (M3)
and needs **build 13**. There is no metadata edit that clears it.

## Rejection 1 — cleared

Legal pages, `actorrise` commit `c4c0d1f0`, live since 28 Aug:

- Both docs name Ghost Light: Monologues in scope, not just actorrise.com
- Terms gained an Apple subsection: Apple as seller, the 24-hour auto-renew and charge
  windows, cancel via Settings, deleting the app does not cancel, trial forfeiture,
  refunds via reportaproblem.apple.com
- Privacy splits web (Stripe) from iOS (Apple IAP) and discloses RevenueCat

Terms §5 previously said Stripe took the payment and that you cancel in billing
settings. Neither is true in the app. A reviewer following the link from the product
page landed on a checkout flow that does not exist.

App Description carries, on their own lines:

```
Terms of Use: https://www.actorrise.com/terms
Privacy Policy: https://www.actorrise.com/privacy
```

Keep the labels; bare URLs are what the scanner misses. Do not add prices to the
Description: price belongs in the binary, and a Description price that drifts from
App Store Connect is its own 3.1.2 violation.

## Rejection 2 — what build 12's paywall actually said

> The app offers a free trial or introductory period but does not make it clear that a
> payment will be automatically initiated for the next subscription period.

Build 12 was not silent about price. It was silent about **automatic renewal**, and it
put the wrong number in the largest type:

- Under the button: `Then $29.99 a year. Cancel any time in Settings.` States an amount.
  Never says the charge happens on its own.
- That line shared a fixed-height slot with the error note, so any store failure
  replaced the terms with `Purchase failed.`
- The plan rows printed `$2.50` in 28px Playfair and `billed $29.99 a year` in 12px
  muted. The amount charged was the small number; a derived per-month figure was the
  headline. That is the pricing-prominence pattern 3.1.2(c) exists for.
- The subhead read `(free. cancel anytime.)` with no price attached to the trial.

## What build 13 changes

`app/paywall.tsx`:

1. Subhead now carries the money: `(free, then $29.99 a year.)`. Courier 15px,
   `numberOfLines={1}` — roughly 27 characters clears the 30pt gutters on a 375pt
   screen, so keep it short if you edit it.
2. Plan rows show the billed amount as the big number with `/yr` or `/mo`; the
   per-month equivalent is demoted to the note line.
3. A permanent disclosure under the CTA, no longer sharing a slot with errors:
   trial length, the amount charged after it, that it renews automatically at the same
   price until cancelled, charged to the Apple Account, and the 24-hour cancel window.
4. The Terms of Use / Privacy Policy pair added in `4048995` stays. That is the other
   in-binary half of 3.1.2 and build 12 did not have it either — it was never cited,
   but only because the reviewer stopped at the trial copy.

Both trial and no-trial branches are written, because `trialLabel` is null whenever
RevenueCat reports no introductory offer. Do not let the no-trial branch promise one.

## The build to attach is 1.0.0 (15)

Not 13. Two `eas build` attempts died on the free-plan quota *after* uploading, and
`autoIncrement` had already claimed 13 and 14 by then. The real build is
`61ba6c7d-1b52-40b8-971e-a7e0b710701c`, commit `3dce974`, runtime
`71aa894632…` (the same runtime as build 12, so the production OTA channel still
matches both).

## The reply to App Review

Answer the clause they cited, not the guideline number:

> The subscription purchase flow now states the free trial length and the exact
> amount billed after it in three places: the headline, the plan selector, and a
> permanent disclosure directly beneath the purchase button. That disclosure also
> states that payment is charged to the user's Apple Account at the end of the trial,
> that the subscription renews automatically at the same price until cancelled, and
> how to cancel. The plan selector now shows the amount actually charged ($29.99 per
> year, $4.99 per month) as the primary price rather than the per-month equivalent.
> Terms of Use and Privacy Policy links are also now present on the purchase screen.

## Shipping it

A new build was required; this could not be OTA'd. `app.json` sets
`fallbackToCacheTimeout: 0`, so the app launches from its embedded bundle and applies
an update only on the *following* launch. A reviewer's first launch would still show
build 12's paywall.

When you reply in App Store Connect, say what changed rather than only that something
did: the trial length and the post-trial price now appear together in the headline and
again under the button, with an explicit automatic-renewal statement.
