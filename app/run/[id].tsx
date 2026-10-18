import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { StageBackdrop } from '../../src/components/StageBackdrop';
import { StageDirection } from '../../src/components/StageDirection';
import { PrimaryPill } from '../../src/components/PrimaryPill';
import { Sketch } from '../../src/components/Sketches';
import { GhostLight } from '../../src/components/GhostLight';
import { PrivacyShield } from '../../src/components/PrivacyShield';
import { useStageMotion } from '../../src/hooks/useStageMotion';
import { usePreventCaptureWhileFocused } from '../../src/hooks/usePreventCaptureWhileFocused';
import { useIsFavorited, useMarkStudied, useSavedPiece, useSetOffBook } from '../../src/hooks/useFavorites';
import { useSession } from '../../src/lib/useSession';
import { useGoBack } from '../../src/lib/nav';
import { clock, estimateSeconds, joinUnits, maskFirstLetters, unitsOf } from '../../src/lib/segments';
import { getMonologueById, type Monologue } from '../../src/data/monologues';
import { getMonologue } from '../../src/api/client';
import { apiToMonologue } from '../../src/data/adapt';
import { getOffline } from '../../src/lib/offline';
import { track } from '../../src/lib/analytics';
import { mediumPalette, type Medium } from '../../src/theme/medium';
import { useTheme } from '../../src/theme/ThemeContext';

/**
 * Run it: the rehearsal room, with the house lights down.
 *
 * The page is put away. The words come up on the dark stage one line at a
 * time, the line you are on large and lit, the ones behind it receding, the
 * ones ahead waiting quietly. A tap anywhere on the stage moves you on; a tap
 * on the line brings it back in full when it is hidden. The same three levels
 * as before: words shows the line, hints keeps the first letter of each word,
 * dark leaves only the shape of it. With a cut set, only the cut runs.
 *
 * The site's rehearsal room listens and follows your voice. The phone can,
 * but not from here: speech recognition is a native module and needs a new
 * build, so this room is tap to advance until that build ships. Everything
 * else is the same room.
 */

type Level = 'words' | 'hints' | 'dark';
const LEVELS: { key: Level; label: string; says: string }[] = [
  { key: 'words', label: 'words', says: 'the whole line, every time' },
  { key: 'hints', label: 'hints', says: 'the first letter of each word' },
  { key: 'dark', label: 'dark', says: 'nothing until you ask' },
];

/** The lit line sizes to its length, so a long sentence still fits the stage. */
function lineType(len: number): { fontSize: number; lineHeight: number } {
  if (len > 170) return { fontSize: 16, lineHeight: 24 };
  if (len > 110) return { fontSize: 19, lineHeight: 27 };
  if (len > 60) return { fontSize: 22, lineHeight: 31 };
  return { fontSize: 26, lineHeight: 35 };
}

/** The shape of a line and nothing else: a dot per letter, the spaces kept. */
function shapeOf(text: string): string {
  return text
    .split(/(\s+)/)
    .map((w) => (/^\s+$/.test(w) ? w : '•'.repeat(Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, '').length))))
    .join('');
}

