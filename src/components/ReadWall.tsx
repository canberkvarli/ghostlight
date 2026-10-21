import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import Animated, {
  Easing,
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
import { colors, hardShadow } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

/**
 * The wall, inline (spec §5, Step 7). Two lines stay sharp, then the speech
 * goes out of focus and the offer floats over it on its own lit card.
 *
 * The blurred words are texture, not the play. Behind `paywalled: true` the API
 * sends only the opening, so the "rest" is that opening repeated until it fills
 * the space. Blurred past reading, it looks like a page of speech, and nothing
 * the actor hasn't paid for is ever on the device.
 *
 * The blur is in place from the first frame. Only the group's opacity animates,
 * so there is never a beat of sharp text under a blur that hasn't arrived yet:
 * the old shroud dropped its fade-in for exactly that reason.
 */

/** How much blurred page sits under the offer. Tall enough for the card. */
const GHOST_LINES = 12;
const RISE_MS = 520;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

const PAPER = colors.paper.background;
function paperAlpha(a: number): string {
  const n = parseInt(PAPER.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function ghostOf(text: string): string {
  const words = text.replace(/\s+/g, ' ').trim();
  if (!words) return '';
  // Enough copies to overflow GHOST_LINES at any phone width; the box clips.
  return Array.from({ length: 8 }, () => words).join(' ');
}

export function ReadWall({
  visible,
  rest,
  lineHeight,
  fontSize,
  width,
  accent,
  onUnlock,
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
  onUnlock: () => void;
}) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const ghostH = lineHeight * GHOST_LINES;

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

  return (
    <View>
      <MonologueText body={visible} lineHeight={lineHeight} fontSize={fontSize} />

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
                colors={[paperAlpha(0), paperAlpha(0.15), paperAlpha(0.55), paperAlpha(1)]}
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
          <PaperCard shadow={hardShadow.offsetSmall} style={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 18 }}>
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
              <Text
                style={{
                  marginTop: 8,
                  fontFamily: 'CourierPrime_400Regular_Italic',
                  fontSize: 13,
                  letterSpacing: 0.8,
                  textAlign: 'center',
                  color: c.paperMuted,
                }}
              >
                (the first one was on the house.)
              </Text>
              <PrimaryPill
                label="Unlock every monologue"
                haptic="medium"
                height={50}
                block
                onPress={onUnlock}
                style={{ marginTop: 16 }}
              />
              <Text
                style={{
                  marginTop: 10,
                  fontFamily: 'BricolageGrotesque_500Medium',
                  fontSize: 12,
                  color: c.paperMuted,
                }}
              >
                Saving stays free.
              </Text>
            </View>
          </PaperCard>
        </Animated.View>
      </View>
    </View>
  );
}
