import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';

import { colors } from '../theme/tokens';

/**
 * The wall (spec §5, Step 7) — the page going soft, not a shutter coming down.
 *
 * The first version ramped the paper into stage black, so a light-mode reader
 * got a hard dark slab dropped into the middle of a cream card, three quarters
 * of the way up the screen. It read as a modal that had failed to open. It was
 * also anchored to a fixed fraction of the *window*, so where it landed in the
 * text was down to how tall your phone is.
 *
 * Now it starts at a known line (the read screen measures four lines down and
 * puts this there) and fades the paper into itself: the words go out of focus
 * and then out of existence, and the card stays one continuous piece of paper
 * that the offer sits on. Nothing to be dark in either scheme.
 *
 * Two stacked blurs rather than one, offset by 30pt: a single BlurView has a
 * uniform radius, so wherever it begins there is a visible focus seam straight
 * across the line beneath it. Stepping them lets the gradient swallow the first
 * edge before the strong blur starts.
 */
const PAPER = colors.light.background;

function paperAlpha(a: number): string {
  const h = PAPER.replace('#', '');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function PaywallShroud({ width, height }: { width: number; height: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <BlurView intensity={16} tint="light" style={StyleSheet.absoluteFill} />
      <BlurView
        intensity={46}
        tint="light"
        style={{ position: 'absolute', top: 30, left: 0, right: 0, bottom: 0 }}
      />
      <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={[
              paperAlpha(0),
              paperAlpha(0.45),
              paperAlpha(0.88),
              paperAlpha(1),
              paperAlpha(1),
            ]}
            positions={[0, 0.14, 0.34, 0.5, 1]}
          />
        </Rect>
      </Canvas>
    </View>
  );
}
