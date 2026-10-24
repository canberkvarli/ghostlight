import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { BlurView } from 'expo-blur';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ANDROID_BLUR } from './PaywallShroud';
import { MonologueText } from './MonologueText';
import { PaperCard } from './PaperCard';
import { PrimaryPill } from './PrimaryPill';
import { Sketch } from './Sketches';
import { PRIVACY_URL, TERMS_URL, useTrialOffer } from '../hooks/useTrialOffer';
import { hardShadow } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

/**
 * The wall, inline (spec §5, Step 7). Two lines stay sharp, then the speech
 * goes out of focus and the offer floats over it on its own lit card.
 *
 * The card IS the paywall. One line says what the trial is and what follows
 * it, one button starts it, and the page you were reading opens where you
 * stood the moment the sheet closes. There is no second screen to go to and
 * come back from. The other plan is one tap under the button; the terms Apple
 * asks for are in small print under that, with restore and the two policies.
 *
 * The blurred words are texture, not the play. Behind `paywalled: true` the API
 * sends only the opening, so the "rest" is that opening repeated until it fills
 * the space. Blurred past reading, it looks like a page of speech, and nothing
 * the actor hasn't paid for is ever on the device.
 *
 * The blur is in place from the first frame. Only the group's opacity animates,
 * so there is never a beat of sharp text under a blur that hasn't arrived yet.
 */

/** How much blurred page sits under the offer. Tall enough for the card and its small print. */
const GHOST_LINES = 16;
/** How many lines of the opening stay sharp. The offer has to be on the first screen, however long the first speech runs. */
const SHARP_LINES = 5;
const RISE_MS = 520;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

