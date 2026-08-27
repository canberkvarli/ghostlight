import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { usePreventCaptureWhileFocused } from '../src/hooks/usePreventCaptureWhileFocused';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { MonologueCard } from '../src/components/MonologueCard';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { WordArrow } from '../src/components/WordArrow';
import { MONOLOGUES, type Monologue } from '../src/data/monologues';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useMonologueSearch } from '../src/hooks/useMonologueSearch';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDiscover, requestContent, type SearchParams } from '../src/api/client';
import { apiToMonologue } from '../src/data/adapt';
import { searchScreen } from '../src/lib/screen';
import { useGoBack } from '../src/lib/nav';
import { useSession } from '../src/lib/useSession';
import { useFavorites } from '../src/hooks/useFavorites';
import { colors } from '../src/theme/tokens';
import { mediumPalette, type Medium, type MediumPalette } from '../src/theme/medium';
import { useTheme } from '../src/theme/ThemeContext';
import {
  CARD_GAP,
  CARD_HEIGHT,
  FOCUS_POINT,
  HEADER_HEIGHT,
  LIST_PADDING_TOP,
  ROW_HEIGHT,
} from '../src/theme/layout';

/**
 * Results (spec §5, Steps 0 & 3).
 *
 * Arrived at with a query or filters → the live search from
 * `GET /api/monologues/search`. Arrived at cold (no params) → the twenty
 * fixtures, which is also the Step 0 spike: launch this route directly and it
 * is the clean, network-free stage for the in-hand feel test. If a live search
 * errors (today: 401, anonymous sign-ins still off), it falls back to fixtures
 * rather than an empty stage.
 *
 * Whatever the source, the list keeps the two invariants the scroll spotlight
 * needs: fixed row heights and no JavaScript per frame.
 */

// Reanimated's own animated wrapper, not FlashList's exported `AnimatedFlashList`
// — that one wraps React Native's Animated, whose scroll handler runs on the JS
// thread. The whole point here is that it does not.
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as React.ComponentType<FlashListProps<Monologue>>,
);

/** How many cards a page of results is. See `shown` in Results. */
const PAGE = 20;

