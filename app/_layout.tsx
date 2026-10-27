import { useEffect, useMemo } from 'react';
import { AppState, LogBox } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Imported file-by-file rather than from the package root: the root re-exports
// every weight and italic, and Metro will happily ship all ~2MB of them.
// Display and numerals. Instrument Serif ships one weight and its italic, which
// is the whole point of it — the headline voice is the shape of the face, not a
// weight you dial up. It replaces Playfair everywhere.
import InstrumentSerif_400Regular from '@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf';
import InstrumentSerif_400Regular_Italic from '@expo-google-fonts/instrument-serif/400Regular_Italic/InstrumentSerif_400Regular_Italic.ttf';
// The words of the play. Unchanged.
import CourierPrime_400Regular from '@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf';
import CourierPrime_400Regular_Italic from '@expo-google-fonts/courier-prime/400Regular_Italic/CourierPrime_400Regular_Italic.ttf';
import CourierPrime_700Bold from '@expo-google-fonts/courier-prime/700Bold/CourierPrime_700Bold.ttf';
// Everything the app itself says. Replaces Montserrat; 500 is the new body
// weight, so there is no 400 to load.
import BricolageGrotesque_500Medium from '@expo-google-fonts/bricolage-grotesque/500Medium/BricolageGrotesque_500Medium.ttf';
import BricolageGrotesque_600SemiBold from '@expo-google-fonts/bricolage-grotesque/600SemiBold/BricolageGrotesque_600SemiBold.ttf';
import BricolageGrotesque_700Bold from '@expo-google-fonts/bricolage-grotesque/700Bold/BricolageGrotesque_700Bold.ttf';

import '../src/global.css';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { getGuided, getRunStats, getShelf, listRuns, listScenes } from '../src/api/rehearsal';
import { loadRecents } from '../src/lib/recents';
import { markHadAccount } from '../src/lib/demo';
import { ReadingBanner } from '../src/components/ReadingBanner';
import { LaunchOverlay } from '../src/components/LaunchOverlay';
import { SidesInbox } from '../src/components/SidesInbox';
import { bootstrapSession } from '../src/lib/session';
import { supabase } from '../src/lib/supabase';
import { useEntitlement } from '../src/hooks/useEntitlement';
import { configurePurchases } from '../src/lib/purchases';
import { flushAnalytics, identify, initAnalytics, internalName, resetIdentity } from '../src/lib/analytics';
import { BackstageNoteHost } from '../src/components/BackstageNote';
import { recordAppBackground, recordAppOpen } from '../src/lib/reviewMoments';
import { useQuickActionNote } from '../src/hooks/useQuickActionNote';
import { useReminderSync, useReminderTaps } from '../src/hooks/useReminders';
import { clearAllReminders, configureNotifications } from '../src/lib/notifications';
import { clearRecents } from '../src/lib/recents';
import { resetKnocks } from '../src/lib/nudges';
import { KnockNoteHost } from '../src/components/KnockNote';
import { WhatsNewHost } from '../src/components/WhatsNew';
import { useSession } from '../src/lib/useSession';
import { setFavorite } from '../src/api/client';
import { PENDING_KEEP } from '../src/lib/keep';

SplashScreen.preventAutoHideAsync().catch(() => {});

// How a reminder presents while the app is open. Registering, not asking:
// permission is only ever requested on the first audition save.
configureNotifications();

// Before the first screen, so a launch is counted even if someone opens the app
// and closes it again. Silently does nothing when EXPO_PUBLIC_POSTHOG_KEY is
// absent, which is the whole of its behaviour in a dev build without the env.
initAnalytics();

// Known-benign dev noise — keep the stage clean. The RevenueCat notice is
// expected on the Test Store key and vanishes with the production key; the
// animated-value chatter is harmless RN internals.
LogBox.ignoreLogs([
  'Using a Test Store API key',
  'Sending `onAnimatedValueUpdate`',
  // Expected until the App Store products go live / Paid Apps Agreement is active;
  // the paywall falls back to static prices. Not an app bug.
  /Error fetching offering/,
]);

