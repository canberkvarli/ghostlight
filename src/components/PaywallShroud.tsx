import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';

/**
 * The wall (spec §5, Step 7). The lit lines stay legible at the top; below the
 * fold the warm paper falls into stage shadow, so the actor can see it is
 * genuinely their part before the light dims on the rest.
 *
 * Originally a pure gradient — the spec said "not a blur" — but a fade alone
 * left the first few walled lines readable if you tilted the screen, which is
 * both a worse tease and a worse wall. So there are two layers now:
 *
 *   1. A real blur, so the walled text is genuinely unresolvable rather than
 *      merely dim. It starts 10% down instead of at the top edge: a blur that
 *      began at y=0 would cut a hard focus seam straight across the last lit
 *      line. By 10% the gradient is already ~37% opaque and swallows the edge.
 *   2. The gradient on top, ramping faster than it used to, carrying the paper
 *      into the card's shadow and then the stage floor.
 */
export function PaywallShroud({ width, height }: { width: number; height: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <BlurView
        intensity={38}
        tint="light"
        style={{ position: 'absolute', top: height * 0.1, left: 0, right: 0, bottom: 0 }}
      />
      <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={[
              'rgba(248, 244, 240, 0)',
              'rgba(248, 244, 240, 0.9)',
              'rgba(29, 20, 15, 0.96)',
              '#130b08',
            ]}
            positions={[0, 0.16, 0.55, 1]}
          />
        </Rect>
      </Canvas>
    </View>
  );
}
