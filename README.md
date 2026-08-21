# Ghost Light

An iOS app that helps an actor find a monologue. See `docs/BUILD-SPEC.md`.

## Status: Step 0 — the spike

Twenty hardcoded monologues on a dark stage. No search, no auth, no navigation, no payments.

The spike exists to answer one question, and it is the only genuinely unproven assumption in the
whole project: **does Ghost Light feel right in the hand?** Everything else here is known-solvable.
If the tilt reads as a gimmick or the lit-card scroll feels sluggish, better to know now than in
week six.

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
