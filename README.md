# Ghost Light

An iOS app that helps an actor find a monologue. See `docs/BUILD-SPEC.md`.

## Status

| step | what | state |
|---|---|---|
| 0 | Results spike — dark stage, tilt + scroll spotlights, 20 fixtures | built |
| 1 | Onboarding — 3 swipeable screens, silent anon session | built |
| 2 | Search home — hero field, stage-direction filter chips | built |
| 3 | Live results wired to `/api/monologues/search` | **blocked** — search needs auth (see below) |
| 4 | Read — light paper canvas, "lights up" | built |
| 5 | Auth on first save (Apple / Google) | not started |
| 6 | Saves & prep (offline sqlite) | not started |
| 7 | Paywall (RevenueCat) | not started — build last |

Everything built typechecks (`npm run typecheck`) and bundles (`npx expo export --platform ios`).
Nothing yet validated on a device — see below.

### Two things need you

1. **The in-hand feel test (Step 0).** The tilt spotlight has no accelerometer in the simulator and
   60fps in a sim means nothing. Run on your phone and judge whether the tilt reads as a stage light
   and the lit-card scroll feels like looking, not scanning. This is the one unproven assumption the
   whole product rests on. `npx expo run:ios --device`.
2. **Enable anonymous sign-ins on Supabase.** Dashboard → project `actorrise` → Authentication →
   Sign In / Providers → Anonymous → on. Verified disabled today (`anonymous_provider_disabled`).
   Until it's on, the silent session doesn't mint and live search stays 401 — so Step 3 waits on it.
   The app degrades gracefully in the meantime (runs session-less, results screen shows fixtures).

### Run it

```bash
npm install
npm run ios      # builds a dev client and launches the simulator
```

Expo Go will not work — Skia and Reanimated worklets need custom native code, and IAP will need it
later regardless.

**Judge this on a real device.** The tilt spotlight does not exist in the simulator (no
accelerometer) and 60fps in a simulator means nothing.

```bash
npx expo run:ios --device        # pick your phone from the list
```

### What to look for

- Tilt the phone. Does the light on the back wall read as a lamp in a room, or as a parallax
  effect? It should feel like the phone is a window, not a gyroscope demo.
- Scroll slowly. The card at the focus point lights; its neighbours fall toward stage dark but
  stay readable. You should be able to read the two Courier lines of an unlit card without
  fighting for it.
- Scroll fast, then flick. No stutter, no lag between the scroll and the light.
- The haptic ticks once per card as the light moves. Too much? Too little?
- Turn on Settings → Accessibility → Motion → Reduce Motion. The bulb stops flickering, the
  spotlight freezes centred, every card is lit. Nothing should feel broken — just still.

### What it is not

Not a swipeable card deck. Actors judge a monologue by reading it, so the text is the point and it
stays legible. Not a demo of Skia. The light is emphasis; the words are the product.

## Next

Step 1 (onboarding) does not start until Step 0 feels good. The build order in spec §5 is
deliberate.
