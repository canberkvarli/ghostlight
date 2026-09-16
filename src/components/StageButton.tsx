import { Pressable, Text, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/ThemeContext';

/**
 * The primary action, gentle. Not a slab of loud orange — a lit outline: the
 * ghost light tracing the edge over a whisper of warmth, orange type inside. It
 * presses down with a soft dim rather than a bounce. Sexy by restraint.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function StageButton({
  onPress,
  label,
  children,
  disabled,
  style,
  glow,
}: {
  onPress: () => void;
  label?: string;
  children?: React.ReactNode;
  disabled?: boolean;
  style?: ViewStyle;
  /** The house colour, as hex. Defaults to the amber stage glow. */
  glow?: string;
}) {
  const { colors: c } = useTheme();
  const tint = glow ?? c.stageGlow;
  const press = useSharedValue(0);
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.015 }],
    opacity: 1 - press.value * 0.12,
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      onPressIn={() => {
        Haptics.selectionAsync().catch(() => {});
        press.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => (press.value = withTiming(0, { duration: 220 }))}
      style={[
        aStyle,
        {
          height: 56,
          borderRadius: 18,
          borderWidth: 1.5,
          borderColor: withAlpha(tint, 0.55),
          backgroundColor: withAlpha(tint, c.isLight ? 0.06 : 0.1),
          alignItems: 'center',
          justifyContent: 'center',
          // A held breath of glow — present, never loud.
          shadowColor: tint,
          shadowOpacity: 0.16,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    >
      {children ?? (
        <Text
          style={{
            fontFamily: 'BricolageGrotesque_600SemiBold',
            fontSize: 14,
            letterSpacing: 2.5,
            textTransform: 'uppercase',
            color: tint,
          }}
        >
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}
