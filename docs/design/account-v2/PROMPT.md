# Prompt for Claude Code — Ghost Light account, settings, signed out, paywall

Put this folder at `docs/design/account-v2/` in the repo, then paste everything below the line into Claude Code.

---

Implement the account redesign in `docs/design/account-v2/`. The screens are in `screens/*.png` (390×844 at @3x). `reference.dc.html` is the source mock; open it in a browser and read its inline styles for exact sizes.

**The layout and hierarchy are final. The data shown in the mocks is not.** Prices, trial length, the free-read limit, the reset day, the monologue count and the version number are placeholders. Read the real values from the codebase (RevenueCat/StoreKit offerings, the free-tier limit logic, the existing copy constants) and use those everywhere. Never hard-code a number from the mock. If a value doesn't exist in code yet, ask me.

Keep the existing dark theme tokens, fonts, the yellow offset-shadow card, Courier stage directions and the pill-with-yellow-arrow-circle button. Don't add new fonts or colours. The mock uses Instrument Serif as a stand-in; use the app's real display serif.

## Before writing code

Map the current account screen: every block on it, which component renders it, and where each action goes. Give me the plan, then wait for my go-ahead.

## 1. You (`2a` free, `2b` subscribed)

The account screen becomes **You**. It has three blocks and nothing else:

1. **Header**: a 64pt avatar with the initial, the name in the display serif (30pt, last name italic in orange, `nowrap`), and a Courier subline. A gear icon top-right pushes Settings.
   - Free: orange ring avatar, subline `(actor. since {month joined}.)`.
   - Subscribed: amber-filled avatar with a soft glow, subline `(the whole stage.)`.
2. **YOU PLAY**: the actor's casting profile as Courier chips (gender, playing age range, type, period), with "Edit" on the right. Under the chips: "Search starts here unless you change it." These values become the **default search filters**. If no casting profile exists yet, add the model and an edit sheet that reuses the existing filter chip options.
3. **Stats**: one row, three columns split by hairlines: kept, read, scenes run. Use real counts.
4. **Plan card**:
   - Free (`2a`): yellow offset shadow, "FREE PLAN", the reset hint in Courier, a big number for free reads left plus "free read(s) left", a segmented meter (one segment per free read, used segments dimmed), and "Read without limits →", which opens the paywall. Use the real limit and reset rule.
   - Subscribed (`2b`): no shadow, no pitch. It shows the plan name (Annual or Monthly), "Renews {date}", the price in Courier, and "Manage ›", which opens Apple's manage-subscriptions sheet.

Remove from this screen: the greeting headline, the email row, the appearance picker, the list rows, the maker note and the socials. They move to Settings.

## 2. Settings (`2c`)

Pushed from the gear, with back labelled "‹ You".
- **APPEARANCE**: one segmented control (System / Dark / Light), with a yellow fill on the active option.
- **ACCOUNT**: Subscription (status in orange), Email & sign-in (masked email; Delete account goes inside this row's detail screen), Audition reminders (On/Off).
- **GHOST LIGHT**: Help & legal, What is ActorRise?, Rate Ghost Light.
- Maker row: an initial avatar, "(from the maker.)", one short line, and Instagram and Email circle buttons. Reuse the existing links.
- At the bottom: "Sign out" as plain orange text on the left, and the real app version in Courier on the right. Add a confirm alert before signing out.

## 3. Signed out (`2d`)

What You shows when there's no session:
- The 3a bulb mark with a soft glow, "Take a seat." (with "seat." italic in orange), and "(sign in to keep what you find.)".
- **Sign in with Apple** in a white pill, first. Use the native `AppleAuthenticationButton` if it's already in use. Below it, "Continue with email" in an outline pill. Both reuse the existing auth flows.
- Three orange-dot lines: Save monologues to your book · Track your auditions · Run scenes with a partner.
- Footer: "(search is free, no account needed.)"
- The gear stays visible so settings like Appearance work while signed out.

## 4. Paywall (`2e`)

- Top row: "Restore" on the left (it runs restore purchases), ✕ on the right.
- The bulb mark, "The whole stage.", then Courier `({real monologue count, e.g. 14,000+} monologues. no limits.)`. Fix the current bug that renders "all 1".
- **Trial timeline**, three steps with a vertical connector: Today (everything unlocks), Day N−2 (we remind you), Day N (your plan starts, cancel before and pay nothing). Derive N from the real trial length in the offering. If the offering has no trial, hide the timeline and change the CTA.
- **Plan picker**: Yearly (selected by default: yellow offset shadow, orange border, filled radio, a trial label in Courier, the price plus a per-month breakdown computed from the real price) and Monthly (outline, real price). Show only the packages the offering actually returns.
- CTA: "Start the free week" (copy follows the real trial length), as the pill with the yellow arrow circle. Then one line of legal text with the real renewal price, plus Terms and Privacy links.
- **Trial reminder**: when a trial starts, schedule a local notification for 2 days before it ends. Apple doesn't send this. If notification permission is denied, drop the reminder step from the timeline instead of promising it.

## Done when

- No hard-coded prices, counts, limits or dates. Everything comes from the store, the backend or the constants.
- You renders all three states (free, subscribed, signed out) from real auth and entitlement state.
- Typecheck and lint pass, and you list every file changed plus any value you had to ask about.
