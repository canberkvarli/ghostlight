import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
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
import { unitsOf } from '../../src/lib/segments';
import { getMonologueById, type Monologue } from '../../src/data/monologues';
import { getMonologue } from '../../src/api/client';
import { apiToMonologue } from '../../src/data/adapt';
import { getOffline } from '../../src/lib/offline';
import { Mic } from '../../src/rehearsal/native/mic';
import { EMPTY_READ, lineWords, liveRead, shouldHandOver, type LiveRead } from '../../src/rehearsal/live-read';
import { displayRuns } from '../../src/rehearsal/display-words';
import { noteRecent } from '../../src/lib/recents';
import { maybeAskKnock } from '../../src/lib/nudges';
import { track } from '../../src/lib/analytics';
import { mediumPalette, type Medium } from '../../src/theme/medium';
import { useTheme } from '../../src/theme/ThemeContext';

/**
 * Run it: the rehearsal room, with the house lights down.
 *
 * A sheet that comes up over the page and goes straight to work: no screen
 * before it, no choices to make. The lines come up on the dark stage one at a
 * time, the one you are on large and lit, the ones behind it receding, the
 * ones ahead waiting. Three rules, and only three:
 *
 *   tap the stage        the next line
 *   tap a line           go there (back to one you dropped, or on past one)
 *   hide the lines       the lit line is a row of dots until you tap it
 *
 * The light moves, the lines do not: one shared value walks from line to
 * line and every line reads its own distance from it on the UI thread, so a
 * step is a glide and nothing jumps. With a cut set, only the cut runs.
 *
 * And it listens. With the ear on (the third thing in the dock, on by
 * itself once the phone has said yes), the lit line's words come up to full
 * ink as you say them, the one you are on underlined, and on its last word
 * the light walks to the next line by itself: the same reading the scene
 * partner does for a line of yours. With the lines hidden, a word you
 * recall comes out of the dots as you say it. Tapping still works for a
 * line the ear missed.
 */

/** The shape of a line and nothing else: a dot per letter, the spaces kept. */
function shapeOf(text: string): string {
  return text
    .split(/(\s+)/)
    .map((w) => (/^\s+$/.test(w) ? w : '•'.repeat(Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, '').length))))
    .join('');
}

const STEP = { duration: 420, easing: Easing.out(Easing.cubic) };

