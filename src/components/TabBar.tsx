import { forwardRef, useEffect } from 'react';
import { Pressable, Text, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { barShift, showBar, useBarIsAside } from '../lib/barScroll';
import { useSession } from '../lib/useSession';
import { loadRecents } from '../lib/recents';
import { FREE_TAPE, lastTapePiece } from '../lib/takes';
import { useTabBadges } from '../hooks/useCallboard';
import { useTheme } from '../theme/ThemeContext';
import { monologueRoomsShown, useLocale } from '../i18n';

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
  // Turkish has one room, the scene partner (src/i18n): no bar to switch rooms with.
  const oneRoom = !monologueRoomsShown(useLocale());
  const hidden = !isAuthenticated || inReader || inRehearsal || aside || oneRoom;
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
        <TapeButton />
      </View>
    </Animated.View>
  );
});

/** One room's button. The trigger hands it `isFocused` and the press. */
export const RoomButton = forwardRef<View, { label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap; isFocused?: boolean; alsoLit?: boolean; badge?: number; onPress?: () => void } & ViewProps>(
  function RoomButton({ label, icon, active, isFocused: focused = false, alsoLit = false, badge, onPress, ...rest }, ref) {
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
        accessibilityLabel={badge ? `${label}, ${badge} due this week` : label}
        style={{ flex: 1, height: 52, borderRadius: 26, backgroundColor: isFocused ? c.ink : 'transparent', alignItems: 'center', justifyContent: 'center', gap: 2 }}
      >
        <View>
          <Ionicons name={isFocused ? active : icon} size={20} color={isFocused ? c.yellow : c.foreground} style={isFocused ? undefined : { opacity: 0.72 }} />
          {badge ? <Badge n={badge} /> : null}
        </View>
        <Text style={{ fontFamily: SANS_B, fontSize: 10, color: isFocused ? c.yellow : c.foreground, opacity: isFocused ? 1 : 0.72 }}>{label}</Text>
      </Pressable>
    );
  },
);

/**
 * Tape: the Tape page, where the button to start is and the takes land.
 * Held, it is a door straight to the camera, on the piece you last taped,
 * or last read, or on nothing at all for your own sides.
 */
function TapeButton() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const { unsent } = useTabBadges();
  const open = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const id = (await lastTapePiece()) ?? (await loadRecents())[0]?.id ?? FREE_TAPE;
    router.push({ pathname: '/tape/[id]', params: { id } });
  };
  return (
    <Pressable
      // A tap: the Tape page (the button to start, what is due, your takes).
      onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push('/tapes' as Href); }}
      // Held: straight to the camera, for those who know.
      onLongPress={() => { void open(); }}
      accessibilityHint="Hold to go straight to the camera"
      accessibilityRole="button"
      accessibilityLabel={unsent ? `Tape yourself. ${unsent} kept ${unsent === 1 ? 'take is' : 'takes are'} waiting to send` : 'Tape yourself'}
      style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 2, opacity: pressed ? 0.7 : 1 })}
    >
      <View>
        <Ionicons name="videocam-outline" size={20} color={c.foreground} style={{ opacity: 0.72 }} />
        {unsent ? <Badge n={unsent} /> : <View style={{ position: 'absolute', top: -1, right: -3, width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary }} />}
      </View>
      <Text style={{ fontFamily: SANS_B, fontSize: 10, color: c.foreground, opacity: 0.72 }}>Tape</Text>
    </Pressable>
  );
}

/** A count on a tab: sharp (it is a mark, not a button), the brand orange. */
function Badge({ n }: { n: number }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ position: 'absolute', top: -6, right: -11, minWidth: 16, height: 16, paddingHorizontal: 4, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: SANS_B, fontSize: 10, color: '#fff' }}>{n > 9 ? '9+' : n}</Text>
    </View>
  );
}