export default function Results() {
  const { height } = useWindowDimensions();
  const router = useRouter();
  const goBack = useGoBack('/search');
  const insets = useSafeAreaInsets();
  const { tiltX, tiltY, reduceMotion } = useStageMotion();
  const { colors: c } = useTheme();

  // Which of these are already in their book. Same cache the saves screen and
  // the read screen use, so a save made anywhere shows up here immediately.
  const qc = useQueryClient();
  const { isAuthenticated } = useSession();
  const { data: savedRows } = useFavorites(isAuthenticated);
  const savedIds = useMemo(() => new Set((savedRows ?? []).map((m) => m.id)), [savedRows]);

  const raw = useLocalSearchParams<{
    q?: string;
    gender?: string;
    age_range?: string;
    tone?: string;
    emotion?: string;
    max_duration?: string;
    max_overdone_score?: string;
    medium?: string;
  }>();

  const medium: Medium = raw.medium === 'screen' ? 'screen' : 'theatre';
  const pal = mediumPalette(medium, c.isLight);
  const screenMode = medium === 'screen';

  // The excerpts are the words of the play too — same protection as the read
  // screen. Held only while focused so it doesn't stack with Read's lock and
  // black out that screen (see usePreventCaptureWhileFocused).
  usePreventCaptureWhileFocused('results');

  const params: SearchParams = useMemo(() => {
    const p: SearchParams = {};
    if (raw.q?.trim()) p.q = raw.q.trim();
    if (raw.gender) p.gender = raw.gender;
    if (raw.age_range) p.age_range = raw.age_range;
    if (raw.tone) p.tone = raw.tone;
    if (raw.emotion) p.emotion = raw.emotion;
    if (raw.max_duration) p.max_duration = Number(raw.max_duration);
    if (raw.max_overdone_score) p.max_overdone_score = Number(raw.max_overdone_score);
    return p;
  }, [raw.q, raw.gender, raw.age_range, raw.tone, raw.emotion, raw.max_duration, raw.max_overdone_score]);

  const hasIntent = Object.keys(params).length > 0;
  const { data: live, isLoading, isError, refetch } = useMonologueSearch(params, hasIntent && !screenMode);

  // Cold start (no query) shows a live discover lineup; fixtures stand in until
  // there's a session, and as the offline fallback. Theatre only.
  const { data: discoverLive } = useQuery({
    queryKey: ['discover'],
    enabled: !hasIntent && !screenMode,
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => (await getDiscover(30, signal)).map(apiToMonologue),
  });

  // Film & TV: the browse-by-poster lineup, read straight from Supabase. Always
  // fetches (query or not) — no query is just the top of the marquee.
  const {
    data: screenData,
    isLoading: screenLoading,
    isError: screenError,
    refetch: refetchScreen,
  } = useQuery({
    queryKey: ['screen', params],
    enabled: screenMode,
    retry: false,
    staleTime: 60_000,
    queryFn: () => searchScreen(params, 60),
  });

  // Live search results; live discover on cold start. The fixtures are the
  // standing fallback for DISCOVER ONLY.
  //
  // They used to back the search path too, and that was the "I typed xxxx and
  // got hamlet results" bug: on any error `live` is undefined, `??` fired, and
  // the screen rendered the same 22 fixtures for every query — the first of
  // which is "To be, or not to be". A failed search looked like a good one, so
  // the failure was invisible and the results were nonsense. A search that
  // fails must say so; only discover may fall back to something pretty.
  const all = screenMode
    ? (screenData ?? [])
    : hasIntent
      ? (live?.monologues ?? [])
      : (discoverLive && discoverLive.length ? discoverLive : MONOLOGUES);

  // Sixty cards is not a shortlist, it's a phone book, and nobody scrolls one
  // looking for a monologue. Show a castable twenty and let the rest be asked
  // for. `shown` only ever grows, and resetting it when the query changes is
  // what stops a new search inheriting the last one's expanded page.
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [params, medium]);
  const data = useMemo(() => all.slice(0, shown), [all, shown]);
  const more = Math.max(0, all.length - data.length);
  const count = all.length;
  const searching = screenMode ? screenLoading : hasIntent && isLoading;
  const searchFailed = screenMode ? Boolean(screenError) : hasIntent && isError;
  // A search that genuinely found nothing — offer to request it. Note this is
  // still gated on "not errored": empty-because-broken is a different state and
  // gets its own message below, rather than being dressed up as "no matches".
  const noResults = screenMode
    ? !screenLoading && !screenError && (screenData?.length ?? 0) === 0
    : hasIntent && !isLoading && !isError && live?.monologues.length === 0;

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // The index under the light, recomputed on the UI thread. React never sees
  // the scroll position; only a change of *which* card is lit crosses to JS,
  // and only to tick the haptic.
  useAnimatedReaction(
    () => {
      const focus = scrollY.value + height * FOCUS_POINT - HEADER_HEIGHT - LIST_PADDING_TOP;
      const index = Math.round((focus - CARD_HEIGHT / 2) / ROW_HEIGHT);
      // Clamped to what's actually on screen, not to how many were found —
      // otherwise the light keeps "moving" past the last rendered card.
      return Math.min(data.length - 1, Math.max(0, index));
    },
    (current, previous) => {
      if (previous !== null && current !== previous && !reduceMotion) {
        runOnJS(tick)();
      }
    },
    [height, reduceMotion, data.length],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Monologue; index: number }) => (
      <CardButton
        item={item}
        index={index}
        scrollY={scrollY}
        viewportHeight={height}
        reduceMotion={reduceMotion}
        accent={pal.glow}
        litBorder={pal.litBorder}
        saved={savedIds.has(item.id)}
        // The house travels with the card. Without this the read screen had no
        // idea which toggle you came through and painted every Film & TV piece
        // in theatre amber, so tapping a violet result dropped you into an
        // orange room.
        onPress={() => {
          // Hand the row forward so the read screen can paint its heading at
          // once instead of showing "(finding the page…)" while it fetches.
          // Metadata only — see the read screen for why the words wait.
          qc.setQueryData(['monologue-preview', item.id], item);
          router.push({ pathname: '/read/[id]', params: { id: item.id, medium } });
        }}
      />
    ),
    [scrollY, height, reduceMotion, router, pal.glow, pal.litBorder, medium, savedIds, qc],
  );

  const header = useMemo(
    () => (
      <StageHeader count={count} query={params.q ?? null} medium={medium} />
    ),
    [count, params.q, medium],
  );

  const footer = useMemo(
    () =>
      more > 0 ? (
        <MoreRow
          more={more}
          pal={pal}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
            setShown((n) => n + PAGE);
          }}
        />
      ) : null,
    [more, pal],
  );

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} glowColor={pal.glow} background={pal.background} />

      {/* The way back to search — anchored just below the notch, over the list.
          Absolute so it doesn't shift the list (the scroll spotlight is measured
          against the full window). */}
      <Pressable
        onPress={goBack}
        hitSlop={16}
        accessibilityRole="button"
        accessibilityLabel="Back to search"
        style={{ position: 'absolute', top: insets.top + 8, left: 12, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 }}
      >
        <Ionicons name="chevron-back" size={22} color={c.chevron} />
        <Text style={{ fontFamily: 'Montserrat_500Medium', fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', color: c.chevron }}>
          Search
        </Text>
      </Pressable>

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flex: 1 }}>
        {searching ? (
          <SearchingStage pal={pal} screen={screenMode} />
        ) : searchFailed ? (
          <SearchFailedStage pal={pal} onRetry={() => (screenMode ? refetchScreen() : refetch())} />
        ) : noResults ? (
          <RequestStage query={params.q ?? ''} pal={pal} />
        ) : (
          <AnimatedFlashList
            data={data}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 18,
              paddingTop: LIST_PADDING_TOP,
              paddingBottom: 96,
            }}
            ListHeaderComponent={header}
            ListFooterComponent={footer}
            ListEmptyComponent={EmptyStage}
          />
        )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function StageHeader({
  count,
  query,
  medium,
}: {
  count: number;
  query: string | null;
  medium: Medium;
}) {
  const { colors: c } = useTheme();
  const pal = mediumPalette(medium, c.isLight);
  const screen = medium === 'screen';
  const noun = screen ? 'on screen' : 'monologues';
  // The old `fellBack` branch said "(sign in to search. the stage stands.)"
  // whenever the request errored — while the fixture fallback rendered rows
  // behind it. So the screen showed results and claimed you weren't signed in,
  // at the same time. Failures now own the whole screen (SearchFailedStage) and
  // the header only ever describes what's actually on it.
  // The lamp sits high and the block breathes: it used to be bottom-aligned with
  // a 28pt tail, which pinned the stage direction to the first card and pushed
  // the lamp down into the count. Now the lamp hangs near the top, where a ghost
  // light actually hangs, and there is real air under the direction line.
  return (
    <View style={{ height: HEADER_HEIGHT, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 14 }}>
      <GhostLight size={28} glow={pal.glow} glassStops={pal.glassStops} neck={pal.neck} />
      <Text
        className="text-foreground"
        style={{ marginTop: 26, fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 30, lineHeight: 36 }}
      >
        {count} {count === 1 ? 'monologue' : 'monologues'}
      </Text>
      <StageDirection style={{ marginTop: 14 }} numberOfLines={1}>
        {query ? `(for “${query}”.)` : `(${count} ${noun}. lights up.)`}
      </StageDirection>
    </View>
  );
}

