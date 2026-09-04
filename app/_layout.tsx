import { useEffect, useMemo } from 'react';
import { AppState, LogBox } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Imported file-by-file rather than from the package root: the root re-exports
// every weight and italic, and Metro will happily ship all ~2MB of them.
import PlayfairDisplay_600SemiBold from '@expo-google-fonts/playfair-display/600SemiBold/PlayfairDisplay_600SemiBold.ttf';
import PlayfairDisplay_500Medium_Italic from '@expo-google-fonts/playfair-display/500Medium_Italic/PlayfairDisplay_500Medium_Italic.ttf';
import CourierPrime_400Regular from '@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf';
import CourierPrime_400Regular_Italic from '@expo-google-fonts/courier-prime/400Regular_Italic/CourierPrime_400Regular_Italic.ttf';
import CourierPrime_700Bold from '@expo-google-fonts/courier-prime/700Bold/CourierPrime_700Bold.ttf';
import Montserrat_400Regular from '@expo-google-fonts/montserrat/400Regular/Montserrat_400Regular.ttf';
import Montserrat_500Medium from '@expo-google-fonts/montserrat/500Medium/Montserrat_500Medium.ttf';
import Montserrat_600SemiBold from '@expo-google-fonts/montserrat/600SemiBold/Montserrat_600SemiBold.ttf';

import '../src/global.css';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { LaunchOverlay } from '../src/components/LaunchOverlay';
import { bootstrapSession } from '../src/lib/session';
import { supabase } from '../src/lib/supabase';
import { useEntitlement } from '../src/hooks/useEntitlement';
import { configurePurchases } from '../src/lib/purchases';
import { flushAnalytics, identify, initAnalytics, internalName, resetIdentity } from '../src/lib/analytics';

SplashScreen.preventAutoHideAsync().catch(() => {});

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

const queryClient = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_500Medium_Italic,
    CourierPrime_400Regular,
    CourierPrime_400Regular_Italic,
    CourierPrime_700Bold,
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
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
        queryClient.clear();
        // Or the next anonymous session inherits the last account's identity and
        // every event it sends is filed under someone who has left the building.
        resetIdentity();
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
        }
        void queryClient.invalidateQueries({ queryKey: ['read-wall'] });
        void queryClient.invalidateQueries({ queryKey: ['favorites'] });
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
      if (state !== 'active') flushAnalytics();
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function Shell() {
  const { colors: c } = useTheme();
  // Mounted here so the offline gate tracks entitlement app-wide, including
  // when a session ends on a screen that never asks about the paywall itself.
  useEntitlement();

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
        <Stack.Screen name="results" options={{ animation: 'fade_from_bottom', animationDuration: 340 }} />
        <Stack.Screen name="read/[id]" options={{ animation: 'fade', animationDuration: 260 }} />
        {/* Auth is a sheet raised over a save (spec §5), not a full push. */}
        <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', gestureEnabled: false }} />
      </Stack>

      {/* The launch sequence, over the booted app; it fades and unmounts itself. */}
      <LaunchOverlay />
    </GestureHandlerRootView>
    </NavThemeProvider>
  );
}
