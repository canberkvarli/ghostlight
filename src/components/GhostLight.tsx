import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Oval,
  Path,
  RadialGradient,
  Rect,
  RoundedRect,
  Skia,
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
import { useTheme } from '../theme/ThemeContext';

/**
 * The ghost light: a bulb with a real silhouette standing on a pole in a pool of
 * light — a lamp left burning on an empty stage, not a glowing dot.
 *
 * Two dressings, same silhouette and ratios (handoff §1):
 *  - **full**  — glass, tapered neck, brass collar, threaded screw base, end cap,
 *    pole, foot, floor pool. The 1024 icon and the splash only; below ~60px the
 *    threads stop reading and just smudge.
 *  - **bare**  — glass, one solid base, pole, foot. Everywhere in-app: the eye
 *    recognises the outline, so dropping the hardware reads as the same lamp,
 *    further away.
 *
 * The glass is one path authored in a 262×282 box and scaled; the hardware, pole
 * and floor are ratios of the glass height H. `glow` / `glassStops` recolour only
 * the light — the brass stays brass — so Film & TV can go violet.
 *
 * Motion (handoff §4): the resting state is the *lit, settled* lamp — never an
 * opacity-0 rest, or the mark is blank in App Store shots and under reduced
 * motion. A single `boost` (-1–1) climbs the halo and floor from a rest below 1,
 * and goes the other way to put the lamp out;
 * the glass holds lit and only dips on the idle flicker.
 */

const GLASS_PATH =
  'M131 0 C205 0 262 58 262 131 C262 182 232 218 210 246 C198 262 192 272 190 282 L72 282 C70 272 64 262 52 246 C30 218 0 182 0 131 C0 58 57 0 131 0 Z';

const THEATRE_STOPS: readonly [string, string, string, string, string] = [
  '#fff6e4',
  '#ffd08c',
  '#f9a441',
  '#f3821d',
  '#f3821d',
];

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

function rgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function GhostLight({
  size = 18,
  dress,
  stem,
  boost,
  glow = colors.stageGlow,
  glassStops = THEATRE_STOPS,
  neck = '#e0821f',
}: Props) {
  const full = (dress ?? (stem ? 'full' : 'bare')) === 'full';
  const { colors: theme } = useTheme();
  const isLight = theme.isLight;
  const flicker = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const rgb = rgbTriplet(glow);

  useEffect(() => {
    if (reduceMotion) {
      flicker.value = 1;
      return;
    }
    // The idle flicker: steady to 88% of the loop, then a short stutter. The
    // resting value is 1 (lit), so the loop only ever *dips* — the lamp is never
    // dark at rest. No strike-from-zero here; the screen owns arrival.
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

  // --- geometry (all derived from glass width W) ---
  const W = size;
  const scale = W / 262;
  const H = 282 * scale; // glass height
  const haloR = 1.2 * W;

  const g = useMemo(() => {
    const centerX = 1.3 * W; // canvas half-width (halo is widest at 2.4W)
    const pad = 0.14 * W;
    const glassCy = pad + haloR; // halo top ≈ pad
    const glassTop = glassCy - H / 2;
    const glassBottom = glassTop + H;
    const glassLeft = centerX - W / 2;

    // Stack below the glass (ratios of H), centred. Bare skips neck/collar/cap.
    let y = glassBottom - 2 * scale;
    const neckW = 0.418 * H, neckH = 0.092 * H;
    const neckTop = y; if (full) y += neckH;
    const collarW = 0.397 * H, collarH = 0.043 * H;
    const collarTop = y; if (full) y += collarH;
    const baseW = 0.369 * H, baseH = 0.305 * H;
    const baseTop = y; y += baseH;
    const capW = 0.184 * H, capH = 0.078 * H;
    const capTop = y; if (full) y += capH;
    const poleW = Math.max(1, 0.046 * H), poleH = 0.61 * H;
    const poleTop = y; y += poleH;
    const footW = 0.61 * H, footH = Math.max(1, 0.035 * H);
    const footTop = y;
    const floorW = 1.06 * H, floorH = 0.156 * H;
    const floorCy = footTop + footH / 2;

    const stackBottom = full ? floorCy + floorH / 2 : footTop + footH + 0.04 * W;
    const canvasW = 2 * centerX;
    const canvasH = stackBottom + 0.1 * W;

    const path = Skia.Path.MakeFromSVGString(GLASS_PATH)!;
    const m = Skia.Matrix();
    m.translate(glassLeft, glassTop);
    m.scale(scale, scale);
    path.transform(m);

    return {
      centerX, glassCy, glassTop, glassLeft, path,
      neckTop, neckW, neckH, collarTop, collarW, collarH,
      baseTop, baseW, baseH, capTop, capW, capH,
      poleTop, poleW, poleH, footTop, footW, footH,
      floorCy, floorW, floorH, canvasW, canvasH,
    };
  }, [W, H, scale, haloR, full]);

  // The glass holds lit and dips on the flicker; the halo and floor rest below 1
  // and climb with the boost, so a surge is actually visible (opacity clamps at 1).
  //
  // A NEGATIVE boost is the lamp going out — search.tsx blows it when you ask
  // for nothing — and it has to scale the rest down rather than subtract from
  // it, or -1 lands on a negative opacity, which is not a colour. It also has to
  // reach the glass: dimming only the halo left a bulb that was plainly still
  // lit inside a dark room, which reads as a rendering fault, not a blackout.
  const dim = (b: number) => {
    'worklet';
    return b < 0 ? 1 + Math.max(-1, b) : 1;
  };
  const litGlass = useDerivedValue(() => flicker.value * dim(boost ? boost.value : 0));
  const haloOpacity = useDerivedValue(() => {
    const b = boost ? boost.value : 0;
    return 0.34 * dim(b) * (1 + Math.max(0, b) * 1.47) * (0.72 + 0.28 * flicker.value);
  });
  const floorOpacity = useDerivedValue(() => {
    const b = boost ? boost.value : 0;
    return 0.6 * dim(b) * (1 + Math.max(0, b) * 0.67) * (0.72 + 0.28 * flicker.value);
  });

  const cx = g.centerX;

  return (
    <View style={{ alignItems: 'center' }} pointerEvents="none">
      <Canvas style={{ width: g.canvasW, height: g.canvasH }}>
        {/* halo — the pool of light around the glass */}
        <Circle cx={cx} cy={g.glassCy} r={haloR} opacity={haloOpacity}>
          <RadialGradient
            c={vec(cx, g.glassCy)}
            r={haloR}
            colors={[`rgba(${rgb}, 0.92)`, `rgba(${rgb}, 0.34)`, `rgba(${rgb}, 0)`]}
            positions={[0, 0.38, 1]}
          />
        </Circle>

        {/* floor pool — grounds the full-dress lamp */}
        {full ? (
          <Oval
            x={cx - g.floorW / 2}
            y={g.floorCy - g.floorH / 2}
            width={g.floorW}
            height={g.floorH}
            opacity={floorOpacity}
          >
            <RadialGradient
              c={vec(cx, g.floorCy)}
              r={g.floorW / 2}
              colors={[`rgba(${rgb}, 0.16)`, `rgba(${rgb}, 0)`]}
              positions={[0, 0.72]}
            />
          </Oval>
        ) : null}

        {/* pole */}
        <Rect x={cx - g.poleW / 2} y={g.poleTop} width={g.poleW} height={g.poleH}>
          <LinearGradient
            start={vec(0, g.poleTop)}
            end={vec(0, g.poleTop + g.poleH)}
            colors={['#0d0806', '#2a1e17', '#3f2f26']}
            positions={[0, 0.4, 1]}
          />
        </Rect>
        {/* foot plate */}
        <Rect x={cx - g.footW / 2} y={g.footTop} width={g.footW} height={g.footH}>
          <LinearGradient
            start={vec(cx - g.footW / 2, 0)}
            end={vec(cx + g.footW / 2, 0)}
            colors={['rgba(72,55,44,0)', '#48372c', '#48372c', 'rgba(72,55,44,0)']}
            positions={[0, 0.22, 0.78, 1]}
          />
        </Rect>

        {/* base: full dress is a threaded screw base + cap; bare is one solid block */}
        {full ? (
          <>
            <RoundedRect x={cx - g.baseW / 2} y={g.baseTop} width={g.baseW} height={g.baseH} r={Math.max(1, 3 * scale)} color="#33261e" />
            {[0.16, 0.38, 0.6, 0.82].map((t) => (
              <Rect
                key={t}
                x={cx - g.baseW / 2}
                y={g.baseTop + g.baseH * t}
                width={g.baseW}
                height={Math.max(1, g.baseH * 0.09)}
                color="#4a3a2e"
              />
            ))}
            <Rect x={cx - g.capW / 2} y={g.capTop} width={g.capW} height={g.capH} color="#241a15" />
            {/* collar */}
            <RoundedRect x={cx - g.collarW / 2} y={g.collarTop} width={g.collarW} height={g.collarH} r={Math.max(1, 2 * scale)}>
              <LinearGradient
                start={vec(0, g.collarTop)}
                end={vec(0, g.collarTop + g.collarH)}
                colors={['#6b5540', '#40311f']}
              />
            </RoundedRect>
            {/* neck (tapered) */}
            <NeckPath cx={cx} top={g.neckTop} w={g.neckW} h={g.neckH} top1={neck} />
          </>
        ) : (
          <RoundedRect x={cx - g.baseW / 2} y={g.baseTop} width={g.baseW} height={g.baseH} r={Math.max(1, 3 * scale)} color="#33261e" />
        )}

        {/* dead glass — the bulb as an object rather than as light.
            Always drawn, always underneath. The lit glass above is opaque at
            rest so you never see this while the lamp is on; it only surfaces as
            the light drops. Without it, dimming the glass faded the bulb toward
            transparent and the lamp simply went missing — a hole in the stage
            where the fixture should be, which reads as a rendering fault rather
            than a lamp that's off. Now it dims toward its own cold silhouette,
            which is what an unlit bulb actually looks like, and the idle flicker
            gets better for free: it dips toward dark glass, not toward nothing.

            No outline. A rim read as a drawn edge rather than as glass.

            The colour has to follow the scheme, and not by inverting: on paper a
            near-black bulb is a hole punched in the page, far heavier than the
            brass fittings it hangs from. An unlit bulb on a bright surface is
            actually a pale, slightly cool grey — you see the room through it —
            so light mode gets that instead of the dark-stage version. */}
        <Path path={g.path}>
          <LinearGradient
            start={vec(0, g.glassTop)}
            end={vec(0, g.glassTop + H)}
            colors={
              isLight
                ? ['#d9d2c9', '#c6bdb2', '#b3a99d']
                : ['#2b211a', '#1c1411', '#120c0a']
            }
            positions={[0, 0.55, 1]}
          />
        </Path>

        {/* glass — the bulb, frontmost light */}
        <Group opacity={litGlass}>
          <Path path={g.path}>
            <RadialGradient
              c={vec(g.glassLeft + W * 0.5, g.glassTop + H * 0.38)}
              r={W * 0.64}
              colors={[...glassStops]}
              positions={[0, 0.22, 0.48, 0.76, 1]}
            />
          </Path>
          {/* highlight — light through glass */}
          <Oval
            x={g.glassLeft + W * (72 / 262) - W * 0.13}
            y={g.glassTop + H * (58 / 282) - H * 0.1}
            width={W * 0.26}
            height={H * 0.2}
          >
            <RadialGradient
              c={vec(g.glassLeft + W * (72 / 262), g.glassTop + H * (58 / 282))}
              r={W * 0.15}
              colors={['rgba(255,252,244,0.65)', 'rgba(255,252,244,0)']}
              positions={[0, 1]}
            />
          </Oval>
        </Group>
      </Canvas>
    </View>
  );
}

/** The tapered neck under the glass — a trapezoid, 12% inset at the bottom. */
function NeckPath({ cx, top, w, h, top1 }: { cx: number; top: number; w: number; h: number; top1: string }) {
  const p = useMemo(() => {
    const bw = w * 0.88; // 12% inset
    const path = Skia.Path.Make();
    path.moveTo(cx - w / 2, top);
    path.lineTo(cx + w / 2, top);
    path.lineTo(cx + bw / 2, top + h);
    path.lineTo(cx - bw / 2, top + h);
    path.close();
    return path;
  }, [cx, top, w, h]);
  return (
    <Path path={p}>
      <LinearGradient start={vec(0, top)} end={vec(0, top + h)} colors={[top1, '#5c4735']} />
    </Path>
  );
}
