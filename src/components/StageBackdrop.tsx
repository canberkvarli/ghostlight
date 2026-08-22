import { memo, useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  Canvas,
  ColorMatrix,
  FractalNoise,
  Group,
  Paint,
  RadialGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { spotlight, wash } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

/**
 * The stage the whole app stands on: warm near-black, a wash of glow spilling
 * from above the top edge, the tilt spotlight, and a grain overlay so none of
 * that bands on an OLED panel.
 *
 * Two canvases, deliberately. The spotlight canvas redraws as you tilt; the
 * wash-and-grain canvas never changes its props and so never redraws. Putting
 * the noise in the animated canvas would mean regenerating it sixty times a
 * second for no visual difference at all.
 */

interface Props {
  tiltX: SharedValue<number>;
  tiltY: SharedValue<number>;
}

/** How far the light travels across the wall at full tilt, as a fraction of the screen. */
const TRAVEL_X = 0.42;
const TRAVEL_Y = 0.26;

const glow = (alpha: number) => `rgba(243, 130, 29, ${alpha})`;

const DESATURATE = [
  0.33, 0.33, 0.33, 0, 0, //
  0.33, 0.33, 0.33, 0, 0, //
  0.33, 0.33, 0.33, 0, 0, //
  0, 0, 0, 1, 0,
];

const TWO_PI = Math.PI * 2;

function StageBackdropImpl({ tiltX, tiltY }: Props) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { colors: c } = useTheme();
  // On a light stage the glow reads as a wash, not a hole — dim it, and let the
  // grain barely whisper so cream doesn't turn muddy.
  const gm = c.isLight ? 0.45 : 1;

  // A slow clock, 0→1 every 18s, on the UI thread. It gives the stage its own
  // breath — a lazy Lissajous drift and a faint pulse of the light — so even
  // with the phone dead still (or in a simulator with no gyro) the ghost light
  // never feels frozen. Reduced motion holds it at rest, dead centre.
  const clock = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      clock.value = 0;
      return;
    }
    clock.value = withRepeat(withTiming(1, { duration: 18000, easing: Easing.linear }), -1, false);
  }, [reduceMotion, clock]);

  const centre = useDerivedValue(() => {
    const driftX = Math.sin(clock.value * TWO_PI) * width * 0.06;
    const driftY = Math.cos(clock.value * TWO_PI * 0.75) * height * 0.035;
    return vec(
      width / 2 + driftX + tiltX.value * width * TRAVEL_X,
      height * 0.4 + driftY + tiltY.value * height * TRAVEL_Y,
    );
  });

  const radiusBase = Math.min(spotlight.radius, Math.max(width, height) * 0.95);
  const radius = useDerivedValue(
    () => radiusBase * (1 + 0.06 * Math.sin(clock.value * TWO_PI * 1.3)),
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.background }]} />

      {/* Static: the wash hanging above the proscenium. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={vec(width / 2, -height * 0.2)}
            r={width * 0.95}
            colors={[glow(wash.alpha * gm), glow(0)]}
            positions={[0, 1]}
          />
        </Rect>
      </Canvas>

      {/* Animated: the light itself. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={centre}
            r={radius}
            colors={[
              glow(spotlight.innerAlpha * gm),
              glow(spotlight.midAlpha * gm),
              glow(0),
            ]}
            positions={[0, spotlight.midStop, spotlight.outerStop]}
          />
        </Rect>
      </Canvas>

      {/* Static: grain. Dark warm surfaces band badly without it. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Group
          opacity={c.isLight ? 0.02 : 0.045}
          layer={
            <Paint>
              <ColorMatrix matrix={DESATURATE} />
            </Paint>
          }
        >
          <Rect x={0} y={0} width={width} height={height}>
            <FractalNoise freqX={0.85} freqY={0.85} octaves={3} seed={7} />
          </Rect>
        </Group>
      </Canvas>
    </View>
  );
}

export const StageBackdrop = memo(StageBackdropImpl);