// Queries outlive the process: the book's count, the board, the shelves and
// tonight's pick are written to disk as they arrive and read back before the
// first frame, so a cold start draws the home as it was and then refreshes it,
// instead of drawing it empty and filling it in ten seconds later. Only the
// keys named here are kept; the wall and the signed audio links are not.
const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 24 * 60 * 60 * 1000 } } });
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'ghostlight-queries', throttleTime: 1000 });
/** Answers that are the same for every actor: kept across a sign-out. */
const SHARED = new Set(['guided', 'scenes', 'trending', 'tonight', 'discover', 'catalogue-size', 'screen-shelf']);
const PERSISTED = new Set(['favorites', 'auditions', 'trending', 'screen-shelf', 'tonight', 'discover', 'catalogue-size', 'scripts', 'scenes', 'run-stats', 'guided', 'runs', 'recents-local']);
const persistOptions = {
  persister,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  buster: 'v1',
  dehydrateOptions: {
    shouldDehydrateQuery: (q: { queryKey: readonly unknown[]; state: { status: string } }) =>
      q.state.status === 'success' && PERSISTED.has(String(q.queryKey[0])),
  },
};

// A push that cannot double, for the whole app. `useRouter()` hands every
// screen this one object, so guarding its push here guards all of them: a
// thumb tapping a row twice while the screen is still coming up used to open
// Settings twice. The same destination inside a second is the same tap.
{
  const rawPush = router.push;
  let lastHref = '';
  let lastAt = 0;
  router.push = ((href: Parameters<typeof rawPush>[0], options?: Parameters<typeof rawPush>[1]) => {
    const key = typeof href === 'string' ? href : JSON.stringify(href);
    const now = Date.now();
    if (key === lastHref && now - lastAt < 1000) return;
    lastHref = key;
    lastAt = now;
    return rawPush(href, options);
  }) as typeof rawPush;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    CourierPrime_400Regular,
    CourierPrime_400Regular_Italic,
    CourierPrime_700Bold,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
  });

  useEffect(() => {
    // Never hold the splash hostage to a font that failed to load — cold launch
    // to first result under three seconds is a hard requirement.
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    // The anonymous-first session (spec §4): mint a real user_id silently on
    // first launch, restore it on every launch after. Fire-and-forget — nothing
    // on screen waits for it, and if anonymous sign-ins are disabled server-side
    // the app still runs (see src/lib/session.ts).
    void bootstrapSession().then(() => {
      // Keyed to the Supabase user so the webhook can match app_user_id back to
      // the ActorRise account. Inert until a RevenueCat key is set.
      void configurePurchases();
    });
  }, []);

  useEffect(() => {
    // Signing out has to tear down entitlement state, and nothing did.
    //
    // `['read-wall']` is a plain cache entry, so a paid session's
    // `{is_paid: true}` survived sign-out and the premium filters stayed
    // unlocked. It survived the refetch too: with no session the request 401s,
    // and `retry: false` makes React Query KEEP the last good data on error, so
    // the failure preserved the paid state instead of clearing it.
    //
    // One subscription here rather than per-screen, so every route out of a
    // session is covered — the sign-out button, account deletion, and a token
    // that simply expires.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // Everything that was this account's goes. What is the same for every
        // actor stays, so the room a stranger lands in is already full: the
        // three first scenes, the library, what the house is reading.
        queryClient.removeQueries({ predicate: (q) => !SHARED.has(String(q.queryKey[0])) });
        // Or the next anonymous session inherits the last account's identity and
        // every event it sends is filed under someone who has left the building.
        resetIdentity();
        // The reminders were this account's week; the next sign-in must not
        // get woken up for someone else's audition.
        void clearAllReminders();
        // The pieces opened on this device were this account's reading.
        void clearRecents();
        void resetKnocks();
        // Without a fresh anonymous session every request 401s and the app looks
        // broken rather than signed out.
        void bootstrapSession();
        return;
      }

      // Signing IN needed the same treatment and never got it.
      //
      // Every one of these queries is an answer about a particular identity, and
      // signing in changes the identity. `['read-wall']` has a 15s staleTime, so
      // after a subscriber signed in the search screen went on serving the
      // anonymous session's `is_paid: false` — the marker read "free" until
      // something else happened to force a refetch, which is why opening Account
      // appeared to fix it. Nothing was broken except that nobody had asked
      // again.
      //
      // Invalidate rather than clear: clearing empties the cache and every
      // mounted screen flashes its loading state on the way back. Invalidating
      // keeps what's on screen and quietly replaces it when the new answer
      // lands.
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        // The join key, and the reason `signed_in` looked like it never fired:
        // identify() existed and nothing called it, so every event landed on
        // PostHog's own anonymous id and none of them could be tied to an
        // account — or, once the web reports in, to the same person on a laptop.
        //
        // Anonymous readers stay anonymous. `is_anonymous` is exactly the line
        // the privacy policy draws, so it is the line drawn here.
        //
        // `is_paid` used to be sent from here as a hardcoded false, which was
        // simply untrue for every subscriber who signed in. Entitlement is not
        // known at this point and guessing it is worse than omitting it — the
        // purchase events already say who pays.
        const user = session?.user;
        if (user && !user.is_anonymous) {
          const name = internalName(user.email);
          identify(user.id, name ? { name, is_internal: true } : undefined);
          // A card thrown right on the curtain before there was a book: kept now.
          if (event === 'SIGNED_IN') void keepPending();
        }
        void queryClient.invalidateQueries({ queryKey: ['read-wall'] });
        void queryClient.invalidateQueries({ queryKey: ['favorites'] });
        // The shelves wait for a session (see useTonight); a shelf that asked
        // too early and failed asks again now that there is one.
        void queryClient.invalidateQueries({ queryKey: ['trending'] });
        void queryClient.invalidateQueries({ queryKey: ['screen-shelf'] });
        // A walled monologue withholds its text, so the copy already fetched
        // under the old identity is the wrong one to keep.
        void queryClient.invalidateQueries({ queryKey: ['monologue'] });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Send what is queued the moment the app leaves the foreground.
    //
    // Without this, `flushAt: 20` and a 30s interval mean a single event — a
    // sign-in, a purchase — sits in the buffer until nineteen more join it or
    // half a minute passes. Anyone who signs in and immediately switches apps
    // outruns both. The events are not lost (the SDK persists them and sends on
    // a later launch) but they arrive so late they read as missing, which is
    // exactly how this was found: `Application Opened` from old sessions
    // showing up while a sign-in from thirty seconds ago had not.
    const sub = AppState.addEventListener('change', (state) => {
      // React Query's idea of focus is a browser tab's, which never changes
      // here. Hand it the app's own foreground state, so a query that failed
      // or went stale while the phone was away is asked again the moment the
      // app is back, instead of waiting for a screen to be opened afresh.
      focusManager.setFocused(state === 'active');
      if (state !== 'active') flushAnalytics();
      // Open-days and sessions for the rating moment (src/lib/reviewMoments.ts).
      if (state === 'active') void recordAppOpen();
      else if (state === 'background') recordAppBackground();
    });
    void recordAppOpen();
    return () => sub.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}

