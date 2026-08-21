# Ghost Light — iOS

An iOS app that does one job: help an actor find a monologue. Search, read, save, prepare.
Not a line-reader or scene-partner app — that is explicitly v2.

**`docs/BUILD-SPEC.md` is the source of truth.** Read it before making structural decisions.
`docs/DESIGN.md` is the why behind it. The build order in spec §5 is deliberate; do not skip ahead.

## Where things are

| path | what |
|---|---|
| `app/index.tsx` | The stage door — reads the onboarding flag and redirects. Renders nothing but dark. |
| `app/onboarding.tsx` | Step 1. Three swipeable, skippable screens. Silent anon session is minted in `_layout`. |
| `app/results.tsx` | Step 0 spike — the results list with tilt + scroll spotlights. |
| `src/components/` | Stage primitives — backdrop, ghost light, cards, stage directions |
| `src/hooks/useStageMotion.ts` | Tilt spotlight. Sensor → shared values, UI thread only. |
| `src/lib/supabase.ts` | The one Supabase client (ActorRise project, AsyncStorage session). |
| `src/lib/session.ts` | Anonymous-first session bootstrap (spec §4). Degrades if anon sign-ins are off. |
| `src/theme/tokens.ts` | Colours for Skia and native props. Mirrors `src/global.css`. |
| `src/theme/layout.ts` | Fixed row geometry the scroll spotlight depends on. |
| `src/data/monologues.ts` | Step 0 fixtures. Replaced by the API in Step 3. |

## Rules that are not style preferences

- **No JavaScript per frame.** Scroll and sensor values are Reanimated shared values read
  directly by Skia and animated styles. If you are calling `setState` on scroll, stop and rewrite it.
- **Fixed row heights.** `src/theme/layout.ts` is why the scroll spotlight needs no measurement.
  Cards clamp their own text to keep that promise. Variable heights break the light.
- **Typewriter is for the words of the play** (Courier Prime); **sans is for everything the app
  itself says** (Montserrat); Playfair is display titles only. Carried exactly from the web app.
- **Never flat black.** The dark background is warm near-black, `#130b08`.
- **Reduced motion is honoured** — flicker off, spotlight frozen centred, every card lit.
- Colours live in two places by necessity (`global.css` for Tailwind, `tokens.ts` for Skia).
  Change one, change the other.

## Stack notes that will waste your afternoon otherwise

- **expo-router v7 does not depend on react-navigation.** Anything from `@react-navigation/*`
  will not work. Ignore older tutorials.
- **Uniwind, not NativeWind.** Tailwind v4 via `withUniwindConfig` in `metro.config.js`.
  Theme tokens are declared in `src/global.css` under `@theme` / `@layer theme`.
- **Uniwind `className` here does colour and type, NOT layout. Use `style` for all structure.**
  Working via `className`: `text-*`, `bg-*` colours, `font-*`, `leading-*`, `tracking-*`,
  `text-center`, `uppercase`, `mt-*`/`mb-*`, `flex-row`, `items-*`, `justify-*`. **Silently dropped:**
  `flex-1` (Tailwind v4 emits `flex: 1 1 0%`, a string RN ignores) and the logical spacing
  utilities `px-*`/`py-*` (Tailwind v4 `padding-inline`/`padding-block`, which don't map to RN's
  `paddingHorizontal`/`Vertical`) — also `w-full`, `h-px`, `gap-*`, `rounded-*`, `border`. Anything
  that decides size, padding, radius or flex-grow must be a real `style={{}}`. `SafeAreaView`,
  `Animated.*` and `FlashList` drop `className` entirely; give them `style` or wrap in a core
  `<View style={{ flex: 1 }}>`. This cost us every screen once — verify layout on the simulator,
  not just in the bundle.
- **`EXPO_NO_DOTENV=1` is set in this shell**, which stops Expo loading `.env` — the Supabase env
  reads empty and the client falls back to a placeholder host. Run Metro/builds with it unset:
  `env -u EXPO_NO_DOTENV npx expo start --dev-client`. `src/lib/supabase.ts` warns and degrades
  rather than crashing when the env is missing, but the fix is to load the env.
- **Reanimated's `Animated.createAnimatedComponent(FlashList)`**, not FlashList's exported
  `AnimatedFlashList` — that one wraps RN's `Animated`, whose scroll handler runs on the JS thread.
- **A development build is required.** Expo Go cannot run Skia, Reanimated worklets or (later) IAP.
  `npm run ios` builds and launches; `npm start` attaches to an existing dev build.
- Google fonts are imported file-by-file, not from the package root — the root re-exports every
  weight and Metro ships all of them.
- `.npmrc` sets `legacy-peer-deps` — expo-router's web deps pull a `react-dom` that disagrees
  with the pinned React. Harmless; do not "fix" it by bumping React.

## Commands

```bash
npm run ios        # native build + simulator
npm start          # dev server against an existing dev build
npm run typecheck  # tsc --noEmit
npx expo export --platform ios   # cheapest full-bundle smoke test
```

## Not in v1

ScenePartner / AI line reading, self-tape recording, Android, social features, a web version.
See spec §6.
