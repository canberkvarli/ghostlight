# Rejection 3.1.2 — Terms of Use link missing from metadata

Submission `e3b85f4e-2856-4de2-ba8e-3e64ae63edfc`, build 1.0.0 (12), rejected 28 Aug 2026.
Automated check. Metadata only. **The binary is fine. Do not upload a new build for this.**

Apple's rule: an app selling auto-renewable subscriptions must carry a working Terms of Use
link in the metadata that renders on the App Store product page. The only free-text field
that renders there is the App Description, so the link has to live in the description.

## The fix (App Store Connect, 2 minutes)

App Store → 1.0.0 Prepare for Submission → **Description** → paste at the very bottom:

```
Terms of Use: https://www.actorrise.com/terms
Privacy Policy: https://www.actorrise.com/privacy
```

Both verified live, HTTP 200, 28 Aug 2026.

If you would rather not touch the description, the alternative Apple offers is a **custom
EULA**: App Store Connect → App Information → License Agreement → replace the standard
Apple EULA with your own text. That is more work and more to maintain. The description
link is what the automated check looks for and is what almost everyone ships.

Then: **Resubmit to App Review**. The three subscription items are already Ready for
Review and ride along.

## Also fixed, for the next build

The paywall screen had no Terms or Privacy links on it. Only Account did. The metadata
half of 3.1.2 is what the bot caught; the in-app half is what a human reviewer checks,
and it was a live risk of a second rejection on the same guideline.

`app/paywall.tsx` now shows `Terms of Use · Privacy Policy` under Restore purchases.

This does **not** need to ship before resubmitting. It is JS, so it can go out as an OTA
later, or ride the next build. Do not publish an OTA while the app sits in review: the
reviewer's copy fetches on launch and applies on the launch after, so they may well see
the old bundle anyway, and a bad OTA mid-review tanks the whole submission for no gain.
