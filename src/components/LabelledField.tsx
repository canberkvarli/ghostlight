import { useEffect, useState } from 'react';
import { TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeContext';

/**
 * A field whose label rises out of the way instead of being erased by the first
 * character you type. A placeholder is the label, right up until you need it:
 * once both fields hold text, "email" and "password" are two indistinguishable
 * lines and the only way to check which is which is to clear one.
 *
 * The rule lights in the house orange on focus. The label moves on the UI
 * thread, so holding a key down never stutters it.
 */
export function LabelledField({
  label,
  style,
  accessory,
  value,
  ...props
  // `style` here dresses the wrapping View, not the input, so it has to be
  // taken off TextInput's props before the intersection or it arrives typed as
  // a TextStyle and lands on a View that cannot accept one.
}: Omit<React.ComponentProps<typeof TextInput>, 'style'> & {
  label: string;
  style?: StyleProp<ViewStyle>;
  accessory?: React.ReactNode;
}) {
  const { colors: c } = useTheme();
  const [focused, setFocused] = useState(false);
  // Up when focused or filled; down only when empty and untouched, which is the
  // one moment the label is standing in for a placeholder.
  const up = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    const shouldLift = focused || !!value;
    up.value = withTiming(shouldLift ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [focused, value, up]);

  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -up.value * 18 }],
    fontSize: 16 - up.value * 5,
    opacity: 0.55 + up.value * 0.45,
  }));

  return (
    <View style={style}>
      <View style={{ height: 20 }} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <TextInput
          {...props}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selectionColor={c.accentText}
          style={{
            flex: 1,
            height: 34,
            color: c.foreground,
            fontFamily: 'BricolageGrotesque_500Medium',
            fontSize: 16,
            paddingHorizontal: 2,
            paddingBottom: 4,
          }}
        />
        {accessory ? <View style={{ paddingBottom: 8, paddingLeft: 8 }}>{accessory}</View> : null}
      </View>
      <View
        style={{
          height: focused ? 1.5 : 1,
          backgroundColor: focused ? c.accentText : c.border,
        }}
      />
      {/* Absolute so it can travel over the input without pushing it. */}
      <Animated.Text
        pointerEvents="none"
        style={[
          labelStyle,
          {
            position: 'absolute',
            left: 2,
            bottom: 9,
            fontFamily: 'BricolageGrotesque_500Medium',
            letterSpacing: 0.4,
            color: focused ? c.accentText : c.mutedForeground,
          },
        ]}
      >
        {label}
      </Animated.Text>
    </View>
  );
}
