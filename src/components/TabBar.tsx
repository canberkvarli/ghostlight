import { forwardRef } from 'react';
import { Pressable, Text, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments, type Href } from 'expo-router';
import { TabTrigger } from 'expo-router/ui';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/ThemeContext';

/** The bar's height, its lift above the home indicator, and the room a root screen leaves for it. */
export const TAB_BAR_H = 66;
export const TAB_BAR_LIFT = 26;
export const TAB_BAR_SPACE = TAB_BAR_H + TAB_BAR_LIFT + 14;

const SANS_B = 'BricolageGrotesque_600SemiBold';

/** The four rooms, in the order of the bar. */
export const TAB_ROOMS: { name: string; href: Href; label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'search', href: '/search', label: 'Search', icon: 'search-outline', active: 'search' },
  { name: 'book', href: '/saves', label: 'Book', icon: 'bookmark-outline', active: 'bookmark' },
  { name: 'board', href: '/auditions', label: 'Board', icon: 'calendar-outline', active: 'calendar' },
  { name: 'scene', href: '/rehearse', label: 'Scene', icon: 'people-outline', active: 'people' },
];

/**
 * Four rooms, one bar. A floating pill over the stage, inset from the sides,
 * lifted above the home indicator, with the active room an ink pill inside it
 * and its icon and label in gel yellow (yellow on ink, which is the one place
 * yellow is for). The reader and the rehearsal take the whole stage; the bar
 * steps out for them.
 */
export const TabBar = forwardRef<View, ViewProps>(function TabBar(props, ref) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const leaf = segments[segments.length - 1] ?? '';
  const inReader = segments.includes('read');
  const inRehearsal = segments.includes('rehearse') && leaf === '[id]';
  if (inReader || inRehearsal) return <View ref={ref} {...props} style={{ display: 'none' }} />;
  return (
    <View ref={ref} {...props} pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + TAB_BAR_LIFT }}>
      <View style={{ height: TAB_BAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, borderRadius: 28, borderWidth: 2, borderColor: c.ink, backgroundColor: c.card }}>
        {TAB_ROOMS.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
            <RoomButton label={t.label} icon={t.icon} active={t.active} />
          </TabTrigger>
        ))}
      </View>
    </View>
  );
});

/** One room's button. The trigger hands it `isFocused` and the press. */
const RoomButton = forwardRef<View, { label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap; isFocused?: boolean; onPress?: () => void } & ViewProps>(
  function RoomButton({ label, icon, active, isFocused = false, onPress, ...rest }, ref) {
    const { colors: c } = useTheme();
    return (
      <Pressable
        ref={ref}
        {...rest}
        onPress={() => { if (!isFocused) Haptics.selectionAsync().catch(() => {}); onPress?.(); }}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
        style={{ flex: 1, height: 52, borderRadius: 26, backgroundColor: isFocused ? c.ink : 'transparent', alignItems: 'center', justifyContent: 'center', gap: 2 }}
      >
        <Ionicons name={isFocused ? active : icon} size={20} color={isFocused ? c.yellow : c.mutedForeground} />
        <Text style={{ fontFamily: SANS_B, fontSize: 10, color: isFocused ? c.yellow : c.mutedForeground }}>{label}</Text>
      </Pressable>
    );
  },
);
