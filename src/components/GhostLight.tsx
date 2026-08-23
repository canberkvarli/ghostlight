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

/**
 * The ghost light: a bare bulb standing on a threaded screw base, a thin pole,
 * and a foot plate in a pool of light — a real ghost light left burning on an
 * empty stage, not a glowing dot.
 *
 * Ported from the design handoff (README-assets). The glass is one path authored
 * in a 262×282 box and scaled; the hardware, pole and floor are ratios of the
 * glass height H. The light (glass, halo, floor glow) flickers and ignites; the
 * metal is static. `glow` recolours only the light — brass stays brass — so
 * Film & TV can go violet without a copper lamp turning purple.
 */

const GLASS_PATH =
  'M131 0 C205 0 262 58 262 131 C262 182 232 218 210 246 C198 262 192 272 190 282 L72 282 C70 272 64 262 52 246 C30 218 0 182 0 131 C0 58 57 0 131 0 Z';

interface Props {
  size?: number;
  /** Show the pole + foot + floor (the standing lamp). Off = compact bulb + base. */
  stem?: boolean;
  /** Kept for API compatibility; the pole is now proportional and this is ignored. */
  stemHeight?: number;
  /** 0–1 flare driven from outside (e.g. the search field brightening the bulb). */
  boost?: SharedValue<number>;
  /** The light colour, as hex. Amber by default; Film & TV passes violet. */
  glow?: string;
  /** Unused now (the base/pole are metal); kept for API compatibility. */
  line?: string;
}

const FLICKER_PERIOD = 7000;

function rgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function GhostLight({ size = 18, stem = false, boost, glow = colors.stageGlow }: Props) {
  const flicker = useSharedValue(1);
  const ignite = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const rgb = rgbTriplet(glow);

  useEffect(() => {
    if (reduceMotion) {
      flicker.value = 1;
      ignite.value = 1;
      return;
    }
    ignite.value = 0;
    ignite.value = withSequence(
      withTiming(0.18, { duration: 70, easing: Easing.linear }),
      withTiming(0.55, { duration: 55, easing: Easing.linear }),
      withTiming(0.24, { duration: 60, easing: Easing.linear }),
      withTiming(0.9, { duration: 55, easing: Easing.linear }),
      withTiming(0.55, { duration: 45, easing: Easing.linear }),
      withTiming(1, { duration: 170, easing: Easing.out(Easing.quad) }),
    );
    flicker.value = withRepeat(
      withSequence(
        withTiming(1, { duration: FLICKER_PERIOD * 0.92, easing: Easing.linear }),
        withTiming(0.55, { duration: FLICKER_PERIOD * 0.02, easing: Easing.linear }),
        withTiming(0.9, { duration: FLICKER_PERIOD * 0.015, easing: Easing.linear }),
        withTiming(0.65, { duration: FLICKER_PERIOD * 0.015, easing: Easing.linear }),
        withTiming(1, { duration: FLICKER_PERIOD * 0.03, easing: Easing.linear }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, flicker, ignite]);

  // --- geometry (all derived from glass width W) ---
  const W = size;
  const scale = W / 262;
  const H = 282 * scale; // glass height
  const haloR = 1.2 * W;

  const g = useMemo(() => {
    const centerX = 1.3 * W; // canvas half-width (halo is the widest at 2.4W)
    const pad = 0.14 * W;
    const glassCy = pad + haloR; // halo top ≈ pad
    const glassTop = glassCy - H / 2;
    const glassBottom = glassTop + H;
    const glassLeft = centerX - W / 2;

    // hardware stack (ratios of H), centred
    let y = glassBottom - 2 * scale; // neck tucks under the glass
    const neckW = 0.418 * H, neckH = 0.092 * H;
    const neckTop = y; y += neckH;
    const collarW = 0.397 * H, collarH = 0.043 * H;
    const collarTop = y; y += collarH;
    const baseW = 0.369 * H, baseH = 0.305 * H;
    const baseTop = y; y += baseH;
    const capW = 0.184 * H, capH = 0.078 * H;
    const capTop = y; y += capH;
    const poleW = Math.max(1, 0.046 * H), poleH = 0.61 * H;
    const poleTop = y; y += poleH;
    const footW = 0.61 * H, footH = Math.max(1, 0.035 * H);
    const footTop = y;
    const floorW = 1.06 * H, floorH = 0.156 * H;
    const floorCy = footTop + footH / 2;

    const stackBottom = stem ? floorCy + floorH / 2 : baseTop + baseH + capH;
    const canvasW = 2 * centerX;
    const canvasH = stackBottom + 0.1 * W;

    // glass path scaled + positioned
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
  }, [W, H, scale, haloR, stem]);

  // opacities: the light flickers, the metal doesn't
  const lit = useDerivedValue(() => {
    const b = boost ? boost.value : 0;
    return Math.min(1, flicker.value * ignite.value + b * 0.2);
  });
  const haloOpacity = useDerivedValue(() => {
    const b = boost ? boost.value : 0;
    return (0.34 + b * 0.4) * flicker.value * ignite.value;
  });

  const cx = g.centerX;

  return (
    <View className="items-center" pointerEvents="none">
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

        {/* floor pool — grounds the lamp */}
        {stem ? (
          <Oval
            x={cx - g.floorW / 2}
            y={g.floorCy - g.floorH / 2}
            width={g.floorW}
            height={g.floorH}
            opacity={lit}
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
        {stem ? (
          <Rect x={cx - g.poleW / 2} y={g.poleTop} width={g.poleW} height={g.poleH}>
            <LinearGradient
              start={vec(0, g.poleTop)}
              end={vec(0, g.poleTop + g.poleH)}
              colors={['#0d0806', '#2a1e17', '#3f2f26']}
              positions={[0, 0.4, 1]}
            />
          </Rect>
        ) : null}
        {/* foot plate */}
        {stem ? (
          <Rect x={cx - g.footW / 2} y={g.footTop} width={g.footW} height={g.footH}>
            <LinearGradient
              start={vec(cx - g.footW / 2, 0)}
              end={vec(cx + g.footW / 2, 0)}
              colors={['rgba(72,55,44,0)', '#48372c', '#48372c', 'rgba(72,55,44,0)']}
              positions={[0, 0.22, 0.78, 1]}
            />
          </Rect>
        ) : null}

        {/* screw base: dark body + thread bands + cap */}
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
        <NeckPath cx={cx} top={g.neckTop} w={g.neckW} h={g.neckH} />

        {/* glass — the bulb, frontmost light */}
        <Group opacity={lit}>
          <Path path={g.path}>
            <RadialGradient
              c={vec(g.glassLeft + W * 0.5, g.glassTop + H * 0.38)}
              r={W * 0.64}
              colors={['#fff6e4', '#ffd08c', '#f9a441', glow, glow]}
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
function NeckPath({ cx, top, w, h }: { cx: number; top: number; w: number; h: number }) {
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
      <LinearGradient start={vec(0, top)} end={vec(0, top + h)} colors={['#e0821f', '#5c4735']} />
    </Path>
  );
}
