import { useEffect } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '../theme/tokens';

/**
 * A slow orange halo that swells and fades under a primary button, like the
 * ghost light itself breathing behind the offer. UI thread, ~2.6s in and out.
 * Reduced motion leaves a steady, gentle glow rather than a pulse.
 *
 * Apply the returned style to an Animated.View wrapping the button.
 */
export function useBreathingGlow() {
  const t = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      t.value = 0.5;
      return;
    }
    t.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [reduceMotion, t]);

  return useAnimatedStyle(() => ({
    shadowColor: colors.stageGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12 + t.value * 14,
    shadowOpacity: 0.18 + t.value * 0.32,
    borderRadius: 16,
  }));
}
