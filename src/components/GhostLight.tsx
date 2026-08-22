import { useEffect } from 'react';
import { View } from 'react-native';
import { Canvas, LinearGradient, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

import { colors } from '../theme/tokens';

/**
 * A bare bulb on a stand, left burning on an empty stage.
 *
 * Ported from actorrise/components/brand/. Bulb, radial halo at 38%, optional
 * stem fading downward, and the 7s ghost-flicker: steady for most of the cycle,
 * then a dip at 92–97% so it reads as a filament rather than a pulse animation.
 */

interface Props {
  size?: number;
  /** The stand below the bulb. */
  stem?: boolean;
  stemHeight?: number;
  /**
   * 0–1 flare, driven from outside — e.g. the search screen brightens the bulb
   * as the actor types. Optional; the bulb glows fine on its own.
   */
  boost?: SharedValue<number>;
}

const FLICKER_PERIOD = 7000;

export function GhostLight({ size = 18, stem = false, stemHeight = 84, boost }: Props) {
  const flicker = useSharedValue(1);
  const ignite = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      flicker.value = 1;
      ignite.value = 1;
      return;
    }

    // Strike the bulb: it stutters up from dark each time the screen appears,
    // like a filament catching — then holds.
    ignite.value = 0;
    ignite.value = withSequence(
      withTiming(0.18, { duration: 70, easing: Easing.linear }),
      withTiming(0.55, { duration: 55, easing: Easing.linear }),
      withTiming(0.24, { duration: 60, easing: Easing.linear }),
      withTiming(0.9, { duration: 55, easing: Easing.linear }),
      withTiming(0.55, { duration: 45, easing: Easing.linear }),
      withTiming(1, { duration: 170, easing: Easing.out(Easing.quad) }),
    );

    // 1 → .55 → .9 → .65 → 1, all inside the last 8% of a seven second cycle.
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

  const bulbStyle = useAnimatedStyle(() => {
    const b = boost ? boost.value : 0;
    return {
      opacity: Math.min(1, flicker.value * ignite.value + b * 0.2),
      transform: [{ scale: 1 + b * 0.22 }],
    };
  });
  const haloStyle = useAnimatedStyle(() => {
    const b = boost ? boost.value : 0;
    return {
      opacity: (0.38 + b * 0.5) * flicker.value * ignite.value,
      transform: [{ scale: 1 + b * 0.16 }],
    };
  });

  const halo = size * 5.2;

  return (
    <View className="items-center" pointerEvents="none">
      <View style={{ width: halo, height: halo }} className="items-center justify-center">
        <Animated.View style={[haloStyle, { position: 'absolute', width: halo, height: halo }]}>
          <Canvas style={{ width: halo, height: halo }}>
            <Rect x={0} y={0} width={halo} height={halo}>
              <RadialGradient
                c={vec(halo / 2, halo / 2)}
                r={halo / 2}
                colors={['rgba(243, 130, 29, 1)', 'rgba(243, 130, 29, 0.34)', 'rgba(243, 130, 29, 0)']}
                positions={[0, 0.38, 1]}
              />
            </Rect>
          </Canvas>
        </Animated.View>
        <Animated.View
          style={[
            bulbStyle,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: colors.stageGlow,
              shadowColor: colors.stageGlow,
              shadowOpacity: 0.9,
              shadowRadius: size * 1.4,
              shadowOffset: { width: 0, height: 0 },
            },
          ]}
        />
      </View>

      {stem ? (
        <Canvas style={{ width: 2, height: stemHeight, marginTop: -halo * 0.18 }}>
          <Rect x={0} y={0} width={2} height={stemHeight}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, stemHeight)}
              colors={[colors.stageLine, 'rgba(54, 43, 36, 0)']}
            />
          </Rect>
        </Canvas>
      ) : null}
    </View>
  );
}
