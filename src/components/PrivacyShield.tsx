import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { addScreenshotListener } from 'expo-screen-capture';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { GhostLight } from './GhostLight';
import { useTheme } from '../theme/ThemeContext';

/**
 * A privacy blur over the words of the play.
 *
 * Two moments:
 *  - the app leaves the foreground → we blur, so the multitasking / app-switcher
 *    snapshot never shows a monologue (this one genuinely protects the OS
 *    screenshot iOS takes on backgrounding);
 *  - a screenshot is taken → we can't un-take it (iOS gives no pre-capture hook),
 *    but we blur for a beat and ask, as a deterrent.
 *
 * Android already has FLAG_SECURE from usePreventScreenCapture; this is the iOS
 * best-effort layer, and a nice touch on both.
 */
export function PrivacyShield() {
  const { colors: c } = useTheme();
  const [backgrounded, setBackgrounded] = useState(false);
  const [shot, setShot] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setBackgrounded(s !== 'active'));
    const shotSub = addScreenshotListener(() => {
      setShot(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setShot(false), 2200);
    });
    return () => {
      sub.remove();
      shotSub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!backgrounded && !shot) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(320)}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <BlurView intensity={backgrounded ? 60 : 40} tint={c.isLight ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.isLight ? 'rgba(248,244,240,0.4)' : 'rgba(19,11,8,0.4)' }]} />
      {/* Only speak up for an actual screenshot; the app-switcher blur stays quiet. */}
      {shot && !backgrounded ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <GhostLight size={18} />
          <Text
            style={{
              fontFamily: 'CourierPrime_400Regular_Italic',
              fontSize: 15,
              letterSpacing: 0.5,
              color: c.isLight ? '#5a5450' : '#a59d95',
              textAlign: 'center',
              marginTop: 18,
              lineHeight: 22,
            }}
          >
            (the words are for the room,{'\n'}not the feed.)
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}
