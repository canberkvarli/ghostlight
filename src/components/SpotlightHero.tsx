import { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { BlurMask, Canvas, Circle, Group, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { GhostLight, ghostLightMetrics } from './GhostLight';
import { useTheme } from '../theme/ThemeContext';

const GLASS = 50;
const LAMP = ghostLightMetrics(GLASS, 'full');
const RAYS = 9;

/**
 * The top of the paywall: the ghost light on an empty stage, with its light
 * thrown out around it. A halo that breathes, a fan of soft rays turning very
 * slowly, and the lamp itself standing in the pool on the floor. The light is
 * the picture; nothing else is drawn. Reduced motion holds it lit and still.
 *
 * `height` is where the floor is; the canvas runs `bleed` past it so the light
 * fades out on its own instead of stopping at an edge.
 */
export function SpotlightHero({ height, bleed = 220 }: { height: number; bleed?: number }) {
  const { width } = useWindowDimensions();
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const breath = useSharedValue(0);
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduce) { breath.value = 0.5; turn.value = 0; return; }
    breath.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }), -1, true);
    turn.value = withRepeat(withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduce, breath, turn]);

  // The glass sits a little above the middle, so the floor pool has room under it.
  const lampTop = height - LAMP.canvasH - 6;
  const cx = width / 2;
  const cy = lampTop + LAMP.glassCy;
  const reach = Math.max(width, height) * 0.95;

  const halo = useDerivedValue(() => width * (0.5 + breath.value * 0.06));
  const haloOpacity = useDerivedValue(() => 0.75 + breath.value * 0.25);
  const rays = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const sway = (turn.value - 0.5) * 0.12;
    for (let i = 0; i < RAYS; i++) {
      // A fan upward and out, as the light leaves the glass; the floor stops it below.
      const a = -Math.PI / 2 + ((i - (RAYS - 1) / 2) / (RAYS - 1)) * Math.PI * 1.15 + sway;
      const w = 0.035 + (i % 3) * 0.012;
      p.moveTo(cx, cy);
      p.lineTo(cx + Math.cos(a - w) * reach, cy + Math.sin(a - w) * reach);
      p.lineTo(cx + Math.cos(a + w) * reach, cy + Math.sin(a + w) * reach);
      p.close();
    }
    return p;
  });
  const amber = c.isLight ? '224, 115, 31' : '240, 140, 50';

  return (
    <View style={{ height: height + bleed, width: '100%' }} pointerEvents="none">
      <Canvas style={{ position: 'absolute', top: 0, left: 0, width, height: height + bleed }}>
        <Group opacity={haloOpacity}>
          <Circle cx={cx} cy={cy} r={halo}>
            <RadialGradient c={vec(cx, cy)} r={width * 0.56} colors={[`rgba(${amber}, 0.46)`, `rgba(${amber}, 0.16)`, `rgba(${amber}, 0.03)`, `rgba(${amber}, 0)`]} positions={[0, 0.3, 0.65, 1]} />
          </Circle>
        </Group>
        <Group opacity={c.isLight ? 0.5 : 1}>
          <Path path={rays}>
            <RadialGradient c={vec(cx, cy)} r={reach} colors={[`rgba(${amber}, 0.42)`, `rgba(${amber}, 0.16)`, `rgba(${amber}, 0.04)`, `rgba(${amber}, 0)`]} positions={[0, 0.3, 0.6, 0.9]} />
            <BlurMask blur={9} style="normal" />
          </Path>
        </Group>
      </Canvas>
      <View style={{ position: 'absolute', top: lampTop, left: 0, right: 0, alignItems: 'center' }}>
        <GhostLight size={GLASS} dress="full" />
      </View>
    </View>
  );
}