// Whole lines now, not just names, so the loading state has some wit in it and
// doesn't read as the same sentence seven times. Both houses get the same
// treatment — Film & TV used to feel like the poor relation here.
const STAGE_LINES = [
  'asking Shakespeare…',
  'asking Chekhov…',
  'asking Ibsen…',
  'asking Tennessee…',
  'waking Beckett…',
  'checking with Wilde…',
  'rifling the prompt book…',
  'turning the house lights down…',
  'reading the margins…',
  'asking who else is off book…',
];
const SCREEN_LINES = [
  'asking Sorkin…',
  'asking Waller-Bridge…',
  'asking Kaufman…',
  'asking Peele…',
  'paging through call sheets…',
  'checking the shooting script…',
  'asking for one more take…',
  'rolling sound…',
  'finding the close-up…',
];

/**
 * Hunting (handoff §5): the bulb and halo pulse on a loop, an amber gradient
 * sweeps a hairline, and the line below cycles through what we're asking.
 * Reads as the app going and looking, not a dead spinner.
 *
 * The list is shuffled per mount so you don't see the same opening line every
 * search — with a fast backend most people only ever read the first one or two.
 */
function SearchingStage({ pal, screen }: { pal: MediumPalette; screen: boolean }) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0.6);
  const sweep = useSharedValue(0);
  const [lines] = useState(() => {
    const pool = [...(screen ? SCREEN_LINES : STAGE_LINES)];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  });
  const [vi, setVi] = useState(0);

  useEffect(() => {
    if (reduce) {
      pulse.value = 0.6;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 90, easing: Easing.linear }),
        withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }),
        withTiming(0.3, { duration: 240, easing: Easing.linear }),
        withTiming(0.9, { duration: 350, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    sweep.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, false);
    // 700ms was faster than anyone can read a full line.
    const id = setInterval(() => setVi((n) => (n + 1) % lines.length), 1100);
    return () => clearInterval(id);
  }, [reduce, pulse, sweep, lines.length]);

  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -60 + sweep.value * 150 }] }));

  // Centring lives in `style`, not `className` — Uniwind drops layout
  // utilities (AGENTS.md), so items-center/justify-center silently did nothing
  // here and the lamp sat in the top-left through every search.
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <GhostLight size={34} boost={pulse} glow={pal.glow} glassStops={pal.glassStops} neck={pal.neck} />
      <StageDirection className="mt-7" style={{ textAlign: 'center' }}>
        {`(${lines[vi]})`}
      </StageDirection>
      {/* a 150pt hairline the light sweeps along */}
      <View style={{ marginTop: 24, width: 150, height: 1, backgroundColor: c.inactiveMeter, overflow: 'hidden' }}>
        <Animated.View style={[sweepStyle, { width: 60, height: 1, backgroundColor: pal.glow }]} />
      </View>
    </View>
  );
}

