# Getting a change onto a phone

Four ways, cheapest first. The one you want depends on **who** is meant to see it,
and the difference between them is not convenience — one of them reaches people who
pay for this app.

## The thing to know first

`runtimeVersion` is `{ "policy": "fingerprint" }`. An over-the-air update only reaches
a build whose fingerprint matches the update's. So before assuming an update will
land, check:

```bash
npx expo-updates fingerprint:generate --platform ios
```

Run it on `main` and on the branch, **in the same working directory with the same
`node_modules`**, and compare the top-level `hash`.

Do not do this with a `git worktree` and a symlinked `node_modules`. The symlink makes
every native-module path resolve absolutely instead of relative to the project, so
`expoAutolinkingConfig` and ~90 module paths all differ and you get a false negative.
Check out the other branch in place instead.

What is actually in the fingerprint: the autolinking configs, `app.json`, `eas.json`,
`.gitignore`, the icon, and `package.json`'s **`scripts` block only**. Not your JS, and
not a dependency that ships no native code — adding `@expo-google-fonts/*` does not
move it.

## 1. Your own simulator or device — seconds

Needs an existing dev build installed.

```bash
npm install
env -u EXPO_NO_DOTENV npm start
```

`env -u EXPO_NO_DOTENV` is not optional. The shell sets `EXPO_NO_DOTENV=1`, which stops
Expo loading `.env`, and `src/lib/supabase.ts` then degrades to a placeholder host —
search returns nothing and it looks like the API broke. See AGENTS.md.

## 2. A few testers, iterating fast — about two minutes a change

Build **once** on the preview profile, then push JS over the air for every change after:

```bash
eas build --profile preview --platform ios   # once
eas update --branch <branch-name> --channel preview
```

This is the right loop for showing a design to actors. It never touches anyone on the
App Store, and as long as the fingerprint has not moved, every tester gets the change on
next launch with no build and no review.

## 3. TestFlight — a real build

```bash
eas build --profile production --platform ios
eas submit --profile production --platform ios --latest
```

`autoIncrement` bumps the build number and `appVersionSource: "remote"` means EAS owns
versioning, so `app.json` needs no edit. Internal testers get it with no beta review;
external testers need a short one. Apple processing is usually 5–30 minutes before it
appears.

Credentials (distribution cert, App Store Connect key) live on EAS from the earlier
submissions, so this runs non-interactively given an `EXPO_TOKEN`.

## 4. `eas update --channel production` — read this before you type it

**This is a release.** The `production` build profile is on channel `production`, which
is the channel the App Store build listens on. An update pushed there reaches every
live user on a matching runtime version, immediately, without going through review.

It is the correct tool for a hotfix you have decided to ship. It is the wrong tool for
showing someone a redesign. Use channel `preview` for that (§2), which is why that
profile exists.
