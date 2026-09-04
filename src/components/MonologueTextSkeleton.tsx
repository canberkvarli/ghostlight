import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * The words, on their way.
 *
 * Opening a piece from the results list hands the read screen a preview, so the
 * heading paints at once and the loading screen is skipped — which left the paper
 * card sitting there empty for as long as the fetch took. On a light-mode phone
 * that is several seconds of blank white where a speech should be, and it reads
 * as a broken page rather than a loading one.
 *
 * The old placeholder was a bare `<View>` of the right height. It did the one
 * thing that mattered, holding the scroll steady so the page cannot jump when the
 * text lands, and nothing else. This keeps that promise exactly — same height, to
 * the pixel — and spends it on something that says "words are coming".
 *
 * Ragged widths on purpose. Four bars of equal length read as a table; prose has
 * a ragged right edge, and the last line of a paragraph is always short. The
 * shape should be recognisably a speech before you can read a word of it.
 *
 * The pulse runs entirely on the UI thread from one shared value, with each line
 * offset a little so the block breathes rather than blinking in unison. Reduced
 * motion gets the bars at a flat resting opacity, because a placeholder that
 * pulses is decoration and this app turns decoration off when asked.
 */

/** Fractions of the column, shaped like prose rather than a table. */
const WIDTHS = [1, 0.94, 0.98, 0.62, 0.9, 0.72];

const PULSE_MS = 1500;
/** How far apart the lines breathe. Small: a wave, not a queue. */
const STAGGER = 0.13;

function SkeletonLine({
  index,
  width,
  lineHeight,
  pulse,
  still,
}: {
  index: number;
  width: number;
  lineHeight: number;
  pulse: SharedValue<number>;
  still: boolean;
}) {
  const style = useAnimatedStyle(() => {
    if (still) return { opacity: 0.16 };
    // Each line lags the one above it, then clamps, so the wave travels down the
    // block and no line ever runs ahead of the value driving it.
    const shifted = Math.min(1, Math.max(0, pulse.value - index * STAGGER));
    return { opacity: 0.09 + shifted * 0.15 };
  });

  return (
    <View style={{ height: lineHeight, justifyContent: 'center' }}>
      <Animated.View
        style={[
          style,
          {
            height: 12,
            width: `${width * 100}%`,
            borderRadius: 3,
            // Ink on paper. The read card is always the warm light page, whatever
            // the app's scheme, so this is deliberately not a themed colour.
            backgroundColor: '#2b2019',
          },
        ]}
      />
    </View>
  );
}

export function MonologueTextSkeleton({
  lines,
  lineHeight,
}: {
  /** Must match the spacer this replaces, or the page jumps when the text lands. */
  lines: number;
  lineHeight: number;
}) {
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse, reduce]);

  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Finding the words">
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine
          key={i}
          index={i}
          width={WIDTHS[i % WIDTHS.length]}
          lineHeight={lineHeight}
          pulse={pulse}
          still={reduce}
        />
      ))}
    </View>
  );
}
