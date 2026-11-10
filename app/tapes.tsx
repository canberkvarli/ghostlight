import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { GhostLight } from '../src/components/GhostLight';
import { Still, takeHref } from '../src/components/TapesShelf';
import { useTakeList } from '../src/hooks/useCallboard';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useTheme } from '../src/theme/ThemeContext';
import { useAuditions } from '../src/hooks/useAuditions';
import { useSession } from '../src/lib/useSession';
import { loadRecents, type RecentPiece } from '../src/lib/recents';
import { FREE_TAPE, lastTapePiece, SLATE_TAPE } from '../src/lib/takes';
import { tapeDue } from '../src/lib/callboard';
import { tapeHref } from '../src/lib/tapeFor';
import { clockLabel, dayLabel } from '../src/lib/when';

const SERIF = 'InstrumentSerif_400Regular';
const SANS_B = 'BricolageGrotesque_600SemiBold';

/**
 * Tape: the page the Tape tab opens. The button to start at the top, named
 * for the piece you were on; under it, any self-tape due this week; then
 * every take on the phone. A take opens in the tape room, playing, with
 * Again, Trim, Keep, Save and Send. Holding the Tape tab skips this page and
 * goes straight to the camera.
 */
export default function TapesScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const { width } = useWindowDimensions();
  const takes = useTakeList();
  const [kept, setKept] = useState(false);
  const { isAuthenticated } = useSession();
  const { data: auditions } = useAuditions(isAuthenticated);

  // The piece the button names: the one last taped, or last read, or none.
  const [piece, setPiece] = useState<{ id: string; name: string | null }>({ id: FREE_TAPE, name: null });
  useEffect(() => {
    void (async () => {
      const recents: RecentPiece[] = await loadRecents().catch(() => []);
      const id = (await lastTapePiece()) ?? recents[0]?.id ?? FREE_TAPE;
      const name = id === SLATE_TAPE ? 'my slate'
        : id === FREE_TAPE ? null
        : recents.find((r) => r.id === id)?.character ?? takes.find((t) => t.pieceId === id)?.character ?? null;
      setPiece({ id, name });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takes.length]);
  const due = useMemo(() => (auditions ?? []).filter((a) => tapeDue(a)).sort((x, y) => Date.parse(x.when!) - Date.parse(y.when!)), [auditions]);
  const start = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.push({ pathname: '/tape/[id]', params: { id: piece.id } } as Href);
  };
  const shown = takes.filter((t) => !kept || t.starred);
  const keptCount = takes.filter((t) => t.starred).length;
  const gap = 12;
  const cell = (width - 24 * 2 - gap * 2) / 3;

  const filter = (label: string, on: boolean, press: () => void) => (
    <Pressable key={label} onPress={() => { Haptics.selectionAsync().catch(() => {}); press(); }} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ height: 32, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? c.foreground : c.border, backgroundColor: on ? c.foreground : 'transparent', justifyContent: 'center' }}>
      <Text style={{ fontFamily: SANS_B, fontSize: 13, color: on ? c.background : c.foreground }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 6 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 40, color: c.foreground }}>Tape</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close"
              style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: c.foreground + '14', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name="close" size={18} color={c.foreground} />
            </Pressable>
          </View>
        </View>
        {/* The button to start. */}
        <Animated.View entering={FadeInDown.duration(320)} style={{ paddingHorizontal: 24, paddingTop: 6 }}>
          <Pressable onPress={start} accessibilityRole="button" accessibilityLabel={piece.name ? `Tape ${piece.name}` : 'Tape yourself'}
            style={({ pressed }) => ({ height: 60, borderRadius: 999, backgroundColor: c.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <Ionicons name="videocam" size={20} color="#fff" />
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: SANS_B, fontSize: 17, color: '#fff' }}>{piece.name ? `Tape ${piece.name}` : 'Tape'}</Text>
          </Pressable>
        </Animated.View>

        {/* Due this week, still to send. */}
        {due.map((a) => (
          <Pressable key={a.id} onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push(tapeHref(a)); }} accessibilityRole="button"
            accessibilityLabel={`Tape due ${dayLabel(a.when!)} ${clockLabel(a.when!)}, ${a.project}`}
            style={({ pressed }) => ({ marginHorizontal: 24, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: c.border, opacity: pressed ? 0.7 : 1 })}>
            <Ionicons name="time-outline" size={18} color={c.accentText} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 19, color: c.foreground }}>{a.project}</Text>
              <Text numberOfLines={1} style={{ fontFamily: SANS_B, fontSize: 12.5, color: c.mutedForeground }}>Tape due {dayLabel(a.when!)} {clockLabel(a.when!)}{a.role ? ` · ${a.role}` : ''}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
          </Pressable>
        ))}

        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 14 }}>
          {filter(`All · ${takes.length}`, !kept, () => setKept(false))}
          {filter(`Kept · ${keptCount}`, kept, () => setKept(true))}
        </View>
        {shown.length === 0 ? (
          <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 }}>
            <GhostLight size={24} />
            <StageDirection style={{ marginTop: 20, textAlign: 'center' }}>
              {kept ? '(nothing kept yet. star a take to keep it.)' : '(say “action”, act, say “cut”. your takes land here.)'}
            </StageDirection>
          </Animated.View>
        ) : (
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap, paddingHorizontal: 24, paddingBottom: 32 }}>
            {shown.map((t, i) => (
              <Animated.View key={t.id} entering={FadeInDown.delay(Math.min(i, 12) * 30).duration(280)}>
                <Still take={t} width={cell} onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push(takeHref(t)); }} />
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
