# Rejection 3.1.2 — Terms of Use link missing from metadata

Submission `e3b85f4e-2856-4de2-ba8e-3e64ae63edfc`, build 1.0.0 (12), rejected 28 Aug 2026.
Automated check. Metadata only. **The binary is fine for this issue. Do not upload a new
build to clear it.**

Apple's rule: the four required subscription facts (title, length, price, and functional
links to the privacy policy and Terms of Use) must appear **in the binary**, and the
metadata must additionally carry the privacy policy in the ASC Privacy Policy field and
the Terms of Use in the App Description or the EULA field. The only free-text field that
renders on the product page is the Description, so the link goes there.

## Step 1 — legal pages (DONE, live 28 Aug 2026)

`actorrise` commit `c4c0d1f0`, pushed to `main`, deployed, verified live:

- Both docs now name Ghost Light: Monologues in scope, not just actorrise.com
- Terms gained an Apple subsection: Apple as seller, the 24-hour auto-renew and charge
  windows, cancel via Settings, deleting the app does not cancel, trial forfeiture,
  refunds via reportaproblem.apple.com
- Privacy splits web (Stripe) from iOS (Apple IAP) and discloses RevenueCat
- Both redated August 2026

This mattered because Terms §5 previously said Stripe took the payment and that you
cancel in billing settings. Neither is true in the app. A reviewer following the Terms
link from the product page landed on a checkout flow that does not exist.

## Step 2 — App Description (do this)

App Store → 1.0.0 Prepare for Submission → **Description** → blank line after your last
paragraph, then exactly:

```
Terms of Use: https://www.actorrise.com/terms
Privacy Policy: https://www.actorrise.com/privacy
```

Keep the labels. Bare URLs are what the scanner misses. They render as plain text rather
than tappable links on the product page; that is expected and accepted.

Do **not** add prices to the Description. Price belongs in the binary, and a price in the
Description that drifts from App Store Connect is its own 3.1.2 violation.

Save, reload the page to confirm the edit persisted, leave build 12 attached, then
**Resubmit to App Review**. The three subscription items ride along.

## Known remaining risk

Build 12's paywall has title, length and price but **no legal links**, which is one of
the four in-binary requirements. The bot caught the metadata half; a human checks this
half.

`ghostlight` commit `4048995` adds `Terms of Use · Privacy Policy` under Restore
purchases. It is not in build 12 and cannot be OTA'd into it usefully: `app.json` sets
`fallbackToCacheTimeout: 0`, so the app launches from its embedded bundle and applies an
update only on the following launch. A reviewer's first launch would still show the old
paywall.

Resubmitting on metadata alone is therefore a gamble worth taking (free, fast, and the
automated recheck may clear it), but if it comes back on the in-app links, build 13 is
already written.
