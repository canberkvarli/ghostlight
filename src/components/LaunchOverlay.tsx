import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Canvas, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { GhostLight } from './GhostLight';
import { StageBackdrop } from './StageBackdrop';
import { useTheme } from '../theme/ThemeContext';
import { pickLaunchQuote } from '../data/launchQuotes';

/**
 * The launch sequence, drawn as the first thing over the app. iOS can't animate
 * a launch screen, so the static splash image is the held *lit* frame and this
 * runs on top of the booted app, then fades and unmounts — a glitch can never
 * trap the app behind it (a hard timeout always removes it).
 *
 * Dead black is wrong for this app: the field is the warm stage. The filament
 * strikes eleven times, the wordmark fades up and then withdraws, the quote
 * arrives and stays, then the whole thing lifts to reveal the app already up
 * behind it.
 *
 * ## What v2 changed, and what it deliberately did not
 *
 * The mechanism is untouched: the eleven-step ramp over 1.4s, the wordmark in at
 * 1.2s and out at 2.6s, the quote at 1.7s, the hint at 2.6s, `lift` idempotent,
 * tap-anywhere, and both safety nets. Every one of those is load-bearing and
 * none of them is a style decision.
 *
 * What changed is the dressing. The lamp is the full standing fixture at 110
 * rather than 82, because this is the one screen where the ghost light is the
 * subject rather than a mark — and it is still the Skia `GhostLight`, never
 * `assets/icon.png`, which is an opaque raster with its own dark field and
 * shows as a lightened square on the stage. The line becomes Instrument Serif
 * italic, because it is the words of a play and the serif is what this system
 * sets those in. The Enter pill came and went; the tap-anywhere hint says it alone.
 */

// opacity strike: 0 → … → 1 over 1.4s, linear.
const STRIKE = [0, 0.14, 0.02, 0.42, 0.06, 0.7, 0.2, 0.9, 0.48, 1, 0.66, 0.96, 1];

