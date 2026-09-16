import { useEffect, useState } from 'react';
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
 * v2 makes the five seconds visible. The arrow disc on the Undo pill counts
 * 5→1, so the bar says how long you have rather than sitting there looking
 * permanent and then vanishing mid-thought. That is one `setState` per second,
 * not per frame — the only clock in the app that touches JavaScript at all.
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
  const { colors: c } = useTheme();
  const [left, setLeft] = useState(Math.ceil(duration / 1000));

  useEffect(() => {
    const t = setTimeout(onExpire, duration);
    const tick = setInterval(() => setLeft((n) => Math.max(1, n - 1)), 1000);
    return () => {
      clearTimeout(t);
      clearInterval(tick);
    };
  }, [onExpire, duration]);

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(160)}
      style={{ position: 'absolute', left: 16, right: 16, bottom: 28 }}
    >
      {/* The gel block, drawn rather than shadowed — see PaperCard. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          right: -6,
          bottom: -6,
          borderRadius: 999,
          backgroundColor: c.yellow,
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: c.ink,
          backgroundColor: c.paper,
          paddingVertical: 8,
          paddingLeft: 18,
          paddingRight: 8,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: 'BricolageGrotesque_500Medium',
            fontSize: 14,
            color: c.paperInk,
          }}
        >
          {label}
        </Text>
        <Pressable
          onPress={onUndo}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Undo. ${left} second${left === 1 ? '' : 's'} left`}
          style={{
            height: 36,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 14,
            paddingRight: 4,
            borderRadius: 999,
            backgroundColor: colors.ink,
          }}
        >
          <Text
            style={{ fontFamily: 'BricolageGrotesque_700Bold', fontSize: 13, color: '#f7f3ec' }}
          >
            Undo
          </Text>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              backgroundColor: c.yellow,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{ fontFamily: 'CourierPrime_400Regular', fontSize: 12, color: colors.ink }}
            >
              {left}
            </Text>
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}
