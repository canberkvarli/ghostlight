import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, Easing } from 'react-native-reanimated';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { Sketch } from '../src/components/Sketches';
import { Still, takeHref } from '../src/components/TapesShelf';
import { useTakeList } from '../src/hooks/useCallboard';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useTheme } from '../src/theme/ThemeContext';
import { useAuditions } from '../src/hooks/useAuditions';
import { useFavorites } from '../src/hooks/useFavorites';
import { useSession } from '../src/lib/useSession';
import { loadRecents, type RecentPiece } from '../src/lib/recents';
import { FREE_TAPE, lastTapePiece, SLATE_TAPE } from '../src/lib/takes';
import { tapeDue } from '../src/lib/callboard';
import { tapeHref } from '../src/lib/tapeFor';
import { clockLabel, dayLabel } from '../src/lib/when';

const SERIF = 'InstrumentSerif_400Regular';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const CAPS = 'BricolageGrotesque_700Bold';
const EASE = Easing.out(Easing.cubic);

interface Piece { id: string; name: string; source: string }
const SLATE: Piece = { id: SLATE_TAPE, name: 'Slate', source: 'Your name, height and town' };
const NONE: Piece = { id: FREE_TAPE, name: 'No script', source: 'Your own sides, no prompter' };

/**
 * Tape: the page the Tape tab opens.
 *
 * What you are taping, as one card that opens a list (the dropdown), and
 * the button to start right under it. Then anything due this week, then
 * your takes. Starting swaps this page for the camera rather than opening
 * the camera over it: a live camera over a sheet is what went black on
 * 2026-11-10. Holding the Tape tab skips the page.
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
  const { data: book } = useFavorites(isAuthenticated);
  const [recents, setRecents] = useState<RecentPiece[]>([]);
  const [picking, setPicking] = useState(false);

  // What the card says: the piece last taped, or last read, or none.
  const [piece, setPiece] = useState<Piece>(NONE);
  useEffect(() => {
    void (async () => {
      const list: RecentPiece[] = await loadRecents().catch(() => []);
      setRecents(list);
      const id = (await lastTapePiece()) ?? list[0]?.id ?? FREE_TAPE;
      if (id === SLATE_TAPE) return setPiece(SLATE);
      if (id === FREE_TAPE) return setPiece(NONE);
      const r = list.find((x) => x.id === id);
      const t = takes.find((x) => x.pieceId === id);
      setPiece({ id, name: r?.character ?? t?.character ?? 'This piece', source: r?.source ?? t?.source ?? '' });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lately = useMemo(() => recents.slice(0, 6).map((r) => ({ id: r.id, name: r.character, source: r.source })), [recents]);
  const inBook = useMemo(() => {
    const seen = new Set(lately.map((p) => p.id));
    return (book ?? []).filter((m) => !seen.has(String(m.id))).slice(0, 30).map((m) => ({ id: String(m.id), name: m.character, source: m.source }));
  }, [book, lately]);

  const due = useMemo(() => (auditions ?? []).filter((a) => tapeDue(a)).sort((x, y) => Date.parse(x.when!) - Date.parse(y.when!)), [auditions]);
  const start = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Swapped for the camera, not stacked under it.
    router.replace({ pathname: '/tape/[id]', params: { id: piece.id } } as Href);
  };
  const shown = takes.filter((t) => !kept || t.starred);
  const keptCount = takes.filter((t) => t.starred).length;
  const gap = 14;
  const cell = (width - 24 * 2 - gap) / 2;

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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 38, lineHeight: 44, color: c.foreground }}>Tape</Text>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close"
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: c.foreground + '14', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name="close" size={19} color={c.foreground} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
          {/* What you are taping: the dropdown. */}
          <Animated.View entering={FadeInDown.duration(340).easing(EASE)}>
            <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setPicking(true); }} accessibilityRole="button"
              accessibilityLabel={`Taping ${piece.name}. Change it.`}
              style={({ pressed }) => ({ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 16, borderRadius: 18, backgroundColor: c.paper, borderWidth: 1.5, borderColor: c.cardBorder, transform: [{ scale: pressed ? 0.99 : 1 }], opacity: pressed ? 0.9 : 1 })}>
              <Sketch name={piece.id === SLATE_TAPE ? 'masks' : piece.id === FREE_TAPE ? 'scriptPages' : 'tripod'} size={56} stroke={c.paperInk} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: CAPS, fontSize: 10.5, letterSpacing: 1.3, textTransform: 'uppercase', color: c.accentText }}>Taping</Text>
                <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: SERIF, fontSize: 26, lineHeight: 30, color: c.paperInk }}>{piece.name}</Text>
                {piece.source ? <Text numberOfLines={1} style={{ fontFamily: SANS, fontSize: 13, color: c.paperMuted }}>{piece.source}</Text> : null}
              </View>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.paperInk + '12', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="chevron-down" size={17} color={c.paperInk} />
              </View>
            </Pressable>

            {/* The way in, right under it. */}
            <Pressable onPress={start} accessibilityRole="button" accessibilityLabel={`Start taping ${piece.name}`}
              style={({ pressed }) => ({ marginTop: 12, height: 62, borderRadius: 999, backgroundColor: c.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' }} />
              <Text style={{ fontFamily: SANS_B, fontSize: 17.5, color: '#fff' }}>Start taping</Text>
            </Pressable>
            <StageDirection style={{ marginTop: 10, textAlign: 'center' }}>(say “action” to roll, “cut” to stop.)</StageDirection>
          </Animated.View>

          {/* Due this week, still to send. */}
          {due.length ? (
            <View style={{ marginTop: 30 }}>
              <Text style={{ fontFamily: CAPS, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: c.mutedForeground, marginBottom: 6 }}>Due this week</Text>
              {due.map((a, i) => (
                <Animated.View key={a.id} entering={FadeInDown.delay(80 + i * 60).duration(320)}>
                  <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); router.replace(tapeHref(a)); }} accessibilityRole="button"
                    accessibilityLabel={`Tape ${a.project}, due ${dayLabel(a.when!)} ${clockLabel(a.when!)}`}
                    style={({ pressed }) => ({ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.divider, opacity: pressed ? 0.6 : 1 })}>
                    <Sketch name="clapper" size={40} stroke={c.foreground} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 21, color: c.foreground }}>{a.project}</Text>
                      <Text numberOfLines={1} style={{ fontFamily: SANS, fontSize: 13, color: c.mutedForeground }}>Due {dayLabel(a.when!)} {clockLabel(a.when!)}{a.role ? ` · ${a.role}` : ''}</Text>
                    </View>
                    <Ionicons name="videocam" size={17} color={c.accentText} />
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          ) : null}

          {/* Your takes. */}
          <View style={{ marginTop: 30 }}>
            {takes.length === 0 ? (
              <Animated.View entering={FadeIn.duration(360)} style={{ alignItems: 'center', paddingTop: 10 }}>
                <Sketch name="tripod" size={Math.min(150, width * 0.4)} stroke={c.foreground} />
                <Text style={{ marginTop: 18, fontFamily: SERIF, fontSize: 26, color: c.foreground }}>Your takes land here</Text>
                <StageDirection style={{ marginTop: 6, textAlign: 'center' }}>(on this phone only. nothing is uploaded.)</StageDirection>
              </Animated.View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <Text style={{ fontFamily: SERIF, fontSize: 26, color: c.foreground }}>Your takes</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {filter(`All ${takes.length}`, !kept, () => setKept(false))}
                    {filter(`Kept ${keptCount}`, kept, () => setKept(true))}
                  </View>
                </View>
                {shown.length === 0 ? (
                  <StageDirection style={{ paddingTop: 16, textAlign: 'center' }}>(nothing kept yet. star a take to keep it.)</StageDirection>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
                    {shown.map((t, i) => (
                      <Animated.View key={t.id} entering={FadeInDown.delay(Math.min(i, 10) * 35).duration(300)}>
                        <Still take={t} width={cell} onPress={() => { Haptics.selectionAsync().catch(() => {}); router.replace(takeHref(t)); }} />
                      </Animated.View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      {picking ? (
        <PiecePicker
          current={piece.id}
          lately={lately}
          inBook={inBook}
          onClose={() => setPicking(false)}
          onPick={(p) => { Haptics.selectionAsync().catch(() => {}); setPiece(p); setPicking(false); }}
        />
      ) : null}
    </View>
  );
}

/** The dropdown's list: a sheet up from the foot, Lately, then the Book, then the slate and none. */
function PiecePicker({ current, lately, inBook, onClose, onPick }: { current: string; lately: Piece[]; inBook: Piece[]; onClose: () => void; onPick: (p: Piece) => void }) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const row = (p: Piece, icon?: React.ComponentProps<typeof Ionicons>['name']) => {
    const on = p.id === current;
    return (
      <Pressable key={p.id} onPress={() => onPick(p)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 22, backgroundColor: pressed || on ? c.foreground + '0d' : 'transparent' })}>
        {icon ? <Ionicons name={icon} size={18} color={on ? c.accentText : c.mutedForeground} /> : <View style={{ width: 18 }} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 21, color: c.foreground }}>{p.name}</Text>
          {p.source ? <Text numberOfLines={1} style={{ fontFamily: SANS, fontSize: 12.5, color: c.mutedForeground }}>{p.source}</Text> : null}
        </View>
        {on ? <Ionicons name="checkmark" size={19} color={c.accentText} /> : null}
      </Pressable>
    );
  };
  const label = (t: string) => (
    <Text style={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 4, fontFamily: CAPS, fontSize: 10.5, letterSpacing: 1.3, textTransform: 'uppercase', color: c.mutedForeground }}>{t}</Text>
  );
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,5,4,0.45)' }}>
        <Pressable onPress={onClose} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View entering={FadeInDown.duration(320).easing(EASE)} exiting={FadeOutDown.duration(200)}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: height * 0.78, backgroundColor: c.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 8 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginTop: 10 }} />
        <Text style={{ paddingHorizontal: 22, paddingTop: 14, fontFamily: SERIF, fontSize: 28, color: c.foreground }}>What are you taping?</Text>
        <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
          {lately.length ? label('Lately') : null}
          {lately.map((p) => row(p, 'time-outline'))}
          {inBook.length ? label('In your Book') : null}
          {inBook.map((p) => row(p, 'bookmark-outline'))}
          {label('Or')}
          {row(SLATE, 'person-circle-outline')}
          {row(NONE, 'create-outline')}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
