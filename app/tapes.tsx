import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { Sketch } from '../src/components/Sketches';
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
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const ROLL_RED = '#e5484d';
/** The dock at the foot: the record button and its name. */
const DOCK_H = 132;

/**
 * Tape: the page the Tape tab opens.
 *
 * The drawing at the top (a phone on a tripod), anything due this week,
 * then your takes, two to a row. The way in sits at the foot where the thumb
 * is: the same red record button the room has, named for the piece, so the
 * page and the room read as one place. Holding the Tape tab skips the page.
 */
export default function TapesScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
      const name = id === SLATE_TAPE ? 'your slate'
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
  const gap = 14;
  const cell = (width - 24 * 2 - gap) / 2;
  const first = takes.length === 0;

  const filter = (label: string, on: boolean, press: () => void) => (
    <Pressable key={label} onPress={() => { Haptics.selectionAsync().catch(() => {}); press(); }} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ height: 32, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? c.foreground : c.border, backgroundColor: on ? c.foreground : 'transparent', justifyContent: 'center' }}>
      <Text style={{ fontFamily: SANS_B, fontSize: 13, color: on ? c.background : c.foreground }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 4 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 40, color: c.foreground }}>Tape</Text>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close"
            style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: c.foreground + '14', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name="close" size={18} color={c.foreground} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: DOCK_H + insets.bottom + 24, minHeight: first ? height - insets.top - 60 : undefined }}>
          {first ? (
            /* Before the first take: the drawing, and what the room does, in one breath. */
            <Animated.View entering={FadeIn.duration(360)} style={{ alignItems: 'center', paddingHorizontal: 36, paddingTop: height * 0.08 }}>
              <Sketch name="tripod" size={Math.min(200, width * 0.5)} stroke={c.foreground} />
              <Text style={{ marginTop: 26, fontFamily: SERIF, fontSize: 34, lineHeight: 38, letterSpacing: -0.4, color: c.foreground, textAlign: 'center' }}>Your first take</Text>
              <StageDirection style={{ marginTop: 10, textAlign: 'center' }}>(say “action”. act. say “cut”. it lands here.)</StageDirection>
            </Animated.View>
          ) : (
            /* The drawing, small, with the count beside it. */
            <Animated.View entering={FadeIn.duration(300)} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingTop: 8 }}>
              <Sketch name="tripod" size={78} stroke={c.foreground} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: SERIF, fontSize: 28, lineHeight: 32, color: c.foreground }}>
                  {takes.length} {takes.length === 1 ? 'take' : 'takes'}
                </Text>
                <Text style={{ marginTop: 2, fontFamily: SANS, fontSize: 13.5, color: c.mutedForeground }}>
                  {keptCount ? `${keptCount} kept · ` : ''}on this phone only
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Due this week, still to send: a card each, the clapper on it. */}
          {due.map((a, i) => (
            <Animated.View key={a.id} entering={FadeInDown.delay(80 + i * 60).duration(320)}>
              <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push(tapeHref(a)); }} accessibilityRole="button"
                accessibilityLabel={`Tape due ${dayLabel(a.when!)} ${clockLabel(a.when!)}, ${a.project}`}
                style={({ pressed }) => ({ marginHorizontal: 24, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, backgroundColor: c.paper, borderWidth: 1.5, borderColor: c.cardBorder, opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
                <Sketch name="clapper" size={44} stroke={c.paperInk} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: 'BricolageGrotesque_700Bold', fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', color: c.accentText }}>
                    Due {dayLabel(a.when!)} {clockLabel(a.when!)}
                  </Text>
                  <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: SERIF, fontSize: 21, color: c.paperInk }}>{a.project}</Text>
                  {a.role ? <Text numberOfLines={1} style={{ fontFamily: SANS, fontSize: 12.5, color: c.paperMuted }}>{a.role}</Text> : null}
                </View>
                <Ionicons name="videocam" size={18} color={c.accentText} />
              </Pressable>
            </Animated.View>
          ))}

          {!first ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingTop: 26, paddingBottom: 14 }}>
                {filter(`All · ${takes.length}`, !kept, () => setKept(false))}
                {filter(`Kept · ${keptCount}`, kept, () => setKept(true))}
              </View>
              {shown.length === 0 ? (
                <StageDirection style={{ paddingHorizontal: 24, paddingTop: 20, textAlign: 'center' }}>(nothing kept yet. star a take to keep it.)</StageDirection>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, paddingHorizontal: 24 }}>
                  {shown.map((t, i) => (
                    <Animated.View key={t.id} entering={FadeInDown.delay(Math.min(i, 10) * 35).duration(300)}>
                      <Still take={t} width={cell} onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push(takeHref(t)); }} />
                    </Animated.View>
                  ))}
                </View>
              )}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      {/* The dock: the room's own record button, at the thumb, on a fade. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: DOCK_H + insets.bottom }}>
        <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          <Rect x={0} y={0} width={width} height={DOCK_H + insets.bottom}>
            <LinearGradient start={vec(0, 0)} end={vec(0, 56)} colors={[c.background + '00', c.background]} />
          </Rect>
        </Canvas>
        <View style={{ alignItems: 'center', paddingTop: 18 }}>
          <RecordDock onPress={start} label={piece.name ? `Tape ${piece.name}` : 'Tape yourself'} pulse={first} />
        </View>
      </View>
    </View>
  );
}

/** The room's record button, as the way in: a white ring, the red disc, its name under it. */
function RecordDock({ onPress, label, pulse }: { onPress: () => void; label: string; pulse: boolean }) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const breathe = useSharedValue(1);
  useEffect(() => {
    // Before the first take it breathes, once a second or so, to say "here".
    breathe.value = pulse && !reduce ? withRepeat(withSequence(withTiming(0.9, { duration: 900 }), withTiming(1, { duration: 900 })), -1) : withTiming(1);
  }, [pulse, reduce, breathe]);
  const core = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }));
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={12} style={{ alignItems: 'center' }}>
      {({ pressed }) => (
        <>
          <View style={{ width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: c.foreground, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] }}>
            <Animated.View style={[core, { width: 60, height: 60, borderRadius: 30, backgroundColor: ROLL_RED }]} />
          </View>
          <Text numberOfLines={1} style={{ marginTop: 8, maxWidth: 280, fontFamily: SANS_B, fontSize: 14, color: c.foreground }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
