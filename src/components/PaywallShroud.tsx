import { StyleSheet } from 'react-native';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';

/**
 * The wall, as a fade — not a blur, not a modal slammed over the page (spec §5,
 * Step 7). The lit lines stay legible at the top; below the fold the warm paper
 * falls into stage shadow under a Skia gradient, so the actor can see it is
 * genuinely their part before the light dims on the rest.
 */
// #130b08 as rgb, so alpha stops read cleanly across Skia versions.
const dark = (a: number) => `rgba(19, 11, 8, ${a})`;

export function PaywallShroud({ width, height }: { width: number; height: number }) {
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, height)}
          colors={[dark(0), dark(0.4), dark(0.95), dark(1)]}
          positions={[0, 0.28, 0.7, 1]}
        />
      </Rect>
    </Canvas>
  );
}
