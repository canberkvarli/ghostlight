import { StyleSheet } from 'react-native';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';

/**
 * The wall, as a fade — not a blur, not a modal slammed over the page (spec §5,
 * Step 7). The lit lines stay legible at the top; below the fold the warm paper
 * falls into stage shadow under a Skia gradient, so the actor can see it is
 * genuinely their part before the light dims on the rest.
 */
// The mask runs paper → dark: the lit lines show through the transparent paper
// at the top, the page falls into the card's shadow, then into the stage floor.
export function PaywallShroud({ width, height }: { width: number; height: number }) {
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, height)}
          colors={[
            'rgba(248, 244, 240, 0)',
            'rgba(248, 244, 240, 0.82)',
            'rgba(29, 20, 15, 0.94)',
            '#130b08',
          ]}
          positions={[0, 0.22, 0.62, 1]}
        />
      </Rect>
    </Canvas>
  );
}
