import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { GhostLight } from '../src/components/GhostLight';
import { useCallboard } from '../src/hooks/useCallboard';
import { useTonight } from '../src/hooks/useTonight';
import { isFresh, loadRecents, type RecentPiece } from '../src/lib/recents';
import { track } from '../src/lib/analytics';
import { useTheme } from '../src/theme/ThemeContext';
import { useStageMotion } from '../src/hooks/useStageMotion';
import type { Call, CallKind } from '../src/lib/callboard';
import type { Medium } from '../src/theme/medium';

const SERIF = 'InstrumentSerif_400Regular';
const SANS = 'BricolageGrotesque_500Medium';

const ICON: Record<CallKind, React.ComponentProps<typeof Ionicons>['name']> = {
  tape: 'videocam',
  audition: 'calendar-outline',
  callback: 'sparkles-outline',
  after: 'chatbubble-outline',
  tonight: 'moon-outline',
  left: 'bookmark-outline',
};

/**
 * The Callboard: what is waiting, on one page, the way a stage door has a
 * board with the calls pinned to it. A dot on what is new since you last
 * looked; a line goes by itself once it is done. Opened from the bell on the
 * home.
 */
export default function CallboardScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const { medium: mediumParam } = useLocalSearchParams<{ medium?: string }>();
  const medium: Medium = mediumParam === 'screen' ? 'screen' : 'theatre';
  const tonightPiece = useTonight(medium);
  const [left, setLeft] = useState<RecentPiece | undefined>();
  useEffect(() => { loadRecents().then((r) => setLeft(r.find((p) => p.medium === medium && isFresh(p)))).catch(() => {}); }, [medium]);

  const extras = useMemo(() => ({
    tonight: tonightPiece ? { id: String(tonightPiece.id), character: tonightPiece.character, source: tonightPiece.source } : null,
    left: left ? { id: left.id, character: left.character, medium: left.medium } : null,
    medium,
  }), [tonightPiece, left, medium]);
  const { calls, seeAll, isNew } = useCallboard(extras);

  // What was new when the page opened keeps its dot while you look; the bell clears now.
  const [fresh] = useState(() => new Set<string>());
  useEffect(() => {
    for (const k of calls) if (isNew(k.key)) fresh.add(k.key);
    seeAll();
    track('app_callboard_opened', { lines: calls.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls.length]);

  const open = (call: Call) => {
    Haptics.selectionAsync().catch(() => {});
    track('app_callboard_tapped', { kind: call.kind });
    router.back();
    setTimeout(() => router.push(call.route as Href), 260);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 40, color: c.foreground }}>Callboard</Text>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"
            style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: c.foreground + '14', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name="close" size={18} color={c.foreground} />
          </Pressable>
        </View>

        {calls.length === 0 ? (
          <Animated.View entering={FadeIn.duration(320)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 80 }}>
            <GhostLight size={26} />
            <StageDirection style={{ marginTop: 22, textAlign: 'center' }}>(nothing waiting. the board is clear.)</StageDirection>
          </Animated.View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
            {calls.map((call, i) => (
              <Animated.View key={call.key} entering={FadeInDown.delay(40 * i).duration(320)}>
                <Pressable
                  onPress={() => open(call)}
                  accessibilityRole="button"
                  accessibilityLabel={`${call.title}. ${call.sub}`}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.divider, opacity: pressed ? 0.6 : 1 })}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: call.kind === 'tape' ? c.primary : c.foreground + '10', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={ICON[call.kind]} size={18} color={call.kind === 'tape' ? '#fff' : c.foreground} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 21, lineHeight: 25, color: c.foreground }}>{call.title}</Text>
                    <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: SANS, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground }}>{call.sub}</Text>
                  </View>
                  {fresh.has(call.key) ? <View accessibilityLabel="New" style={{ width: 8, height: 8, backgroundColor: c.primary }} /> : null}
                  <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
