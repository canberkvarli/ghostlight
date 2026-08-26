import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeContext';
import { colors } from '../theme/tokens';

/**
 * The five-second grace period after a destructive tap.
 *
 * Unsaving is one tap and there is no confirm, which is the right trade — a
 * dialog for every unsave is worse than the occasional mistake. This is the
 * other half of that trade: the mistake stays cheap for five seconds.
 *
 * Mounted only while there's something to undo, so the timer restarting on each
 * new removal is just a remount with a fresh `key`.
 */
export function UndoBar({
  label,
  onUndo,
  onExpire,
  duration = 5000,
}: {
  label: string;
  onUndo: () => void;
  onExpire: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onExpire, duration);
    return () => clearTimeout(t);
  }, [onExpire, duration]);

  const { colors: c } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(160)}
      style={{ position: 'absolute', left: 16, right: 16, bottom: 28 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: c.cardBorder,
          backgroundColor: c.card,
          paddingVertical: 14,
          paddingHorizontal: 18,
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontFamily: 'Montserrat_400Regular', fontSize: 14, color: c.foreground }}
        >
          {label}
        </Text>
        <Pressable onPress={onUndo} hitSlop={12} accessibilityRole="button" style={{ paddingLeft: 16 }}>
          <Text
            style={{
              fontFamily: 'Montserrat_600SemiBold',
              fontSize: 13,
              letterSpacing: 2.4,
              textTransform: 'uppercase',
              color: colors.stageGlow,
            }}
          >
            Undo
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