export default function RunScreen() {
  const { id, medium: mediumParam } = useLocalSearchParams<{ id: string; medium?: string }>();
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
  const lines = useMemo(() => {
    const units = unitsOf(monologue?.fullText ?? '');
    const src = saved ?? monologue;
    if (src?.cutStart != null && src?.cutEnd != null && units.length) {
      const lo = Math.min(src.cutStart, src.cutEnd, units.length - 1);
      const hi = Math.min(Math.max(src.cutStart, src.cutEnd), units.length - 1);
      return units.slice(lo, hi + 1).map((u) => u.text);
    }
    return units.map((u) => u.text);
  }, [monologue, saved]);

  const [at, setAt] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [shown, setShown] = useState(false);
  const [curtain, setCurtain] = useState(false);
  const startedAt = useRef(Date.now());

  // The ear. One recogniser for the whole run; each line is a turn of it.
  const [listening, setListening] = useState(false);
  const [earOff, setEarOff] = useState(false); // the actor turned it off: do not turn it on by itself again
  const [read, setRead] = useState<LiveRead>(EMPTY_READ);
  const readRef = useRef<LiveRead>(EMPTY_READ);
  const atRef = useRef(0);
  const wordsRef = useRef<string[][]>([]);
  const micRef = useRef<Mic | null>(null);
  const advanceRef = useRef<() => void>(() => {});
  const wordsOf = useMemo(() => lines.map((l) => lineWords(l)), [lines]);
  const runsOf = useMemo(() => lines.map((l) => displayRuns(l)), [lines]);
  wordsRef.current = wordsOf;

  // Straight to work: the run starts the moment the words are here.
  const begun = useRef(false);
  useEffect(() => {
    if (begun.current || !monologue?.fullText || !lines.length) return;
    begun.current = true;
    startedAt.current = Date.now();
    track('app_run_started', { level: 'words', has_cut: Boolean((saved ?? monologue)?.cutStart != null) });
    if (favorited && id) markStudied.mutate(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monologue, lines.length]);

  // The light: one value that walks from line to line.
  const cursor = useSharedValue(0);
  useEffect(() => {
    cursor.value = reduce ? at : withTiming(at, STEP);
  }, [at, cursor, reduce]);

  // The lit line stays a third of the way down, where the eye rests, so the
  // words come up to meet you rather than running off the foot.
  const scroll = useRef<ScrollView>(null);
  const tops = useRef<number[]>([]);
  useEffect(() => {
    const y = tops.current[at];
    if (y == null) return;
    scroll.current?.scrollTo({ y: Math.max(0, y - height * 0.3), animated: !reduce });
  }, [at, height, reduce]);

  const finish = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setCurtain(true);
    if (id) void noteRecent(id, { ran: true });
    void maybeAskKnock('curtain');
    track('app_run_finished', {
      level: hidden ? 'dark' : 'words',
      lines: lines.length,
      seconds: Math.round((Date.now() - startedAt.current) / 1000),
    });
  }, [hidden, lines.length, id]);

  const goTo = useCallback(
    (i: number) => {
      if (i >= lines.length) {
        finish();
        return;
      }
      Haptics.selectionAsync().catch(() => {});
      setShown(false);
      setAt(Math.max(0, i));
    },
    [lines.length, finish],
  );
  atRef.current = at;

  // Said the whole line: on to the next, the ear's turn with it.
  advanceRef.current = () => { micRef.current?.closeTurn(); goTo(atRef.current + 1); };

  const stopEar = useCallback(() => {
    micRef.current?.detach();
    micRef.current = null;
    setListening(false);
  }, []);

  const startEar = useCallback(async () => {
    if (micRef.current) return;
    if (!Mic.available() || !(await Mic.permission())) { setListening(false); return; }
    const mic = new Mic({
      onTranscript: (text) => {
        const words = wordsRef.current[atRef.current] ?? [];
        const r = liveRead(words, text, readRef.current);
        readRef.current = r;
        setRead(r);
        if (shouldHandOver({ ...r, turnEnded: false })) advanceRef.current();
      },
      onOverheard: () => {},
      onQuiet: () => { if (shouldHandOver({ ...readRef.current, turnEnded: true })) advanceRef.current(); },
      onFailed: () => stopEar(),
    });
    mic.attach();
    mic.prime([...new Set(wordsRef.current.flat())].slice(0, 100));
    micRef.current = mic;
    mic.listen();
    readRef.current = EMPTY_READ;
    setRead(EMPTY_READ);
    mic.openTurn();
    setListening(true);
  }, [stopEar]);

  const toggleEar = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (micRef.current) { setEarOff(true); track('app_run_listen', { on: false }); stopEar(); return; }
    setEarOff(false);
    track('app_run_listen', { on: true });
    void startEar();
  }, [startEar, stopEar]);

  // On by itself once the words are here, if the phone has already said yes
  // to the microphone; never asks on its own.
  useEffect(() => {
    if (!lines.length || curtain || earOff || micRef.current) return;
    let alive = true;
    Mic.permissionGranted().then((ok) => { if (alive && ok && !micRef.current) void startEar(); }).catch(() => {});
    return () => { alive = false; };
  }, [lines.length, curtain, earOff, startEar]);

  // A new line is a new turn of the ear: the reading starts over at its first word.
  useEffect(() => {
    readRef.current = EMPTY_READ;
    setRead(EMPTY_READ);
    if (micRef.current) micRef.current.openTurn();
  }, [at]);

  // The curtain, and leaving, close the ear.
  useEffect(() => { if (curtain) stopEar(); }, [curtain, stopEar]);
  useEffect(() => () => { micRef.current?.detach(); micRef.current = null; }, []);

  const onStage = useCallback(() => goTo(at + 1), [goTo, at]);
  const onLine = useCallback(
    (i: number) => {
      if (i === at) {
        if (hidden && !shown) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setShown(true);
        } else goTo(at + 1);
        return;
      }
      goTo(i);
    },
    [at, hidden, shown, goTo],
  );

  const toggleHidden = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setHidden((h) => !h);
    setShown(false);
  }, []);

  const again = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCurtain(false);
    setShown(false);
    setAt(0);
    readRef.current = EMPTY_READ;
    setRead(EMPTY_READ);
    micRef.current?.openTurn();
    startedAt.current = Date.now();
    track('app_run_started', { level: hidden ? 'dark' : 'words', has_cut: Boolean((saved ?? monologue)?.cutStart != null) });
  }, [hidden, saved, monologue]);

  const claimOffBook = useCallback(() => {
    if (!saved || saved.offBook) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setOffBook.mutate({ id: saved.id, on: true });
    void noteRecent(saved.id, { offBook: true });
  }, [saved, setOffBook]);

  const fg = c.foreground;
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
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        {/* The playbill: the way down, who is speaking, how far along. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, height: 64, paddingTop: 8 }}>
          <Pressable onPress={goBack} hitSlop={14} accessibilityRole="button" accessibilityLabel="Back to the piece">
            <Ionicons name="chevron-down" size={26} color={c.mutedForeground} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 22, lineHeight: 26, color: fg }}>
              {monologue?.character ?? ' '}
            </Text>
            <Text numberOfLines={1} style={{ fontFamily: 'BricolageGrotesque_500Medium', fontSize: 12, color: c.mutedForeground, marginTop: 1 }}>
              {monologue?.source ?? ''}
            </Text>
          </View>
          {lines.length ? (
            <Text style={[caps, { color: pal.accentText }]}>
              {curtain ? lines.length : Math.min(at + 1, lines.length)} / {lines.length}
            </Text>
          ) : null}
        </View>
        <Rule cursor={cursor} total={lines.length} color={pal.accentText} track={`${fg}1f`} />

        {!monologue && isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
            <Sketch name="scriptPages" size={96} stroke={c.yellow} accent={c.yellow} />
            <StageDirection style={{ marginTop: 24 }}>(finding the page…)</StageDirection>
          </View>
        ) : !monologue?.fullText || lines.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
            <StageDirection>(that page is dark.)</StageDirection>
            <Pressable onPress={goBack} hitSlop={10} style={{ marginTop: 18 }} accessibilityRole="button">
              <StageDirection link>(back to the piece.)</StageDirection>
            </Pressable>
          </View>
        ) : curtain ? (
          /* ---------- Curtain ---------- */
          <Animated.View
            key="curtain"
            entering={FadeIn.duration(420)}
            exiting={FadeOut.duration(180)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 24 }}
          >
            <GhostLight size={30} glow={pal.glow} />
            <StageDirection style={{ marginTop: 22 }}>(curtain.)</StageDirection>
            <Text style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 34, lineHeight: 40, letterSpacing: -0.4, textAlign: 'center', marginTop: 8, color: fg }}>
              You made it{' '}
              <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: pal.accentText }}>through.</Text>
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
              <StageDirection link>(back to the piece.)</StageDirection>
            </Pressable>
          </Animated.View>
        ) : (
          /* ---------- The stage ---------- */
          <Animated.View key="stage" entering={FadeIn.duration(360)} exiting={FadeOut.duration(160)} style={{ flex: 1 }}>
            <ScrollView
              ref={scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: height * 0.24, paddingBottom: height * 0.5, paddingHorizontal: 28 }}
            >
              <Pressable onPress={onStage} accessibilityRole="button" accessibilityLabel="Next line">
                {lines.map((line, i) => (
                  <Line
                    key={i}
                    index={i}
                    text={line}
                    runs={runsOf[i]}
                    cursor={cursor}
                    at={at}
                    masked={hidden && (i > at || (i === at && !shown))}
                    heard={listening && i === at ? read.matched : undefined}
                    here={listening && i === at ? read.position : undefined}
                    color={fg}
                    accent={pal.accentText}
                    onPress={onLine}
                    onTop={(y) => {
                      tops.current[i] = y;
                    }}
                  />
                ))}
              </Pressable>
            </ScrollView>

            {/* The dock: two things to press, each the same width whatever it says. */}
            <View style={{ alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Dock label={hidden ? 'show the lines' : 'hide the lines'} icon={hidden ? 'eye-outline' : 'eye-off-outline'} on={hidden} onPress={toggleHidden} />
                <Dock label="from the top" icon="refresh-outline" onPress={again} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Dock label={listening ? 'listening' : 'listen'} icon={listening ? 'mic' : 'mic-outline'} on={listening} onPress={toggleEar} />
              </View>
            </View>
          </Animated.View>
        )}
      </SafeAreaView>
      <PrivacyShield />
    </View>
  );
}

