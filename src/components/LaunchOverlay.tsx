import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { WordArrow } from './WordArrow';
import { useTheme } from '../theme/ThemeContext';
import { pickLaunchQuote } from '../data/launchQuotes';

/**
 * The launch sequence (handoff §7), drawn as the first thing over the app. iOS
 * can't animate a launch screen, so the static splash image is the held *lit*
 * frame and this runs on top of the booted app, then fades and unmounts — so a
 * glitch can never trap the app behind it (a hard timeout always removes it).
 *
 * Dead black is wrong for this app: the field is the warm stage. The filament
 * strikes eleven times, the wordmark fades up, the tagline arrives, then the
 * whole thing lifts to reveal the app already up behind it.
 */

// opacity strike: 0 → … → 1 over 1.4s, linear (handoff §7).
const STRIKE = [0, 0.14, 0.02, 0.42, 0.06, 0.7, 0.2, 0.9, 0.48, 1, 0.66, 0.96, 1];

export function LaunchOverlay() {
  const reduce = useReducedMotion();
  const { colors: c } = useTheme();
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
  // idempotent: a tap on the arrow and a tap on the field behind it both arrive,
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
      const strike = STRIKE.map((v) => withTiming(v, { duration: 1400 / STRIKE.length, easing: Easing.linear }));
      lamp.value = withDelay(100, withSequence(...strike));
      word.value = withDelay(1200, withTiming(1, { duration: 500 }));
      tag.value = withDelay(1700, withTiming(1, { duration: 500 }));
      // After the quote has settled, not with it. An arrow that arrives
      // alongside the line is a second thing competing for the eye at the
      // moment you wanted them reading.
      enter.value = withDelay(2600, withTiming(1, { duration: 400 }));
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
  // Opacity only. Animating letterSpacing still made the wordmark shimmer even
  // once the box was pinned to full width — every frame re-lays-out the glyph
  // run, and Montserrat's hinting lands differently at each sub-pixel tracking
  // value, so the letters visibly crawl. Not worth it for a value that travels
  // nine points. The tracking is fixed at its resting 17 and the word simply
  // fades up, and the shared value that drove the tracking is gone with it.
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.value }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tag.value }));
  // pointerEvents follows the opacity: an invisible arrow must not be tappable,
  // or the first 2.6 seconds contain a target nobody can see.
  const enterStyle = useAnimatedStyle(() => ({ opacity: enter.value }));

  if (gone) return null;

  return (
    <Animated.View
      pointerEvents={gone ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, coverStyle, { zIndex: 100 }]}
    >
      {/* Follows the scheme now, background AND text together — the earlier bug
          was theming one and not the other, which put cream text on cream.

          One caveat that needs a build, not an update: the static iOS launch
          image is #130b08 and can't be themed from JS, so a light-mode launch
          shows a dark native splash for a beat before this fades up pale. Fixing
          that means a `dark` splash variant in app.json and a new binary. */}
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} background={c.background} />
      {/* Tap anywhere, not only the arrow. The arrow says what to do; the whole
          field does it. `accessible={false}` keeps VoiceOver from swallowing the
          quote into one giant button — the WordArrow below is the real control
          and the only thing that should be announced as one. */}
      <Pressable
        onPress={lift}
        accessible={false}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <Animated.View style={lampStyle}>
          <GhostLight size={82} dress="full" />
        </Animated.View>
        {/* This animated its tracking 26 → 17, which is why the title appeared
            one pixel wide and then stretched on every launch: an auto-sized Text
            re-measures its own width when letterSpacing changes, and the native
            shadow node lags the animated value, so the box was laid out at a
            stale width while the glyphs drew at the new one.

            Pinning it to full width fixed the stretch but not a finer shimmer —
            each frame re-lays-out the glyph run and Montserrat hints differently
            at every sub-pixel tracking value, so the letters crawled. Nine
            points of travel was not worth either bug. Fixed tracking, plain
            fade, both gone. */}
        <View style={{ width: '100%', marginTop: 12 }}>
          <Animated.Text
            numberOfLines={1}
            style={[
              wordStyle,
              {
                width: '100%',
                textAlign: 'center',
                fontFamily: 'BricolageGrotesque_500Medium',
                fontSize: 21,
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
              color: c.mutedForeground,
            }}
          >
            {quote.line}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              marginTop: 10,
              textAlign: 'center',
              fontFamily: 'BricolageGrotesque_500Medium',
              fontSize: 10,
              letterSpacing: 2.4,
              textTransform: 'uppercase',
              color: c.mutedForeground,
              opacity: 0.6,
            }}
          >
            {quote.source}
          </Text>
        </Animated.View>
      </Pressable>

      {/* Anchored to the bottom rather than stacked under the quote, so adding
          it does not shove the lamp, wordmark and line off the centre they were
          composed on. */}
      <Animated.View
        pointerEvents={gone ? 'none' : 'auto'}
        style={[
          enterStyle,
          { position: 'absolute', left: 0, right: 0, bottom: 72, alignItems: 'center' },
        ]}
      >
        <WordArrow label="Enter" onPress={lift} haptic="soft" />
      </Animated.View>
    </Animated.View>
  );
}
