import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { mediumPalette, type Medium } from '../theme/medium';

/**
 * The two houses, as a segmented pill. Theatre lights amber; Film & TV lights
 * violet — each segment glows in its own house colour when it's the one you're
 * standing in, so the toggle itself previews where you're about to go.
 */

const SEGMENTS: { medium: Medium; label: string }[] = [
  { medium: 'theatre', label: 'Plays' },
  { medium: 'screen', label: 'Film & TV' },
];

export function MediumToggle({
  medium,
  onChange,
}: {
  medium: Medium;
  onChange: (m: Medium) => void;
}) {
  const { colors: c } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.card,
        padding: 4,
      }}
    >
      {SEGMENTS.map((seg) => {
        const active = seg.medium === medium;
        const glow = mediumPalette(seg.medium).glow;
        return (
          <Pressable
            key={seg.medium}
            onPress={() => onChange(seg.medium)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: active ? mediumPalette(seg.medium).chipFill : 'transparent',
              borderWidth: 1,
              borderColor: active ? glow : 'transparent',
            }}
          >
            <Text
              style={{
                fontFamily: 'Montserrat_600SemiBold',
                fontSize: 12,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: active ? glow : c.mutedForeground,
              }}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
