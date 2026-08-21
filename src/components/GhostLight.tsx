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
}

const FLICKER_PERIOD = 7000;

export function GhostLight({ size = 18, stem = false, stemHeight = 84 }: Props) {
  const flicker = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      flicker.value = 1;
      return;
    }

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
  }, [reduceMotion, flicker]);

  const bulbStyle = useAnimatedStyle(() => ({ opacity: flicker.value }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.38 * flicker.value }));

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
