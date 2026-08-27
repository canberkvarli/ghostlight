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
 * puts this there) and the words simply go out of focus. The card stays one
 * continuous piece of paper. Nothing to be dark in either scheme.
 *
 * The paper wash used to begin immediately and reach full opacity a third of
 * the way down, which meant most of the walled text was hidden under a white
 * sheet rather than blurred — you could see there was something under there and
 * it looked like a rendering artefact, not a wall. The wash now holds off until
 * the offer block, and exists only to give that block a surface to sit on. Above
 * it, blur and nothing else: the text is visibly text, visibly unreadable.
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

export function PaywallShroud({
  width,
  height,
  /** Where the offer block starts. Only from here down does the paper solidify. */
  offerTop,
}: {
  width: number;
  height: number;
  offerTop?: number;
}) {
  // Where the wash begins, as a fraction of the shroud. Above it the text is
  // blurred and nothing else; the wash exists only to give the offer a surface.
  const washStart = offerTop != null && height > 0 ? Math.min(0.92, offerTop / height) : 0.55;

  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
      <BlurView
        intensity={62}
        tint="light"
        style={{ position: 'absolute', top: 30, left: 0, right: 0, bottom: 0 }}
      />
      <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={[paperAlpha(0), paperAlpha(0), paperAlpha(0.9), paperAlpha(1)]}
            positions={[0, Math.max(0, washStart - 0.16), washStart, Math.min(1, washStart + 0.06)]}
          />
        </Rect>
      </Canvas>
    </View>
  );
}