/**
 * One line of the piece. Drawn once at one size; the light does the rest. It
 * reads its distance from the cursor on the UI thread: at zero it is lit and
 * full size, a line away it has stepped back and dimmed, further still it
 * waits in the dark. Behind the cursor the words stay; ahead of it, with the
 * lines hidden, only the shape of them.
 */
const Line = memo(function Line({
  index,
  text,
  runs,
  cursor,
  at,
  masked,
  heard,
  here,
  color,
  accent,
  onPress,
  onTop,
}: {
  index: number;
  text: string;
  /** The words as shown, one span each, in step with the ear's words. */
  runs: { word: string; gap: boolean }[];
  cursor: SharedValue<number>;
  at: number;
  masked: boolean;
  /** With the ear on the lit line: the words said so far, and the one you are on. */
  heard?: Set<number>;
  here?: number;
  color: string;
  accent: string;
  onPress: (i: number) => void;
  onTop: (y: number) => void;
}) {
  const style = useAnimatedStyle(() => {
    const d = index - cursor.value;
    const away = Math.abs(d);
    return {
      opacity: interpolate(away, [0, 1, 3], [1, 0.42, 0.22], 'clamp'),
      transform: [{ scale: interpolate(away, [0, 1], [1, 0.78], 'clamp') }],
    };
  });
  const long = text.length > 140;
  const face = { fontFamily: 'CourierPrime_400Regular', fontSize: long ? 18 : 22, lineHeight: long ? 27 : 32, textAlign: 'center' as const };
  return (
    <Animated.View
      style={[style, { marginBottom: 22 }]}
      onLayout={(e) => onTop(e.nativeEvent.layout.y)}
    >
      <Pressable onPress={() => onPress(index)} accessibilityRole="button" accessibilityLabel={index === at ? 'This line' : `Line ${index + 1}`}>
        {heard ? (
          /* The ear is on this line: a span a word. Said words in full ink, the
             one you are on underlined, the rest sat back; hidden, a word comes
             out of its dots as you say it. */
          <Animated.Text key="heard" entering={FadeIn.duration(220)} style={[face, { color }]}>
            {runs.map((w, i) => {
              const said = heard.has(i);
              const on = here === i;
              const shown = said || !masked;
              return (
                <Text key={i}>
                  <Text style={{ color: said ? color : masked ? `${color}66` : `${color}8c`, textDecorationLine: on ? 'underline' : 'none', textDecorationColor: accent }}>
                    {shown ? w.word : shapeOf(w.word)}
                  </Text>
                  {w.gap ? ' ' : ''}
                </Text>
              );
            })}
          </Animated.Text>
        ) : (
          /* Keyed on what it shows, so dots and words cross-fade instead of swapping. */
          <Animated.Text
            key={masked ? 'shape' : 'words'}
            entering={FadeIn.duration(220)}
            style={[face, { color: masked ? `${color}66` : color }]}
          >
            {masked ? shapeOf(text) : text}
          </Animated.Text>
        )}
      </Pressable>
    </Animated.View>
  );
});

/** A thin rule under the playbill that fills as the light walks down the piece. */
function Rule({ cursor, total, color, track }: { cursor: SharedValue<number>; total: number; color: string; track: string }) {
  const fill = useAnimatedStyle(() => ({
    width: `${total ? Math.min(100, (cursor.value / total) * 100) : 0}%`,
  }));
  return (
    <View style={{ marginHorizontal: 20, height: 1.5, backgroundColor: track }}>
      <Animated.View style={[fill, { height: 1.5, backgroundColor: color }]} />
    </View>
  );
}

/** A dock action: an outlined pill in caps, filled when it is on. */
function Dock({
  label,
  icon,
  on,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  on?: boolean;
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  const color = on ? c.background : c.foreground;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(on) }}
      style={({ pressed }) => ({
        height: 38,
        width: 156,
        justifyContent: 'center',
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: on ? c.foreground : c.border,
        backgroundColor: on ? c.foreground : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={13} color={color} />
      <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color }}>
        {label}
      </Text>
    </Pressable>
  );
}
