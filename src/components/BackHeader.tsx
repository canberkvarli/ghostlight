import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/ThemeContext';

/**
 * The way back, top-left on every screen except Search (handoff §5): a chevron
 * and a small uppercase label naming where it goes (SEARCH, RESULTS, BACK). The
 * chevron uses the quiet chrome grey, not the muted foreground.
 */
export function BackHeader({
  label,
  onPress,
  right,
}: {
  label: string;
  onPress: () => void;
  right?: React.ReactNode;
}) {
  const { colors: c } = useTheme();
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Back to ${label}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingRight: 10 }}
      >
        <Ionicons name="chevron-back" size={20} color={c.mutedForeground} />
        {/* Sentence case, untracked. The uppercase-and-spaced version was
            Montserrat's idea of a back label; Bricolage has enough character at
            13pt that shouting the destination just makes the corner loud. */}
        <Text
          style={{
            fontFamily: 'BricolageGrotesque_600SemiBold',
            fontSize: 13,
            color: c.mutedForeground,
          }}
        >
          {label}
        </Text>
      </Pressable>
      {right ?? null}
    </View>
  );
}
