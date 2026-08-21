import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
import { colors } from '../src/theme/tokens';
import { bootstrapSession } from '../src/lib/session';

SplashScreen.preventAutoHideAsync().catch(() => {});

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
    void bootstrapSession();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.dark.background }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.dark.background },
        }}
      />
    </GestureHandlerRootView>
  );
}