/**
 * A search that found nothing isn't a dead end — it's a request. The actor can
 * ask us to add the piece they're after (spec §4, content-request).
 */
function RequestStage({ query, pal }: { query: string; pal: MediumPalette }) {
  const { colors: c } = useTheme();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const ask = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
    setSending(true);
    try {
      await requestContent({ query });
      setSent(true);
    } catch {
      // Even if the request can't reach the server, don't dead-end the actor.
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      {/* the lamp drops to a coal */}
      <View style={{ opacity: 0.5 }}>
        <GhostLight size={44} glow={pal.glow} glassStops={pal.glassStops} neck={pal.neck} />
      </View>

      {sent ? (
        <>
          <Text
            className="text-center text-foreground"
            style={{ marginTop: 44, fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 30, lineHeight: 38 }}
          >
            Sent to{'\n'}the booth.
          </Text>
          <StageDirection className="mt-5">(we'll go looking.)</StageDirection>
        </>
      ) : (
        <>
          <Text
            className="text-center text-foreground"
            style={{ marginTop: 44, fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 30, lineHeight: 38 }}
          >
            Not in the{'\n'}library yet.
          </Text>
          <StageDirection className="mt-5">{query ? `(nothing for “${query}”.)` : '(nothing here yet.)'}</StageDirection>
          <Text
            className="text-center"
            style={{ marginTop: 28, fontFamily: 'Montserrat_400Regular', fontSize: 14, lineHeight: 22, color: c.mutedForeground }}
          >
            Ask for it and we go looking.{'\n'}Most requests are up inside a week.
          </Text>
          <View style={{ marginTop: 34 }}>
            <WordArrow label="Request it" onPress={ask} disabled={sending} tint={pal.glow} haptic="none" />
          </View>
        </>
      )}
    </View>
  );
}

/**
 * The foot of a page of results. Says what's still waiting rather than just
 * offering a button, because "42 more" is the thing that tells you whether it's
 * worth another tap.
 */
function MoreRow({ more, pal, onPress }: { more: number; pal: MediumPalette; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingTop: 26, paddingBottom: 8 }}>
      <View style={{ width: 44, height: 1, backgroundColor: c.inactiveMeter }} />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Show ${more} more`}
        style={{ marginTop: 22, paddingVertical: 10, paddingHorizontal: 24 }}
      >
        <Text
          style={{
            fontFamily: 'Montserrat_600SemiBold',
            fontSize: 13,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: pal.glow,
          }}
        >
          See more
        </Text>
      </Pressable>
      <StageDirection>{`(${more} still in the wings.)`}</StageDirection>
    </View>
  );
}

function EmptyStage() {
  return (
    <View style={{ alignItems: 'center' }} className="pt-24">
      <GhostLight size={44} />
      <StageDirection className="mt-6">(nothing here yet.)</StageDirection>
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A result card that snaps into the spotlight when you press it: a quick lift
 * and a flash of the orange glow, like the light finding you a beat before the
 * page turns. Reduced motion keeps the tap but drops the flourish.
 */
function CardButton({
  item,
  index,
  scrollY,
  viewportHeight,
  reduceMotion,
  accent,
  litBorder,
  saved,
  onPress,
}: {
  item: Monologue;
  index: number;
  scrollY: SharedValue<number>;
  viewportHeight: number;
  reduceMotion: boolean;
  accent: string;
  litBorder: string;
  saved: boolean;
  onPress: () => void;
}) {
  const pressed = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    marginBottom: CARD_GAP,
    transform: [{ scale: 1 + pressed.value * 0.03 }],
    shadowColor: accent,
    shadowOpacity: pressed.value * 0.6,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
  }));

  return (
    <AnimatedPressable
      style={style}
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => {
        if (reduceMotion) return;
        Haptics.selectionAsync().catch(() => {});
        pressed.value = withTiming(1, { duration: 110 });
      }}
      onPressOut={() => (pressed.value = withTiming(0, { duration: 280 }))}
    >
      <MonologueCard
        item={item}
        index={index}
        scrollY={scrollY}
        viewportHeight={viewportHeight}
        reduceMotion={reduceMotion}
        accent={accent}
        litBorder={litBorder}
        saved={saved}
      />
    </AnimatedPressable>
  );
}

function keyExtractor(item: Monologue) {
  return item.id;
}

function tick() {
  Haptics.selectionAsync().catch(() => {});
}

/**
 * The search broke — say so.
 *
 * This state did not exist before, which is exactly how the "I typed xxxx and
 * got Hamlet" bug survived: a failed request fell through to the fixture list,
 * so every failure looked like a successful search for something else. An
 * honest dead end the actor can retry beats a confident wrong answer.
 */
function SearchFailedStage({
  pal,
  onRetry,
}: {
  pal: ReturnType<typeof mediumPalette>;
  onRetry: () => void;
}) {
  // The lamp sat too low and the stage direction sat right under the headline,
  // so the three read as one clump in the middle of an empty screen. The lamp
  // moves up out of the text's way and the direction gets room to be an aside.
  const { colors: c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 64 }}>
      <View style={{ opacity: 0.4 }}>
        <GhostLight size={44} glow={pal.glow} glassStops={pal.glassStops} neck={pal.neck} />
      </View>
      <Text
        className="text-center text-foreground"
        style={{ marginTop: 56, fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 30, lineHeight: 38 }}
      >
        The house{'\n'}went dark.
      </Text>
      <StageDirection style={{ marginTop: 22, textAlign: 'center' }}>
        (couldn&apos;t reach the library.)
      </StageDirection>
      <Text
        className="text-center"
        style={{ marginTop: 28, fontFamily: 'Montserrat_400Regular', fontSize: 14, lineHeight: 22, color: c.mutedForeground }}
      >
        Check your connection and try again.
      </Text>
      <Pressable onPress={onRetry} accessibilityRole="button" style={{ marginTop: 24, paddingVertical: 10, paddingHorizontal: 22 }}>
        <Text
          style={{ fontFamily: 'Montserrat_600SemiBold', fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', color: pal.glow }}
        >
          Try again
        </Text>
      </Pressable>
    </View>
  );
}