export default function RunScreen() {
  const { id, medium: mediumParam } = useLocalSearchParams<{ id: string; medium?: string }>();
  const router = useRouter();
  const goBack = useGoBack('/search');
  const reduce = useReducedMotion();
  const { height } = useWindowDimensions();
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const medium: Medium = mediumParam === 'screen' ? 'screen' : 'theatre';
  const pal = mediumPalette(medium, c.isLight);
  usePreventCaptureWhileFocused('run');

  const fixture = id ? getMonologueById(id) : undefined;
  const { data: fetched, isLoading } = useQuery<Monologue>({
    queryKey: ['monologue', id],
    enabled: Boolean(id) && !fixture,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        return apiToMonologue(await getMonologue(id!, signal));
      } catch (err) {
        const local = await getOffline(id!);
        if (local) return local;
        throw err;
      }
    },
  });
  const monologue = fixture ?? fetched;

  const { isAuthenticated } = useSession();
  const saved = useSavedPiece(id ?? '', isAuthenticated);
  const favorited = useIsFavorited(id ?? '', isAuthenticated);
  const setOffBook = useSetOffBook();
  const markStudied = useMarkStudied();

  // The lines: the website's units (so a cut made anywhere is this cut), the
  // cut alone when one is set.
  const units = useMemo(() => unitsOf(monologue?.fullText ?? ''), [monologue?.fullText]);
  const cutSrc = saved ?? monologue;
  const cut =
    cutSrc?.cutStart != null && cutSrc?.cutEnd != null && units.length > 0
      ? { start: Math.min(cutSrc.cutStart, cutSrc.cutEnd, units.length - 1), end: Math.min(Math.max(cutSrc.cutStart, cutSrc.cutEnd), units.length - 1) }
      : null;
  const lines = useMemo(() => {
    const picked = cut ? units.slice(cut.start, cut.end + 1) : units;
    return picked.map((u) => u.text);
  }, [units, cut]);
  const seconds = useMemo(
    () => (cut ? estimateSeconds(joinUnits(units, cut.start, cut.end)) : monologue?.duration || estimateSeconds(monologue?.fullText ?? '')),
    [cut, units, monologue],
  );

  const [level, setLevel] = useState<Level>('hints');
  const [phase, setPhase] = useState<'places' | 'run' | 'curtain'>('places');
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const startedAt = useRef<number | null>(null);

  const scroll = useRef<ScrollView>(null);
  const tops = useRef<number[]>([]);
  // The lit line is kept a third of the way down the stage, where the eye
  // rests, so the words come up to meet you rather than running off the foot.
  useEffect(() => {
    if (phase !== 'run') return;
    const y = tops.current[at];
    if (y == null) return;
    scroll.current?.scrollTo({ y: Math.max(0, y - height * 0.3), animated: !reduce });
  }, [at, phase, height, reduce]);

  // How far through: a thin rule under the title fills as you go.
  const progress = useSharedValue(0);
  useEffect(() => {
    const to = lines.length ? Math.min(1, at / lines.length) : 0;
    progress.value = reduce ? to : withSpring(to, { damping: 26, stiffness: 200 });
  }, [at, lines.length, progress, reduce]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const begin = useCallback(() => {
    if (!monologue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAt(0);
    setShown(false);
    tops.current = [];
    startedAt.current = Date.now();
    setPhase('run');
    track('app_run_started', { level, has_cut: Boolean(cut) });
    if (favorited && id) markStudied.mutate(id);
  }, [monologue, level, cut, favorited, id, markStudied]);

  const advance = useCallback(() => {
    if (phase !== 'run') return;
    const next = at + 1;
    if (next >= lines.length) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setPhase('curtain');
      track('app_run_finished', {
        level,
        lines: lines.length,
        seconds: Math.round((Date.now() - (startedAt.current ?? Date.now())) / 1000),
      });
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    setShown(false);
    setAt(next);
  }, [phase, at, lines.length, level]);

  const back = useCallback(() => {
    if (at === 0) return;
    Haptics.selectionAsync().catch(() => {});
    setShown(false);
    setAt(at - 1);
  }, [at]);

  const reveal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShown(true);
  }, []);

  const cycleLevel = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    const i = LEVELS.findIndex((l) => l.key === level);
    setLevel(LEVELS[(i + 1) % LEVELS.length].key);
    setShown(false);
  }, [level]);

  const again = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAt(0);
    setShown(false);
    startedAt.current = Date.now();
    setPhase('run');
    track('app_run_started', { level, has_cut: Boolean(cut) });
  }, [level, cut]);

  const claimOffBook = useCallback(() => {
    if (!saved || saved.offBook) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setOffBook.mutate({ id: saved.id, on: true });
  }, [saved, setOffBook]);

  const masked = phase === 'run' && level !== 'words' && !shown;
  const fg = c.foreground;
  const dim = `${fg}47`;
  const faint = `${fg}26`;
  const serif = { fontFamily: 'InstrumentSerif_400Regular', color: fg } as const;
  const caps = {
    fontFamily: 'CourierPrime_700Bold',
    fontSize: 10,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: c.mutedForeground,
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: pal.background ?? c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} glowColor={pal.glow} background={pal.background} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* The playbill: the way back, who is speaking, and how far along. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, height: 56 }}>
          <Pressable onPress={goBack} hitSlop={14} accessibilityRole="button" accessibilityLabel="Leave the room">
            <Ionicons name="chevron-back" size={24} color={c.mutedForeground} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[serif, { fontSize: 22, lineHeight: 26 }]}>
              {monologue?.character ?? ' '}
            </Text>
            <Text
              numberOfLines={1}
              style={{ fontFamily: 'BricolageGrotesque_500Medium', fontSize: 12, color: c.mutedForeground, marginTop: 1 }}
            >
              {monologue?.source ?? ''}
            </Text>
          </View>
          {phase === 'run' ? (
            <Text style={[caps, { color: pal.accentText }]}>
              {Math.min(at + 1, lines.length)} / {lines.length}
            </Text>
          ) : null}
        </View>
        <View style={{ marginHorizontal: 20, height: 1.5, backgroundColor: `${fg}1f` }}>
          <Animated.View style={[fill, { height: 1.5, backgroundColor: pal.accentText }]} />
        </View>

        {!monologue && isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
            <Sketch name="scriptPages" size={96} stroke={c.yellow} accent={c.yellow} />
            <StageDirection style={{ marginTop: 24 }}>(finding the page…)</StageDirection>
          </View>
        ) : !monologue?.fullText || lines.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
            <StageDirection>(that page is dark.)</StageDirection>
            <Pressable onPress={goBack} hitSlop={10} style={{ marginTop: 18 }} accessibilityRole="button">
              <StageDirection>(back to the piece.)</StageDirection>
            </Pressable>
          </View>
        ) : phase === 'places' ? (
          /* ---------- Places ---------- */
          <Animated.View
            key="places"
            entering={FadeIn.duration(260)}
            exiting={FadeOut.duration(160)}
            style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'center', paddingBottom: 24 }}
          >
            <View style={{ alignItems: 'center' }}>
              <Sketch name="scriptPages" size={88} stroke={c.mutedForeground} accent={c.yellow} />
              <StageDirection style={{ marginTop: 18 }}>(places.)</StageDirection>
              <Text style={[serif, { fontSize: 34, lineHeight: 40, letterSpacing: -0.4, textAlign: 'center', marginTop: 8 }]}>
                Run it at your{' '}
                <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: pal.accentText }}>own pace.</Text>
              </Text>
              <Text
                style={{
                  marginTop: 12,
                  fontFamily: 'BricolageGrotesque_500Medium',
                  fontSize: 14,
                  lineHeight: 21,
                  textAlign: 'center',
                  color: c.mutedForeground,
                  maxWidth: 300,
                }}
              >
                Tap the stage to move through it. Tap a line to bring it back when it is hidden.
              </Text>
              <Text style={[caps, { marginTop: 16 }]}>
                {lines.length} {lines.length === 1 ? 'line' : 'lines'} · {clock(seconds)}
                {cut ? ' · your cut' : ''}
              </Text>
            </View>

            {/* How much of the line you get. One ink thumb, three stops. */}
            <LevelTrack level={level} onChange={(l) => { Haptics.selectionAsync().catch(() => {}); setLevel(l); }} />
            <StageDirection style={{ marginTop: 10, textAlign: 'center' }}>
              ({LEVELS.find((l) => l.key === level)?.says}.)
            </StageDirection>

            <PrimaryPill label="Begin" onPress={begin} block style={{ marginTop: 26 }} />
          </Animated.View>
        ) : phase === 'run' ? (
          /* ---------- Running ---------- */
          <Animated.View key="run" entering={FadeIn.duration(320)} exiting={FadeOut.duration(160)} style={{ flex: 1 }}>
            <ScrollView
              ref={scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: height * 0.26, paddingBottom: height * 0.5, paddingHorizontal: 28 }}
            >
              <Pressable onPress={advance} accessibilityRole="button" accessibilityLabel="Next line">
                {lines.map((line, i) => {
                  const active = i === at;
                  const done = i < at;
                  const type = active ? lineType(line.length) : { fontSize: 15, lineHeight: 22 };
                  let text = line;
                  let color = active ? fg : done ? dim : `${fg}5c`;
                  if (active && masked) {
                    text = level === 'hints' ? maskFirstLetters(line) : shapeOf(line);
                    color = level === 'hints' ? fg : faint;
                  } else if (!active && !done && level !== 'words') {
                    text = level === 'hints' ? maskFirstLetters(line) : shapeOf(line);
                    color = faint;
                  }
                  return (
                    <Text
                      key={i}
                      onLayout={(e) => {
                        tops.current[i] = e.nativeEvent.layout.y;
                      }}
                      onPress={active && masked ? reveal : undefined}
                      suppressHighlighting
                      style={{
                        fontFamily: 'CourierPrime_400Regular',
                        fontSize: type.fontSize,
                        lineHeight: type.lineHeight,
                        textAlign: 'center',
                        color,
                        marginBottom: active ? 26 : 18,
                        opacity: 1,
                      }}
                    >
                      {text}
                    </Text>
                  );
                })}
              </Pressable>
            </ScrollView>

            {/* The dock, along the foot of the stage. */}
            <View style={{ alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8, gap: 12 }}>
              <Text style={caps}>{masked ? 'tap the line to see it · tap the stage to move on' : 'tap the stage to move on'}</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {masked ? <Dock label="reveal" icon="eye-outline" onPress={reveal} accent={pal.accentText} /> : null}
                <Dock label="back" icon="play-back-outline" onPress={back} disabled={at === 0} />
                <Dock label={level} icon="contrast-outline" onPress={cycleLevel} />
                <Dock label="restart" icon="refresh-outline" onPress={again} />
              </View>
            </View>
          </Animated.View>
        ) : (
          /* ---------- Curtain ---------- */
          <Animated.View
            key="curtain"
            entering={FadeIn.duration(360)}
            exiting={FadeOut.duration(160)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 24 }}
          >
            <GhostLight size={30} glow={pal.glow} />
            <StageDirection style={{ marginTop: 22 }}>(curtain.)</StageDirection>
            <Text style={[serif, { fontSize: 34, lineHeight: 40, letterSpacing: -0.4, textAlign: 'center', marginTop: 8 }]}>
              You made it{' '}
              <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: pal.accentText }}>through.</Text>
            </Text>
            <Text
              style={{
                marginTop: 10,
                fontFamily: 'BricolageGrotesque_500Medium',
                fontSize: 14,
                lineHeight: 21,
                textAlign: 'center',
                color: c.mutedForeground,
              }}
            >
              Run it again, or take it into the room.
            </Text>
            <PrimaryPill label="Run it again" onPress={again} block style={{ marginTop: 28, alignSelf: 'stretch' }} />
            {saved ? (
              <Pressable
                onPress={claimOffBook}
                disabled={Boolean(saved.offBook)}
                accessibilityRole="button"
                accessibilityState={{ disabled: Boolean(saved.offBook), selected: Boolean(saved.offBook) }}
                style={{
                  marginTop: 10,
                  alignSelf: 'stretch',
                  height: 48,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: saved.offBook ? pal.accentText : c.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Ionicons name={saved.offBook ? 'checkmark' : 'ellipse-outline'} size={16} color={saved.offBook ? pal.accentText : fg} />
                <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 14, color: saved.offBook ? pal.accentText : fg }}>
                  {saved.offBook ? 'Off book' : "I'm off book"}
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={goBack} hitSlop={10} style={{ marginTop: 22 }} accessibilityRole="button">
              <StageDirection>(back to the piece.)</StageDirection>
            </Pressable>
          </Animated.View>
        )}
      </SafeAreaView>
      <PrivacyShield />
    </View>
  );
}

