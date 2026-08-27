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
 * from above the top edge, a few motes drifting at the lamp, and a dither so
 * none of it bands on an OLED panel.
 *
 * Two canvases, deliberately. The mote canvas redraws as you tilt; the wash and
 * dither never change their props and so never redraw. Putting the noise in the
 * animated canvas would mean regenerating it sixty times a second for no visual
 * difference at all.
 */

interface Props {
  tiltX: SharedValue<number>;
  tiltY: SharedValue<number>;
  /** The glow colour, as hex. Defaults to the amber stage; Film & TV passes violet. */
  glowColor?: string;
  /** Stage-floor override. Screen forces its violet near-black; theatre follows the theme. */
  background?: string;
  /** Where the lamp hangs on THIS screen, so the motes gather at it. */
  focus?: { x: number; y: number };
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

/**
 * Six motes, gathered at the lamp.
 *
 * They were nine, spread over the whole field, and that was wrong for the same
 * reason the old spotlight was wrong: anything distributed across the entire
 * background is scenery, and scenery that moves is distracting. Light comes from
 * somewhere. Clustering them at the bulb makes them read as motes IN the beam —
 * the thing the lamp is doing — rather than as decoration applied to the screen.
 *
 * `dx`/`dy` are offsets from the focal point in fractions of the viewport, kept
 * small and slightly wider than tall so the cluster hangs the way a glow does.
 */
const MOTES = [
  { dx: -0.14, dy: -0.055, r: 1.5, depth: 0.3, speed: 0.8, phase: 0.0, amp: 0.016 },
  { dx: 0.13, dy: -0.085, r: 1.2, depth: 0.24, speed: 1.0, phase: 1.9, amp: 0.013 },
  { dx: 0.19, dy: 0.045, r: 1.9, depth: 0.44, speed: 0.6, phase: 3.4, amp: 0.020 },
  { dx: -0.20, dy: 0.075, r: 1.7, depth: 0.38, speed: 0.7, phase: 5.1, amp: 0.018 },
  { dx: 0.04, dy: 0.115, r: 2.2, depth: 0.55, speed: 0.5, phase: 2.2, amp: 0.024 },
  { dx: -0.06, dy: -0.12, r: 1.3, depth: 0.2, speed: 0.95, phase: 4.3, amp: 0.014 },
] as const;

/** Where the lamp hangs, as a fraction of the viewport. Screens may override. */
const DEFAULT_FOCUS = { x: 0.5, y: 0.26 } as const;

type MoteSpec = (typeof MOTES)[number];

/**
 * One mote: a bright core inside a soft halo about eight times its size.
 *
 * The halo is what stops it looking like a dot someone drew on the glass, and
 * the two-stop core inside it is what stops the whole thing looking like a
 * smudge. On paper the same light has to be darker than its background rather
 * than brighter, or it simply isn't there — so light mode raises the alpha and
 * leans on the warm accent instead of trying to out-glow cream.
 */
function Mote({
  spec,
  clock,
  tiltX,
  tiltY,
  width,
  height,
  rgb,
  isLight,
  focus,
}: {
  spec: MoteSpec;
  clock: SharedValue<number>;
  tiltX: SharedValue<number>;
  tiltY: SharedValue<number>;
  width: number;
  height: number;
  rgb: string;
  isLight: boolean;
  focus: { x: number; y: number };
}) {
  const haloR = spec.r * 8;
  const travel = 0.11;

  const centre = useDerivedValue(() => {
    const t = clock.value * TWO_PI * spec.speed + spec.phase;
    return vec(
      width * (focus.x + spec.dx) +
        Math.cos(t) * width * spec.amp +
        tiltX.value * width * travel * spec.depth,
      height * (focus.y + spec.dy) +
        Math.sin(t * 0.8) * height * spec.amp * 0.7 +
        tiltY.value * height * travel * spec.depth,
    );
  });

  // A slow breath, offset per mote so they never pulse in unison.
  const alpha = useDerivedValue(() => {
    const base = isLight ? 0.5 : 0.62;
    return base * (0.72 + 0.28 * Math.sin(clock.value * TWO_PI * spec.speed * 1.7 + spec.phase));
  });

  return (
    <Circle c={centre} r={haloR} opacity={alpha}>
      <RadialGradient
        c={centre}
        r={haloR}
        colors={[
          `rgba(${rgb}, ${isLight ? 0.5 : 0.85})`,
          `rgba(${rgb}, ${isLight ? 0.22 : 0.3})`,
          `rgba(${rgb}, 0)`,
        ]}
        positions={[0, 0.16, 1]}
      />
    </Circle>
  );
}

function StageBackdropImpl({ tiltX, tiltY, glowColor, background, focus }: Props) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { colors: c } = useTheme();
  const rgb = glowColor ? rgbTriplet(glowColor) : '243, 130, 29';
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

      {/* Animated: motes.
          This used to be one enormous radial gradient that slid around behind
          everything as you tilted. At that scale a soft-edged pool stops reading
          as light and starts reading as a shape moving under the surface —
          which is genuinely unpleasant, and was described as creepy by the only
          person who has used this app.
          Small points of light have the opposite quality: dust in a beam, or the
          lamps in a house rig seen from the back of the stalls. Each drifts on
          its own slow orbit and answers the tilt by a different amount, so the
          field has depth without anything large enough to look like a figure. */}
      <Canvas style={StyleSheet.absoluteFill}>
        {MOTES.map((m, i) => (
          <Mote
            key={i}
            spec={m}
            clock={clock}
            tiltX={tiltX}
            tiltY={tiltY}
            width={width}
            height={height}
            rgb={rgb}
            isLight={c.isLight}
            focus={focus ?? DEFAULT_FOCUS}
          />
        ))}
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
