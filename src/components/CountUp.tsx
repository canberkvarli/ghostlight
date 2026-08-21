import { useEffect } from 'react';
import { TextInput, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/**
 * A number that races up to its value on the actor's first breath in the app —
 * 0 → 10,863 — so the promise lands as motion, not just type. It rides the UI
 * thread via the Animated-TextInput `text` trick: the count is a shared value
 * formatted inside a worklet, never JavaScript per frame. Reduced motion shows
 * the final figure at rest.
 */

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

function withCommas(n: number): string {
  'worklet';
  const s = Math.max(0, Math.round(n)).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const fromEnd = s.length - i;
    if (i > 0 && fromEnd % 3 === 0) out += ',';
    out += s[i];
  }
  return out;
}

export function CountUp({
  to,
  duration = 1500,
  style,
}: {
  to: number;
  duration?: number;
  style?: TextStyle;
}) {
  const value = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      value.value = to;
      return;
    }
    value.value = 0;
    value.value = withTiming(to, { duration, easing: Easing.out(Easing.cubic) });
  }, [to, duration, reduceMotion, value]);

  // `text` is a real (private) TextInput prop the Reanimated pattern drives; it
  // isn't in the public types, hence the cast.
  const animatedProps = useAnimatedProps(
    () => ({ text: withCommas(value.value), defaultValue: withCommas(value.value) }) as object,
  );

  return (
    <AnimatedInput
      editable={false}
      style={style}
      value={undefined}
      animatedProps={animatedProps}
      pointerEvents="none"
    />
  );
}