function paperAlpha(paper: string, a: number): string {
  const n = parseInt(paper.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function ghostOf(text: string): string {
  const words = text.replace(/\s+/g, ' ').trim();
  if (!words) return '';
  // Enough copies to overflow GHOST_LINES at any phone width; the box clips.
  return Array.from({ length: 12 }, () => words).join(' ');
}

export function ReadWall({
  visible,
  rest,
  lineHeight,
  fontSize,
  width,
  accent,
}: {
  /** The first two lines, shown sharp. */
  visible: string;
  /** Whatever the server sent past those lines; the ghost is built from it. */
  rest: string;
  lineHeight: number;
  fontSize: number;
  width: number;
  /** Ink accent on paper for the current medium. */
  accent: string;
}) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const router = useRouter();
  const ghostH = lineHeight * GHOST_LINES;

  // The page unlocks itself: the offer seeds the read state and the words
  // arrive where the wall was. Nothing to close.
  const offer = useTrialOffer({
    from: 'wall',
    onDone: () => {},
    onSignIn: () => router.push('/auth'),
  });

  const fade = useSharedValue(reduce ? 1 : 0);
  const rise = useSharedValue(reduce ? 0 : 28);
  const card = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    fade.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
    rise.value = withDelay(180, withTiming(0, { duration: RISE_MS, easing: EASE }));
    card.value = withDelay(180, withTiming(1, { duration: RISE_MS, easing: EASE }));
  }, [reduce, fade, rise, card]);

  const ghostStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: card.value,
    transform: [{ translateY: rise.value }, { scale: 0.96 + card.value * 0.04 }],
  }));

  const other = offer.plan === 'annual' ? 'monthly' : 'annual';
  const otherLine = offer.plan === 'annual' ? `or ${offer.monthlyBilled} a month` : `or ${offer.annualBilled} a year`;
  const line = offer.storeDown
    ? '(the app store is out of reach. try again in a moment.)'
    : offer.trialLabel
      ? `(free for ${offer.trialLabel}, then ${offer.billed} ${offer.cadence}.)`
      : `(${offer.billed} ${offer.cadence}. cancel any time.)`;

  const small = {
    fontFamily: 'BricolageGrotesque_500Medium',
    fontSize: 11,
    lineHeight: 16,
    color: c.paperMuted,
  } as const;

  return (
    <View>
      <View style={{ maxHeight: lineHeight * SHARP_LINES, overflow: 'hidden' }}>
        <MonologueText body={visible} lineHeight={lineHeight} fontSize={fontSize} />
      </View>

      <View style={{ height: ghostH, marginTop: 2, overflow: 'hidden' }}>
        <Animated.View style={[StyleSheet.absoluteFill, ghostStyle]} pointerEvents="none">
          <MonologueText body={ghostOf(rest || visible)} lineHeight={lineHeight} fontSize={fontSize} />
          {/* Stepped blurs, so the first blurred line has no hard focus seam. */}
          <BlurView
            intensity={14}
            tint="light"
            experimentalBlurMethod={ANDROID_BLUR}
            style={StyleSheet.absoluteFill}
          />
          <BlurView
            intensity={46}
            tint="light"
            experimentalBlurMethod={ANDROID_BLUR}
            style={{ position: 'absolute', top: lineHeight * 0.6, left: 0, right: 0, bottom: 0 }}
          />
          {/* The page fades back to paper at the foot so the block has no edge. */}
          <Canvas style={StyleSheet.absoluteFill}>
            <Rect x={0} y={0} width={width} height={ghostH}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, ghostH)}
                colors={[paperAlpha(c.paper, 0), paperAlpha(c.paper, 0.15), paperAlpha(c.paper, 0.55), paperAlpha(c.paper, 1)]}
                positions={[0, 0.3, 0.75, 1]}
              />
            </Rect>
          </Canvas>
        </Animated.View>

        <Animated.View
          style={[
            // On the words themselves, just under the sharp lines: the title and
            // the scene note above stay readable as the taste, and the card
            // takes no more page than it must.
            { position: 'absolute', left: 0, right: hardShadow.offsetSmall, top: lineHeight * 0.4 },
            cardStyle,
          ]}
        >
          <PaperCard shadow={hardShadow.offsetSmall} style={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 14 }}>
            <View style={{ alignItems: 'center' }}>
              <Sketch name="stageDoor" size={48} stroke={c.paperInk} accent={accent} weight={1.9} />
              <Text
                style={{
                  marginTop: 10,
                  fontFamily: 'InstrumentSerif_400Regular',
                  fontSize: 26,
                  // "is waiting." hangs a g off the second line; 31 keeps it.
                  lineHeight: 31,
                  textAlign: 'center',
                  color: c.paperInk,
                }}
              >
                The rest of it{'\n'}
                <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: accent }}>is waiting.</Text>
              </Text>
              {/* The 3.1.2(c) line: the trial and the charge after it travel
                  together, in the sentence under the headline, not only in the
                  small print. It shrinks before it truncates: a currency string
                  cut in half is worse than a smaller one. */}
              <Animated.Text
                key={line}
                entering={FadeIn.duration(220)}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{
                  marginTop: 8,
                  fontFamily: 'CourierPrime_400Regular_Italic',
                  fontSize: 13,
                  letterSpacing: 0.8,
                  textAlign: 'center',
                  color: c.paperMuted,
                }}
              >
                {line}
              </Animated.Text>

              {offer.busy ? (
                <ActivityIndicator color={accent} style={{ height: 50, marginTop: 16 }} />
              ) : offer.storeDown ? (
                <PrimaryPill label="Try again" haptic="medium" height={50} block onPress={offer.retry} style={{ marginTop: 16 }} />
              ) : (
                <PrimaryPill
                  label={offer.trialLabel ? 'Start the trial' : 'Unlock everything'}
                  haptic="medium"
                  height={50}
                  block
                  onPress={() => void offer.buy()}
                  style={{ marginTop: 16 }}
                />
              )}

              {/* The other plan, one tap, in the same voice as the line above. */}
              {!offer.storeDown ? (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    offer.setPlan(other);
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${other}`}
                  style={{ paddingVertical: 10 }}
                >
                  <Animated.Text
                    key={otherLine}
                    entering={FadeIn.duration(220)}
                    style={{
                      fontFamily: 'CourierPrime_400Regular_Italic',
                      fontSize: 13,
                      letterSpacing: 0.6,
                      color: c.paperMuted,
                      textDecorationLine: 'underline',
                      textDecorationColor: c.paperFaint,
                    }}
                  >
                    {otherLine}
                  </Animated.Text>
                </Pressable>
              ) : null}

              {offer.note ? (
                <Text style={[small, { marginTop: 4, textAlign: 'center' }]}>{offer.note}</Text>
              ) : null}
            </View>

            {/* The disclosure, never conditional while something is for sale:
                length, the amount after, and that it renews on its own. Left
                aligned, small, under everything, where fine print belongs. */}
            {!offer.storeDown ? <Text style={[small, { marginTop: 6 }]}>{offer.terms}</Text> : null}

            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Pressable onPress={() => void offer.onRestore()} hitSlop={8} accessibilityRole="button">
                {offer.restoring ? (
                  <ActivityIndicator size="small" color={c.paperMuted} />
                ) : (
                  <Text style={small}>Restore purchases</Text>
                )}
              </Pressable>
              <Text style={small}>·</Text>
              <Pressable onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} hitSlop={8} accessibilityRole="link">
                <Text style={small}>Terms</Text>
              </Pressable>
              <Text style={small}>·</Text>
              <Pressable onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} hitSlop={8} accessibilityRole="link">
                <Text style={small}>Privacy</Text>
              </Pressable>
            </View>
          </PaperCard>
        </Animated.View>
      </View>
    </View>
  );
}
