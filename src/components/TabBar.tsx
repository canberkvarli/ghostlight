import { forwardRef, useEffect } from 'react';
import { Pressable, Text, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { barShift, showBar, useBarIsAside } from '../lib/barScroll';
import { useSession } from '../lib/useSession';
import { useTheme } from '../theme/ThemeContext';

/** The bar's height, its lift above the home indicator, and the room a root screen leaves for it. */
export const TAB_BAR_H = 66;
export const TAB_BAR_LIFT = 26;
export const TAB_BAR_SPACE = TAB_BAR_H + TAB_BAR_LIFT + 14;

/** The room a scrolling list leaves under itself for the bar: the bar's height, its lift and the home indicator under it. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_SPACE + insets.bottom;
}

const SANS_B = 'BricolageGrotesque_600SemiBold';

/**
 * The rooms, in the order of the bar. Three are on it. The board is a room
 * still, so every link, reminder and notification that opens it lands in a
 * stack of its own with a way back, but it has no button: its auditions are
 * at the top of the Book, and the Book's button is lit while you are in it.
 */
export const TAB_ROOMS: { name: string; href: Href; label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap; offBar?: boolean; lights?: string }[] = [
  // Group-qualified, so a shared route (the book is in every room) cannot be mistaken for another room's.
  { name: 'search', href: '/(search)/search' as Href, label: 'Search', icon: 'search-outline', active: 'search' },
  { name: 'book', href: '/(book)/saves' as Href, label: 'Book', icon: 'bookmark-outline', active: 'bookmark' },
  { name: 'board', href: '/(board)/auditions' as Href, label: 'Board', icon: 'calendar-outline', active: 'calendar', offBar: true, lights: 'book' },
  { name: 'scene', href: '/(scene)/rehearse' as Href, label: 'Scene', icon: 'people-outline', active: 'people' },
];

/**
 * Three rooms on one bar. The triggers are declared in the layout and handed in as
 * children, because the navigator reads its rooms from the element tree. A
 * floating glass pill over the stage, inset from the sides, lifted above the
 * home indicator, with the active room an ink pill inside it and its icon and
 * label in gel yellow (yellow on ink, which is the one place yellow is for).
 * It steps away when a page scrolls down and is back when it scrolls up. The
 * reader and the rehearsal take the whole stage; the bar steps out for them.
 */
export const TabBar = forwardRef<View, ViewProps>(function TabBar({ children, ...props }, ref) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  const segments = useSegments() as string[];
  const leaf = segments[segments.length - 1] ?? '';
  const inReader = segments.includes('read');
  const inRehearsal = segments.includes('rehearse') && leaf === '[id]';
  // The triggers stay mounted even while the bar is off: the navigator reads its rooms from them.
  const aside = useBarIsAside();
  const hidden = !isAuthenticated || inReader || inRehearsal || aside;
  const room = segments.join('/');
  useEffect(() => { showBar(); }, [room]);
  // Off for the reader and the rehearsal: a fade, on the same thread as the scroll.
  const gone = useSharedValue(hidden ? 1 : 0);
  useEffect(() => { gone.value = withTiming(hidden ? 1 : 0, { duration: 200 }); }, [hidden, gone]);
  const away = TAB_BAR_H + TAB_BAR_LIFT + insets.bottom + 12;
  const shifted = useAnimatedStyle(() => ({
    transform: [{ translateY: barShift.value * away + gone.value * 12 }],
    opacity: (1 - barShift.value * 0.4) * (1 - gone.value),
  }));
  return (
    <Animated.View ref={ref} {...props} pointerEvents={hidden ? 'none' : 'box-none'}
      style={[shifted, { position: 'absolute', left: 16, right: 16, bottom: insets.bottom + TAB_BAR_LIFT }]}>
      <View style={{
        height: TAB_BAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, borderRadius: 28, overflow: 'hidden',
        borderWidth: 1, borderColor: c.isLight ? 'rgba(21,17,15,0.16)' : 'rgba(247,243,236,0.14)',
        shadowColor: '#000', shadowOpacity: c.isLight ? 0.12 : 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
      }}>
        <BlurView intensity={c.isLight ? 50 : 40} tint={c.isLight ? 'light' : 'dark'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.isLight ? 'rgba(253,251,247,0.66)' : 'rgba(30,22,18,0.6)' }} />
        {/* The triggers come in as children, declared in the layout: the navigator reads its rooms from them. */}
        {children}
      </View>
    </Animated.View>
  );
});

/** One room's button. The trigger hands it `isFocused` and the press. */
export const RoomButton = forwardRef<View, { label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap; isFocused?: boolean; alsoLit?: boolean; onPress?: () => void } & ViewProps>(
  function RoomButton({ label, icon, active, isFocused: focused = false, alsoLit = false, onPress, ...rest }, ref) {
    const { colors: c } = useTheme();
    // Lit for a room that lives under this one without a button of its own.
    const isFocused = focused || alsoLit;
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
        <Ionicons name={isFocused ? active : icon} size={20} color={isFocused ? c.yellow : c.foreground} style={isFocused ? undefined : { opacity: 0.72 }} />
        <Text style={{ fontFamily: SANS_B, fontSize: 10, color: isFocused ? c.yellow : c.foreground, opacity: isFocused ? 1 : 0.72 }}>{label}</Text>
      </Pressable>
    );
  },
);