/** The standing lamp, at the size that reads as a fixture rather than a bulb. */
const LAMP_SIZE = 110;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function LaunchOverlay() {
  const reduce = useReducedMotion();
  const { colors: c } = useTheme();
  const { width, height } = useWindowDimensions();
  const [gone, setGone] = useState(false);
  // Picked once per mount, not per render — a re-render mid-fade must not swap
  // the line out from under the reader.
  const [quote] = useState(pickLaunchQuote);

  const cover = useSharedValue(1); // overlay opacity
  const lamp = useSharedValue(reduce ? 1 : 0); // the strike
  const word = useSharedValue(reduce ? 1 : 0);
  const tag = useSharedValue(reduce ? 1 : 0);
  const enter = useSharedValue(reduce ? 1 : 0);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  // The overlay used to lift on a timer: the quote landed at 2200ms and the
  // cover started fading at 3400ms, so the line was legible for about a second
  // — long enough to notice, not long enough to read. It now waits for you.
  //
  // Waiting is the whole point, so `lift` is the only way out and it is
  // idempotent: a tap on the pill and a tap on the field behind it both arrive,
  // and the second must not restart the fade half way through the first.
  const lifted = useRef(false);
  const lift = useCallback(() => {
    if (lifted.current) return;
    lifted.current = true;
    cover.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) }, (f) => {
      if (f) runOnJS(setGone)(true);
    });
  }, [cover]);

  useEffect(() => {
    if (!reduce) {
      const strike = STRIKE.map((v) =>
        withTiming(v, { duration: 1400 / STRIKE.length, easing: Easing.linear }),
      );
      lamp.value = withDelay(100, withSequence(...strike));
      // In, held, out. The wordmark says the app's name and then gets out of the
      // way, because the quote is the thing this screen exists to make you read
      // and two pieces of centred type competing is one too many. It leaves at
      // 2600, exactly as the invitation arrives: the name steps aside and the
      // invitation steps in, rather than both sitting there at once.
      //
      // The 900ms hold is the whole point of the sequence. Anything shorter and
      // the name is a flicker you are not sure you saw.
      word.value = withDelay(
        1200,
        withSequence(
          withTiming(1, { duration: 500 }),
          withDelay(900, withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) })),
        ),
      );
      tag.value = withDelay(1700, withTiming(1, { duration: 500 }));
      // After the quote has settled, not with it. A button that arrives
      // alongside the line is a second thing competing for the eye at the
      // moment you wanted them reading.
      // Then it breathes, slowly, so a still screen still says it is waiting
      // for you rather than stuck.
      enter.value = withDelay(
        2600,
        withSequence(
          withTiming(1, { duration: 600 }),
          withRepeat(
            withSequence(
              withTiming(0.4, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
              withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
            ),
            -1,
          ),
        ),
      );
    }

    // Two nets, because this overlay sits on top of everything and a launch
    // screen that will not lift is an app that will not open. The first lifts it
    // properly if nobody ever taps; the second tears it out even if the
    // animation callback never fires. Twelve seconds is far past anyone's
    // patience and far short of a reviewer deciding the app is broken.
    const idle = setTimeout(lift, 12000);
    const hard = setTimeout(() => setGone(true), 13000);
    return () => {
      clearTimeout(idle);
      clearTimeout(hard);
    };
  }, [reduce, lamp, word, tag, enter, lift]);

  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));
  const lampStyle = useAnimatedStyle(() => ({ opacity: lamp.value }));
  // Opacity only. Animating letterSpacing made the wordmark shimmer even once
  // the box was pinned to full width — every frame re-lays-out the glyph run and
  // the hinting lands differently at each sub-pixel tracking value, so the
  // letters visibly crawl. The tracking is fixed at its resting 17 and the word
  // simply fades up.
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.value }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tag.value }));
  // pointerEvents follows the opacity: an invisible button must not be tappable,
  // or the first 2.6 seconds contain a target nobody can see.
  const enterStyle = useAnimatedStyle(() => ({ opacity: enter.value }));

  /**
   * The wash behind the lamp — a wide warm field that comes up WITH the strike,
   * 0.06 while the filament is fighting and 0.20 once it holds. It is what stops
   * the 110pt fixture looking pasted onto a flat rectangle; the halo lights the
   * lamp, this lights the room.
   *
   * Skia rather than a View because it is a radial gradient, which React Native
   * has no way to draw, and it reads the strike value straight off the UI thread.
   */
  const washOpacity = useDerivedValue(() => 0.06 + lamp.value * 0.14);

  if (gone) return null;

  return (
    <Animated.View
      pointerEvents={gone ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, coverStyle, { zIndex: 100 }]}
    >
      {/* Follows the scheme, background AND text together — the earlier bug was
          theming one and not the other, which put cream text on cream.

          One caveat that needs a build, not an update: the static iOS launch
          image is #130b08 and can't be themed from JS, so a light-mode launch
          shows a dark native splash for a beat before this fades up pale. */}
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} background={c.background} />

      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Rect x={0} y={0} width={width} height={height} opacity={washOpacity}>
          <RadialGradient
            c={vec(width * 0.5, height * 0.38)}
            r={width * 0.56}
            colors={['#e0731f', 'rgba(224, 115, 31, 0)']}
            positions={[0, 1]}
          />
        </Rect>
      </Canvas>

      {/* Tap anywhere. `accessible={false}` keeps VoiceOver from swallowing the
          quote into one giant button; the hint at the foot is the real control
          and the only thing that should be announced as one. */}
      <Pressable
        onPress={lift}
        accessible={false}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <Animated.View style={lampStyle}>
          <GhostLight size={LAMP_SIZE} dress="full" />
        </Animated.View>

        {/* The box keeps its height after the word fades out. Collapsing it would
            slide the quote upward at the exact moment someone started reading it,
            and stillness is what this screen is for. The ~50pt left behind reads
            as air between the lamp and the line, not as a hole. */}
        <View style={{ width: '100%', marginTop: 10 }}>
          <Animated.Text
            numberOfLines={1}
            style={[
              wordStyle,
              {
                width: '100%',
                textAlign: 'center',
                fontFamily: 'BricolageGrotesque_600SemiBold',
                fontSize: 17,
                letterSpacing: 17,
                // Tracking is applied to the trailing edge too, so a centred
                // line with 17pt of it sits 17pt right of true centre.
                paddingLeft: 17,
                textTransform: 'uppercase',
                color: c.foreground,
              },
            ]}
          >
            Ghost Light
          </Animated.Text>
        </View>

        {/* The line is the words of a play, so it takes the serif and the curly
            quotes; the attribution is the app speaking, so it stays Courier,
            tracked, between two hairlines.

            The block's height is fixed at three lines' worth. The quotes run
            from four words to ten, and without this the lamp above it would sit
            at a different height on every launch. */}
        <Animated.View
          style={[tagStyle, { marginTop: 24, height: 124, paddingHorizontal: 36, alignItems: 'center' }]}
        >
          <Text
            numberOfLines={3}
            style={{
              maxWidth: 300,
              textAlign: 'center',
              fontFamily: 'InstrumentSerif_400Regular_Italic',
              fontSize: 26,
              lineHeight: 31,
              letterSpacing: -0.3,
              color: c.foreground,
            }}
          >
            {`“${quote.line}”`}
          </Text>
          <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 18, height: 1, backgroundColor: c.stageLine }} />
            {/* "The Importance of Being Earnest" is 31 characters, and at 11pt
                Courier tracked to 2.2 that is 273pt against the 247 a 375pt
                phone leaves once the two hairlines and the gutters have taken
                theirs. It shrinks rather than losing the end of the title —
                safe here because it is one line, so there is no second line to
                end up a different size from. */}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              style={{
                flexShrink: 1,
                fontFamily: 'CourierPrime_400Regular',
                fontSize: 11,
                letterSpacing: 2.2,
                textTransform: 'uppercase',
                color: c.mutedForeground,
              }}
            >
              {quote.source}
            </Text>
            <View style={{ width: 18, height: 1, backgroundColor: c.stageLine }} />
          </View>
        </Animated.View>
      </Pressable>

      {/* The only invitation, and a quiet one. There used to be an Enter pill
          above it saying the same thing louder; two ways of saying "go on" on a
          screen that exists to be still was one too many. It is a real button
          for VoiceOver, since the field behind it is hidden from it. */}
      <AnimatedPressable
        onPress={lift}
        hitSlop={20}
        accessibilityRole="button"
        accessibilityLabel="Enter Ghost Light"
        pointerEvents={gone ? 'none' : 'auto'}
        style={[enterStyle, { position: 'absolute', left: 0, right: 0, bottom: 44, alignItems: 'center' }]}
      >
        <Text
          style={{
            fontFamily: 'CourierPrime_400Regular_Italic',
            fontSize: 13,
            letterSpacing: 0.8,
            color: c.mutedForeground,
          }}
        >
          (tap anywhere.)
        </Text>
      </AnimatedPressable>
    </Animated.View>
  );
}