/** The piece a stranger threw right on the curtain, saved to the book they just made. */
async function keepPending() {
  try {
    const id = await AsyncStorage.getItem(PENDING_KEEP);
    if (!id) return;
    await AsyncStorage.removeItem(PENDING_KEEP);
    await setFavorite(id, true);
    void queryClient.invalidateQueries({ queryKey: ['favorites'] });
  } catch {
    // The book is reachable from the home; a keep that did not land is a tap away.
  }
}

function Shell() {
  const { colors: c } = useTheme();
  // Mounted here so the offline gate tracks entitlement app-wide, including
  // when a session ends on a screen that never asks about the paywall itself.
  useEntitlement();
  // The home-screen "Before you go…" action opens the note from Canberk.
  useQuickActionNote();
  // Reminders: the week from /api/auditions onto the phone's schedule, and a
  // tapped reminder into the reader.
  const { isAuthenticated, session } = useSession();
  useReminderSync(isAuthenticated, session?.user.id);
  // Remembered, so a sign-out lands on Search and never on the front door again.
  useEffect(() => { if (isAuthenticated) void markHadAccount(); }, [isAuthenticated]);
  // The Scene room is fetched as the app opens, so its shelves are there when the tab is.
  useEffect(() => {
    if (!session) return;
    void queryClient.prefetchQuery({ queryKey: ['guided'], queryFn: ({ signal }) => getGuided(signal), staleTime: 60 * 60_000 });
    void queryClient.prefetchQuery({ queryKey: ['scenes'], queryFn: ({ signal }) => listScenes(signal), staleTime: 10 * 60_000 });
    if (isAuthenticated) void queryClient.prefetchQuery({ queryKey: ['scripts', 'shelf-head'], queryFn: ({ signal }) => getShelf({ limit: 1 }, signal), staleTime: 60_000 });
    // The profile's streak and counts, so it opens whole.
    if (isAuthenticated) {
      void queryClient.prefetchQuery({ queryKey: ['runs'], queryFn: ({ signal }) => listRuns(signal), staleTime: 60_000 });
      void queryClient.prefetchQuery({ queryKey: ['run-stats'], queryFn: ({ signal }) => getRunStats(signal), staleTime: 60_000 });
      void queryClient.prefetchQuery({ queryKey: ['recents-local'], queryFn: loadRecents, staleTime: 30_000 });
    }
  }, [session, isAuthenticated]);
  useReminderTaps();

  /**
   * The navigator's own container colour, and the reason you could see white in
   * the corners on every push.
   *
   * `contentStyle` below paints the *screen*, but during a transition iOS rounds
   * the corners of the moving card and slides it, and for those few hundred
   * milliseconds what shows through underneath is the navigation container's
   * background — which comes from React Navigation's theme, not from ours. The
   * default is `rgb(242, 242, 242)`, near-white, so a dark app flashed pale
   * behind every screen change. Feed it the stage colour instead.
   */
  const navTheme = useMemo(() => {
    const base = c.isLight ? DefaultTheme : DarkTheme;
    return { ...base, colors: { ...base.colors, background: c.background, card: c.background } };
  }, [c.isLight, c.background]);

  return (
    <NavThemeProvider value={navTheme}>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      {/* This was hardcoded `light` on the claim that the stage is always
          warm-dark. It isn't: StageBackdrop falls back to the theme background,
          so in light mode the theatre stage is paper (#f8f4f0) and white clock,
          wifi and battery glyphs vanished into it. Follow the scheme — the
          system draws those glyphs and we never get to restyle them, so the
          only defence is picking the right side. */}
      <StatusBar style={c.isLight ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.background },
        }}
      >
        {/* Results rise and fade up like the lights changing for a new scene,
            rather than sliding in from the side. Read cross-fades, then the
            paper does its curtain rise. */}
        {/* The signed-in app: four tabs, each its own stack (Search, Book, Board, Scene). */}
        <Stack.Screen name="(tabs)" options={{ animation: 'fade', animationDuration: 240 }} />
        <Stack.Screen name="curtain" options={{ animation: 'fade', animationDuration: 320 }} />
        {/* The first scenes: what a stranger meets at the stage door, and a door on the curtain after. */}
        <Stack.Screen name="demo" options={{ animation: 'fade', animationDuration: 320 }} />
        {/* The rehearsal room for a monologue: a sheet over the page; pull it down to come back to the words. */}
        <Stack.Screen name="run/[id]" options={{ presentation: 'modal' }} />
        {/* Auth is a sheet raised over a save (spec §5), not a full push. */}
        <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', gestureEnabled: false }} />
        {/* You comes up from below over whichever room you are in, and goes down again: no room is named on the way back. */}
        <Stack.Screen name="account" options={{ presentation: 'modal' }} />
        <Stack.Screen name="note" options={{ animation: 'fade_from_bottom', animationDuration: 340 }} />
        {/* The audition form is a sheet over the board, like auth over a save. */}
        <Stack.Screen name="audition" options={{ presentation: 'modal' }} />
        {/* Sides coming in: a sheet over the scene room. */}
        <Stack.Screen name="sides" options={{ presentation: 'modal' }} />
        {/* The evening after an audition: how did it go, as a sheet that stops short of the top. */}
        <Stack.Screen name="outcome" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.72], sheetGrabberVisible: true }} />
      </Stack>

      {/* The launch sequence, over the booted app; it fades and unmounts itself. */}
      <LaunchOverlay />
      {/* A file opened into the app from outside goes to the add-sides sheet. */}
      <SidesInbox />

      {/* The note from backstage: rises only after a good moment. */}
      <BackstageNoteHost />
      <KnockNoteHost />
      {/* Once per release, for someone who updated: what is new, and a way to the store. */}
      <WhatsNewHost />
      <ReadingBanner />
    </GestureHandlerRootView>
    </NavThemeProvider>
  );
}