/** Three stops, one ink thumb that slides between them. */
function LevelTrack({ level, onChange }: { level: Level; onChange: (l: Level) => void }) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const index = LEVELS.findIndex((l) => l.key === level);
  const [slot, setSlot] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    const to = index * (slot + GAP);
    x.value = reduce || slot === 0 ? to : withSpring(to, { damping: 22, stiffness: 240, mass: 0.7 });
  }, [index, slot, reduce, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setSlot((e.nativeEvent.layout.width - PAD * 2 - GAP * 2) / 3)}
      style={{ marginTop: 28, flexDirection: 'row', padding: PAD, borderRadius: 999, borderWidth: 1.5, borderColor: c.border, gap: GAP }}
    >
      {slot > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[thumb, { position: 'absolute', left: PAD, top: PAD, width: slot, height: 38, borderRadius: 999, backgroundColor: c.foreground }]}
        />
      ) : null}
      {LEVELS.map((l) => {
        const on = l.key === level;
        return (
          <Pressable
            key={l.key}
            onPress={() => onChange(l.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, height: 38, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 13.5, color: on ? c.background : c.foreground }}>
              {l.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const PAD = 4;
const GAP = 4;

/** A dock action: an outlined pill in caps, plainly a control and never a fact. */
function Dock({
  label,
  icon,
  onPress,
  disabled,
  accent,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
  accent?: string;
}) {
  const { colors: c } = useTheme();
  const color = accent ?? c.foreground;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: accent ?? c.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={13} color={color} />
      <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color }}>
        {label}
      </Text>
    </Pressable>
  );
}
