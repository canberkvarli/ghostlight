import { useState } from 'react';
import { Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeContext';

/**
 * A field with its name above it in small caps and a rule under it that
 * takes the accent while you are in it. The name used to float down into
 * the box as a placeholder and lift when tapped, and the caret sat on it
 * while it moved; now the name stays put and the box's own placeholder
 * does the standing in, which the caret knows to clear.
 */
export function LabelledField({
  label,
  style,
  accessory,
  value,
  onFocus,
  onBlur,
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
  return (
    <View style={style}>
      <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: focused ? c.accentText : c.mutedForeground }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <TextInput
          placeholderTextColor={c.chevron}
          {...props}
          value={value}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          selectionColor={c.accentText}
          style={{
            flex: 1,
            height: 40,
            color: c.foreground,
            fontFamily: 'BricolageGrotesque_500Medium',
            fontSize: 16,
            paddingHorizontal: 2,
            paddingTop: 6,
            paddingBottom: 6,
          }}
        />
        {accessory ? <View style={{ paddingBottom: 10, paddingLeft: 8 }}>{accessory}</View> : null}
      </View>
      <View style={{ height: focused ? 1.5 : 1, backgroundColor: focused ? c.accentText : c.border }} />
    </View>
  );
}
