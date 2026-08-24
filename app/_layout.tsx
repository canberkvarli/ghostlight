import { useEffect } from 'react';
import { LogBox } from 'react-native';
import { Stack } from 'expo-router';
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
import { configurePurchases } from '../src/lib/purchases';

SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const { colors: c, scheme } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
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
  );
}
