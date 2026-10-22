import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { Monologue } from '../data/monologues';
import { sketchFor } from '../lib/sketchFor';
import { clock } from '../lib/segments';
import { useTheme } from '../theme/ThemeContext';
import { PaperCard } from './PaperCard';
import { clothFor, SCREEN_BLOCK } from './PieceCover';
import { Sketch } from './Sketches';
import { StageDirection } from './StageDirection';
import { WordArrow } from './WordArrow';

/**
 * One page of the playbill: the curtain's deck is a column of these, one per
 * speech, paged by the thumb. The poster, or the cloth of the play, fills the
 * top of the page and fades down into the paper the words are printed on, so
 * the picture and the speech are one sheet, not a thumbnail beside a caption.
 *
 * Everything that moves with the scroll is a function of `scrollY` on the UI
 * thread: the page settles to full size as it arrives, the one leaving shrinks
 * a touch and dims, and the picture drifts slower than the page so it has
 * depth. Nothing here sets state on scroll.
 */

/** How much of the next page shows under the current one. The hint that says "swipe" without saying it. */
export const PEEK = 34;
/** The dark between two pages. */
export const GAP = 14;

export function PlaybillPage({
  item,
  index,
  scrollY,
  page,
  height,
  first,
  reduce,
  onOpen,
  onShare,
}: {
  item: Monologue;
  index: number;
  scrollY: SharedValue<number>;
  /** The snap interval: a page's height plus the gap. */
  page: number;
  /** The card's height. */
  height: number;
  first: boolean;
  reduce: boolean;
  onOpen: () => void;
  onShare: () => void;
}) {
  const { colors: c } = useTheme();
  const pressed = useSharedValue(0);
  const screen = item.sourceType === 'film' || item.sourceType === 'tv';
  const pictureH = Math.round(height * 0.55);

  // d is this page's distance from the top in pages: 0 when it is the one on
  // stage, 1 when it has scrolled up and out, -1 when it is the next one waiting.
  const frame = useAnimatedStyle(() => {
    if (reduce) return {};
    const d = scrollY.value / page - index;
    return {
      opacity: interpolate(d, [-1, 0, 1], [0.78, 1, 0.55], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(d, [-1, 0, 1], [0.975, 1, 0.955], Extrapolation.CLAMP) }],
    };
  });
  const picture = useAnimatedStyle(() => {
    if (reduce) return {};
    const d = scrollY.value / page - index;
    return { transform: [{ translateY: interpolate(d, [-1, 0, 1], [-26, 0, 26], Extrapolation.CLAMP) }, { scale: 1.1 }] };
  });

  return (
    <Animated.View style={[frame, { height, marginBottom: GAP }]}>
      <Pressable
        onPress={onOpen}
        onLongPress={onShare}
        onPressIn={() => {
          pressed.value = withTiming(1, { duration: 90 });
        }}
        onPressOut={() => {
          pressed.value = withTiming(0, { duration: 180 });
        }}
        accessibilityRole="button"
        accessibilityLabel={`${item.character}, from ${item.source}. Read it`}
        accessibilityHint="Swipe up for another. Press and hold to share it as a picture"
        style={{ flex: 1 }}
      >
        <PaperCard shadow={8} pressed={pressed} wrapperStyle={{ flex: 1 }} style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
          {/* The picture. A poster for the screen, the bound cloth for a play. */}
          <View style={{ height: pictureH, overflow: 'hidden' }}>
            <Animated.View style={[picture, { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }]}>
              {screen && item.posterUrl ? (
                <Image
                  source={{ uri: item.posterUrl }}
                  style={{ width: '100%', height: '100%', backgroundColor: SCREEN_BLOCK }}
                  contentFit="cover"
                  contentPosition="top"
                  cachePolicy="memory-disk"
                  transition={240}
                  accessibilityIgnoresInvertColors
                />
              ) : screen ? (
                <View style={{ flex: 1, backgroundColor: SCREEN_BLOCK, alignItems: 'center', justifyContent: 'center' }}>
                  <Sketch name="clapper" size={120} stroke="#ede8f7" accent="#bd8bff" weight={1.6} />
                </View>
              ) : (
                <View style={{ flex: 1, backgroundColor: clothFor(item), alignItems: 'center', justifyContent: 'center' }}>
                  <Sketch name={sketchFor(item)} size={132} stroke="#f0ebdc" accent="#f2e22bff" weight={1.6} />
                </View>
              )}
            </Animated.View>
            {/* The picture fades into the paper. */}
            <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(pictureH * 0.55) }}>
              <Rect x={0} y={0} width={2000} height={Math.round(pictureH * 0.55)}>
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(0, Math.round(pictureH * 0.55))}
                  colors={[`${c.paper}00`, `${c.paper}cc`, c.paper]}
                  positions={[0, 0.62, 1]}
                />
              </Rect>
            </Canvas>
            {!screen && item.year ? (
              <Text
                style={{
                  position: 'absolute',
                  top: 16,
                  left: 20,
                  fontFamily: 'CourierPrime_400Regular',
                  fontSize: 12,
                  letterSpacing: 1.4,
                  color: '#f0ebdc',
                  opacity: 0.6,
                }}
              >
                {String(item.year)}
              </Text>
            ) : null}
          </View>

          {/* The words, printed on the paper the picture faded into. */}
          <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 18, marginTop: -8, justifyContent: 'space-between' }}>
            <View>
              <StageDirection on="paper">{first ? '(tonight.)' : '(another.)'}</StageDirection>
              <Text
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{
                  marginTop: 6,
                  fontFamily: 'InstrumentSerif_400Regular',
                  fontSize: 34,
                  lineHeight: 37,
                  letterSpacing: -0.5,
                  color: c.paperInk,
                }}
              >
                {item.character}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 4,
                  fontFamily: 'CourierPrime_400Regular_Italic',
                  fontSize: 13,
                  lineHeight: 17,
                  letterSpacing: 0.4,
                  color: c.paperMuted,
                }}
              >
                {`from ${item.source}`}
              </Text>
              <Text
                numberOfLines={height > 560 ? 4 : 3}
                style={{
                  marginTop: 12,
                  fontFamily: 'CourierPrime_400Regular',
                  fontSize: 14.5,
                  lineHeight: 22,
                  color: c.paperBody,
                }}
              >
                {item.excerpt}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'CourierPrime_400Regular', fontSize: 12, letterSpacing: 0.6, color: c.paperMuted }}>
                {item.duration ? clock(item.duration) : ''}
              </Text>
              <WordArrow label="read" onPress={onOpen} tint={c.accentText} />
            </View>
          </View>
        </PaperCard>
      </Pressable>
    </Animated.View>
  );
}

/**
 * A blank sheet in the same frame: what the deck shows while the house is
 * still answering, or the one line it has to say when it did not.
 */
export function BlankPage({ height, line, onPress }: { height: number; line?: string; onPress?: () => void }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ height, marginBottom: GAP }}>
      <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1 }}>
        <PaperCard shadow={onPress ? 8 : 0} wrapperStyle={{ flex: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {line ? (
            <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, letterSpacing: 0.8, color: c.paperMuted }}>{line}</Text>
          ) : null}
        </PaperCard>
      </Pressable>
    </View>
  );
}
