import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  Canvas,
  Circle,
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

import { wash } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

/**
 * The stage the whole app stands on: warm near-black, a wash of glow spilling
 * from above the top edge, and a dither so neither of them bands on an OLED
 * panel.
 *
 * Nothing here moves any more. It held a tilt-tracking spotlight, then drifting
 * motes; both were tried on device and both were worse than stillness — a large
 * soft shape sliding behind the content read as something moving under the
 * surface, and the motes read as decoration stuck on top of it. The stage is a
 * backdrop. It should stay behind the actor.
 */

interface Props {
  tiltX: SharedValue<number>;
  tiltY: SharedValue<number>;
  /** The glow colour, as hex. Defaults to the amber stage; Film & TV passes violet. */
  glowColor?: string;
  /** Stage-floor override. Screen forces its violet near-black; theatre follows the theme. */
  background?: string;
}

function rgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

const DESATURATE = [
  0.33, 0.33, 0.33, 0, 0, //
  0.33, 0.33, 0.33, 0, 0, //
  0.33, 0.33, 0.33, 0, 0, //
  0, 0, 0, 1, 0,
];

const TWO_PI = Math.PI * 2;

/**
 * Why the light had rings in it.
 *
 * The spotlight was three stops — 16% at the centre, 7% at a third of the way
 * out, nothing at 68% — carried straight over from the web app's CSS. On a
 * 672pt radius that means the outer ramp falls from alpha 0.07 to 0 across
 * ~240pt, and 0.07 of 255 is eighteen values. Eighteen steps over 240 points is
 * a thirteen-point-wide band each, and the eye is very good at finding edges in
 * a smooth field. Stacked under the grain it read as the whole glow being
 * pixelated. A browser hides this with its own dithering; Skia hands you the
 * quantisation directly.
 *
 * So the falloff is a gaussian sampled at enough stops that no single ramp is
 * ever more than a value or two wide, and it tails to nothing gradually instead
 * of hitting a hard stop. Fitted to the web curve rather than invented: at
 * t=0.32 this gives 0.066 against the original 0.07, so the light is the same
 * light, just without the staircase.
 */
const SIGMA = 0.34;
const STOPS = 14;

function falloff(alpha: number, glow: (a: number) => string) {
  const colors: string[] = [];
  const positions: number[] = [];
  for (let i = 0; i < STOPS; i++) {
    const t = i / (STOPS - 1);
    colors.push(glow(alpha * Math.exp(-((t / SIGMA) ** 2))));
    positions.push(t);
  }
  return { colors, positions };
}

function StageBackdropImpl({ tiltX, tiltY, glowColor, background }: Props) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { colors: c } = useTheme();
  const rgb = glowColor ? rgbTriplet(glowColor) : '224, 115, 31';
  const glow = (alpha: number) => `rgba(${rgb}, ${alpha})`;
  const bg = background ?? c.background;
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

  const washStops = useMemo(() => falloff(wash.alpha * gm, glow), [rgb, gm]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]} />

      {/* Static: the wash hanging above the proscenium. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={vec(width / 2, -height * 0.2)}
            r={width * 1.15}
            {...washStops}
          />
        </Rect>
      </Canvas>

      {/* Static: dither, not texture.
          This exists to break up the last of the quantisation, so it wants to be
          per-pixel and barely there. It was three octaves at 4.5%, which is loud
          enough to see as grain in its own right — you end up looking at the
          noise instead of through it. One octave at high frequency is closer to
          what a dither is for. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Group
          opacity={c.isLight ? 0.014 : 0.026}
          layer={
            <Paint>
              <ColorMatrix matrix={DESATURATE} />
            </Paint>
          }
        >
          <Rect x={0} y={0} width={width} height={height}>
            <FractalNoise freqX={1.6} freqY={1.6} octaves={1} seed={7} />
          </Rect>
        </Group>
      </Canvas>
    </View>
  );
}

export const StageBackdrop = memo(StageBackdropImpl);
