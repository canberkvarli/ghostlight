import { useEffect } from 'react';
import { View } from 'react-native';
import {
  Canvas,
  Circle,
  ColorMatrix,
  Group,
  Image,
  RadialGradient,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { colors } from '../theme/tokens';

/**
 * The ghost light: the app icon's own lamp (icon 3a), shown as the icon art
 * itself rather than redrawn, so the icon and every lamp in the app are one
 * picture. `assets/ghostlight-lamp.png` is the icon's SVG
 * (`assets/source/ghostlight-icon-3a.svg`) exported with only its dark square
 * background removed, so it sits on the stage and on paper without a box.
 *
 * `size` is still the width of the GLASS, as it always was, so every caller
 * keeps its proportions. In the icon the glass is 262 units drawn at 1.3x, so
 * 340.6px of the 1024 image, centred at y 303.3.
 *
 *  - **full**: down to the pool of light on the floor. The launch screen.
 *  - **bare**: cropped just under the foot. Everywhere else.
 *
 * Film & TV passes a violet `glow`; the image is hue-rotated to it rather than
 * repainted.
 *
 * Motion: the resting state is the lit lamp, never an opacity-0 rest. The idle
 * flicker dips the lamp; a positive `boost` lifts an extra halo behind it; a
 * negative one puts it out.
 */

const LAMP = require('../../assets/ghostlight-lamp.png');
const IMAGE_PX = 1024;
const GLASS_PX = 262 * 1.3;
const GLASS_CY_PX = 120 + 141 * 1.3;
const CROP_FULL_PX = 930;
const CROP_BARE_PX = 878;
const AMBER_HUE = 28;

export type Dress = 'bare' | 'full';

interface Props {
  size?: number;
  /** `bare` (default, in-app) or `full` (icon + splash only). */
  dress?: Dress;
  /** Back-compat alias: `stem` truthy → full dress. Prefer `dress`. */
  stem?: boolean;
  /** Kept for API compatibility; the pole is proportional and this is ignored. */
  stemHeight?: number;
  /** 0–1 flare driven from outside (the field brightening, a search submit). */
  boost?: SharedValue<number>;
  /** The light colour, as hex. Amber by default; Film & TV passes violet. */
  glow?: string;
  /** The five radial glass stops, inner→outer. Amber by default. */
  glassStops?: readonly [string, string, string, string, string];
  /** The neck gradient top (full dress only). */
  neck?: string;
  /** Unused; kept for API compatibility. */
  line?: string;
}

const FLICKER_PERIOD = 7000;

/**
 * Every measurement of the lamp, from the glass width out. Lifted out of the
 * component so a caller can ask how tall a lamp WOULD be without rendering one
 * (Search reserves the footprint up front so the bulb never shifts).
 */
function lampBox(W: number, full: boolean) {
  const imgW = (W * IMAGE_PX) / GLASS_PX;
  const k = imgW / IMAGE_PX;
  return {
    imgW,
    glassCy: GLASS_CY_PX * k,
    canvasW: imgW,
    canvasH: (full ? CROP_FULL_PX : CROP_BARE_PX) * k,
  };
}

/**
 * How much room a lamp needs, and where its glass sits inside that room.
 * Reserve `canvasH` and offset by the difference in `glassCy` to keep the bulb
 * perfectly still while the fixture beneath it changes.
 */
export function ghostLightMetrics(size: number, dress: 'full' | 'bare') {
  const { canvasH, canvasW, glassCy } = lampBox(size, dress === 'full');
  return { canvasH, canvasW, glassCy };
}

function rgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function GhostLight({ size = 18, dress, stem, boost, glow = colors.stageGlow }: Props) {
  const full = (dress ?? (stem ? 'full' : 'bare')) === 'full';
  const flicker = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const rgb = rgbTriplet(glow);
  const image = useImage(LAMP);

  useEffect(() => {
    if (reduceMotion) {
      flicker.value = 1;
      return;
    }
    // The idle flicker: steady to 88% of the loop, then a short stutter. The
    // resting value is 1 (lit), so the loop only ever dips.
    flicker.value = withRepeat(
      withSequence(
        withTiming(1, { duration: FLICKER_PERIOD * 0.88, easing: Easing.linear }),
        withTiming(0.52, { duration: FLICKER_PERIOD * 0.02, easing: Easing.linear }),
        withTiming(0.88, { duration: FLICKER_PERIOD * 0.02, easing: Easing.linear }),
        withTiming(0.6, { duration: FLICKER_PERIOD * 0.02, easing: Easing.linear }),
        withTiming(0.95, { duration: FLICKER_PERIOD * 0.02, easing: Easing.linear }),
        withTiming(0.72, { duration: FLICKER_PERIOD * 0.02, easing: Easing.linear }),
        withTiming(1, { duration: FLICKER_PERIOD * 0.02, easing: Easing.linear }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, flicker]);

  const g = lampBox(size, full);
  const cx = g.canvasW / 2;
  const flareR = size * 1.2;

  // A negative boost is the lamp going out (Search blows it when you ask for
  // nothing): it scales the lamp down rather than subtracting, so -1 is dark,
  // not a negative opacity. The idle flicker only dims it toward 0.7 so the
  // fixture never vanishes outright.
  const lit = useDerivedValue(() => {
    const b = boost ? boost.value : 0;
    const dim = b < 0 ? 1 + Math.max(-1, b) : 1;
    return dim * (0.7 + 0.3 * flicker.value);
  });
  const flare = useDerivedValue(() => {
    const b = boost ? boost.value : 0;
    return Math.max(0, b) * 0.5;
  });

  const hue = hueOf(rgb) - AMBER_HUE;
  const recolour = Math.abs(hue) > 8 ? hueRotate(hue) : null;

  return (
    <View style={{ alignItems: 'center' }} pointerEvents="none">
      <Canvas style={{ width: g.canvasW, height: g.canvasH }}>
        {/* the flare: only on a positive boost, so the resting lamp is the icon */}
        <Circle cx={cx} cy={g.glassCy} r={flareR} opacity={flare}>
          <RadialGradient
            c={vec(cx, g.glassCy)}
            r={flareR}
            colors={[`rgba(${rgb}, 0.9)`, `rgba(${rgb}, 0.3)`, `rgba(${rgb}, 0)`]}
            positions={[0, 0.4, 1]}
          />
        </Circle>
        {image ? (
          <Group opacity={lit} layer={recolour ? <ColorMatrix matrix={recolour} /> : undefined}>
            <Image image={image} x={0} y={0} width={g.imgW} height={g.imgW} fit="contain" />
          </Group>
        ) : null}
      </Canvas>
    </View>
  );
}

/** Hue in degrees of an "r, g, b" triplet. */
function hueOf(triplet: string): number {
  const [r, g, b] = triplet.split(', ').map((n) => Number(n) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** The standard luminance-preserving hue rotation, as a 4x5 colour matrix. */
function hueRotate(deg: number): number[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0, 0,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0, 0,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0, 0,
    0, 0, 0, 1, 0,
  ];
}
