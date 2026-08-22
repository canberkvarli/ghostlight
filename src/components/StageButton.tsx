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

export function StageButton({
  onPress,
  label,
  children,
  disabled,
  style,
}: {
  onPress: () => void;
  label?: string;
  children?: React.ReactNode;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { colors: c } = useTheme();
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
          borderColor: 'rgba(243, 130, 29, 0.55)',
          backgroundColor: c.isLight ? 'rgba(203, 75, 0, 0.06)' : 'rgba(243, 130, 29, 0.10)',
          alignItems: 'center',
          justifyContent: 'center',
          // A held breath of glow — present, never loud.
          shadowColor: c.stageGlow,
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
            fontFamily: 'Montserrat_600SemiBold',
            fontSize: 14,
            letterSpacing: 2.5,
            textTransform: 'uppercase',
            color: c.stageGlow,
          }}
        >
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}
