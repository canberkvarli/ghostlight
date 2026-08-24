import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { GhostLight } from './GhostLight';
import { StageBackdrop } from './StageBackdrop';
import { colors } from '../theme/tokens';
import { pickLaunchQuote } from '../data/launchQuotes';

/**
 * The launch sequence (handoff §7), drawn as the first thing over the app. iOS
 * can't animate a launch screen, so the static splash image is the held *lit*
 * frame and this runs on top of the booted app, then fades and unmounts — so a
 * glitch can never trap the app behind it (a hard timeout always removes it).
 *
 * Dead black is wrong for this app: the field is the warm stage. The filament
 * strikes eleven times, the wordmark's tracking eases 26 → 17, the tagline
 * arrives, then the whole thing lifts to reveal the app already up behind it.
 */

// opacity strike: 0 → … → 1 over 1.4s, linear (handoff §7).
const STRIKE = [0, 0.14, 0.02, 0.42, 0.06, 0.7, 0.2, 0.9, 0.48, 1, 0.66, 0.96, 1];

export function LaunchOverlay() {
  const reduce = useReducedMotion();
  const [gone, setGone] = useState(false);
  // Picked once per mount, not per render — a re-render mid-fade must not swap
  // the line out from under the reader.
  const [quote] = useState(pickLaunchQuote);

  const cover = useSharedValue(1); // overlay opacity
  const lamp = useSharedValue(reduce ? 1 : 0); // the strike
  const track = useSharedValue(reduce ? 17 : 26); // wordmark tracking
  const word = useSharedValue(reduce ? 1 : 0);
  const tag = useSharedValue(reduce ? 1 : 0);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      // Hold the lit frame briefly, then lift.
      cover.value = withDelay(1900, withTiming(0, { duration: 400 }, (f) => f && runOnJS(setGone)(true)));
      return;
    }
    const strike = STRIKE.map((v) => withTiming(v, { duration: 1400 / STRIKE.length, easing: Easing.linear }));
    lamp.value = withDelay(100, withSequence(...strike));
    word.value = withDelay(1200, withTiming(1, { duration: 500 }));
    track.value = withDelay(1200, withTiming(17, { duration: 1100, easing: Easing.out(Easing.cubic) }));
    tag.value = withDelay(1700, withTiming(1, { duration: 500 }));
    // The lift used to start at 2200ms — the exact millisecond the tagline
    // finished fading in, so the finished frame was never actually seen. Hold it
    // a beat now that there's a line worth reading. A hard fallback still
    // removes the overlay no matter what happens above it.
    cover.value = withDelay(3400, withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) }));
    const t = setTimeout(() => setGone(true), 4000);
    return () => clearTimeout(t);
  }, [reduce, cover, lamp, word, track, tag]);

  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));
  const lampStyle = useAnimatedStyle(() => ({ opacity: lamp.value }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.value, letterSpacing: track.value }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tag.value }));

  if (gone) return null;

  return (
    <Animated.View
      pointerEvents={gone ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, coverStyle, { zIndex: 100 }]}
    >
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={lampStyle}>
          <GhostLight size={82} dress="full" />
        </Animated.View>
        <Animated.Text
          style={[
            wordStyle,
            {
              marginTop: 12,
              fontFamily: 'Montserrat_500Medium',
              fontSize: 21,
              textTransform: 'uppercase',
              color: colors.dark.foreground,
            },
          ]}
        >
          Ghost Light
        </Animated.Text>
        {/* The line is words of the play, so it's Courier; the attribution is
            the app speaking, so it's Montserrat (AGENTS.md, the type rule). */}
        <Animated.View style={[tagStyle, { marginTop: 14, paddingHorizontal: 40 }]}>
          <Text
            numberOfLines={2}
            style={{
              textAlign: 'center',
              fontFamily: 'CourierPrime_400Regular_Italic',
              fontSize: 15,
              lineHeight: 22,
              letterSpacing: 0.5,
              color: colors.dark.mutedForeground,
            }}
          >
            {quote.line}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              marginTop: 10,
              textAlign: 'center',
              fontFamily: 'Montserrat_400Regular',
              fontSize: 10,
              letterSpacing: 2.4,
              textTransform: 'uppercase',
              color: colors.dark.mutedForeground,
              opacity: 0.6,
            }}
          >
            {quote.source}
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}
