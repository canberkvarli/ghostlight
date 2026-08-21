import { memo } from 'react';
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
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { colors, spotlight, wash } from '../theme/tokens';

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

function StageBackdropImpl({ tiltX, tiltY }: Props) {
  const { width, height } = useWindowDimensions();

  const centre = useDerivedValue(() =>
    vec(
      width / 2 + tiltX.value * width * TRAVEL_X,
      height * 0.4 + tiltY.value * height * TRAVEL_Y,
    ),
  );

  const radius = Math.min(spotlight.radius, Math.max(width, height) * 0.95);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.dark.background }]} />

      {/* Static: the wash hanging above the proscenium. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={vec(width / 2, -height * 0.2)}
            r={width * 0.95}
            colors={[glow(wash.alpha), glow(0)]}
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
              glow(spotlight.innerAlpha),
              glow(spotlight.midAlpha),
              glow(0),
            ]}
            positions={[0, spotlight.midStop, spotlight.outerStop]}
          />
        </Rect>
      </Canvas>

      {/* Static: grain. Dark warm surfaces band badly without it. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Group
          opacity={0.045}
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
