import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { MonologueCard } from '../src/components/MonologueCard';
import { Sketch } from '../src/components/Sketches';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { MONOLOGUES, type Monologue } from '../src/data/monologues';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useMonologueSearch } from '../src/hooks/useMonologueSearch';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDiscover, requestContent, type SearchParams } from '../src/api/client';
import { apiToMonologue } from '../src/data/adapt';
import { searchScreen } from '../src/lib/screen';
import { track } from '../src/lib/analytics';
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
 *
 * ## The in-between states
 *
 * Searching, nothing-found and failed each get a line sketch that draws itself
 * in, not the ghost light. The lamp was on all three and on Search and on the
 * launch screen, which made it mean "a thing is happening" rather than meaning
 * anything. It is now the brand's own object, kept to the two screens that are
 * standing still; a screen that is DOING something gets a drawing of the doing.
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

  /** Everything the search was narrowed by, not counting the words themselves. */
  const filterCount = useMemo(
    () => Object.keys(params).filter((k) => k !== 'q').length,
    [params],
  );

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

  // Film & TV: the browse-by-poster lineup. Always fetches (query or not) — no
  // query is just the top of the marquee.
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

  /**
   * The house goes one step darker when the search fails — the only place in the
   * app that drops below its own background, and it comes back up on a
   * successful retry. On paper it steps down rather than up, for the same
   * reason: the room dims, whichever room it is.
   */
  const floor = searchFailed
    ? c.isLight
      ? '#e7e0d5'
      : '#0d0705'
    : pal.background;

  // One event per distinct search that actually came back. Keyed on the params
  // signature and held in a ref because this component re-renders constantly and
  // an unguarded effect would report the same search over and over.
  //
  // Failures are deliberately not counted. `results: 0` from a dead network is a
  // different fact from "nothing matched", and folding them together makes the
  // one number this event exists to carry into a lie. The search text never
  // travels, only whether there was any (see the note on `Event`).
  const searchReported = useRef<string | null>(null);
  useEffect(() => {
    if (!hasIntent || searching || searchFailed) return;
    const signature = `${medium}:${JSON.stringify(params)}`;
    if (searchReported.current === signature) return;
    searchReported.current = signature;
    track('search_performed', {
      medium,
      // The same count the header's "filters · N" pill reads, so the number in
      // the analytics and the number on the screen cannot drift apart.
      filters: filterCount,
      has_query: Boolean(params.q),
      results: count,
    });
  }, [hasIntent, searching, searchFailed, medium, params, count, filterCount]);

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
        blockColor={pal.hardShadow}
        saved={savedIds.has(item.id)}
        // The house travels with the card. Without this the read screen had no
        // idea which toggle you came through and painted every Film & TV piece
        // in theatre amber, so tapping a violet result dropped you into an
        // orange room.
        onPress={() => {
          // `position` is the whole point of this event: if everyone only ever
          // opens the first three rows, the ranking is doing the choosing and
          // the other fifty-seven results are furniture.
          track('monologue_opened', { id: String(item.id), position: index, medium });
          // Hand the row forward so the read screen can paint its heading at
          // once instead of showing "(finding the page…)" while it fetches.
          // Metadata only — see the read screen for why the words wait.
          qc.setQueryData(['monologue-preview', item.id], item);
          router.push({ pathname: '/read/[id]', params: { id: item.id, medium } });
        }}
      />
    ),
    [scrollY, height, reduceMotion, router, pal.hardShadow, medium, savedIds, qc],
  );

  const header = useMemo(
    () => <StageHeader count={count} query={params.q ?? null} medium={medium} />,
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
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} glowColor={pal.glow} background={floor} />

      {/* The way back and the filter readout — anchored just below the notch,
          OVER the list. Absolute so they don't shift the list: the scroll
          spotlight is measured against the list viewport, and putting a row
          above it would move every card 40pt out of the arithmetic. */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 12,
          right: 18,
          zIndex: 10,
          height: 34,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Pressable
          onPress={goBack}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Back to search"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 6 }}
        >
          <Ionicons name="chevron-back" size={20} color={c.mutedForeground} />
          <Text
            style={{
              fontFamily: 'BricolageGrotesque_600SemiBold',
              fontSize: 13,
              color: c.mutedForeground,
            }}
          >
            Search
          </Text>
        </Pressable>

        {/* A readout, and a door back to where filters are actually set. The
            sheet lives on Search; opening it here would mean a second place
            that owns the selection, and two owners is how they drift. */}
        <Pressable
          onPress={goBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={
            filterCount > 0 ? `${filterCount} filters. Change them` : 'Change filters'
          }
          style={{
            height: 30,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: c.border,
          }}
        >
          <Ionicons name="options-outline" size={12} color={c.mutedForeground} />
          <Text
            style={{
              fontFamily: 'CourierPrime_400Regular',
              fontSize: 12,
              letterSpacing: 0.5,
              color: c.mutedForeground,
            }}
          >
            {filterCount > 0 ? `filters · ${filterCount}` : 'filters'}
          </Text>
        </Pressable>
      </View>

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flex: 1 }}>
          {searching ? (
            <SearchingStage pal={pal} screen={screenMode} />
          ) : searchFailed ? (
            <SearchFailedStage onRetry={() => (screenMode ? refetchScreen() : refetch())} />
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

/**
 * The head of the page: what the lights are doing, how many came back, and —
 * new in v2 — the words you actually said, echoed underneath.
 *
 * The echo matters more than it looks. Search results that only say "18
 * monologues" leave you unsure the app heard you, especially after a long
 * natural-language query; quoting it back is the app repeating the order.
 *
 * Its height is fixed (HEADER_HEIGHT) because the scroll spotlight offsets every
 * card by it. Both the direction and the echo reserve two lines, so a long query
 * or a narrow phone wraps into space that was already there instead of pushing
 * the first card out of the arithmetic.
 */
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
  // "on screen" doesn't inflect, which is half the reason Film & TV gets its own
  // noun rather than borrowing "monologues" and sounding like a stage list.
  const noun = screen ? 'on screen.' : count === 1 ? 'monologue.' : 'monologues.';

  return (
    <View style={{ height: HEADER_HEIGHT, paddingTop: 48, paddingHorizontal: 6 }}>
      <StageDirection numberOfLines={2}>
        {screen ? '(rolling. here’s what came back.)' : '(lights to half. here’s what came back.)'}
      </StageDirection>

      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{
          marginTop: 8,
          fontFamily: 'InstrumentSerif_400Regular',
          fontSize: 40,
          lineHeight: 45,
          letterSpacing: -0.8,
          color: c.foreground,
        }}
      >
        {count}{' '}
        <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: pal.accentText }}>
          {noun}
        </Text>
      </Text>

      <View style={{ marginTop: 10, height: 38 }}>
        {query ? (
          <Text
            numberOfLines={2}
            style={{
              fontFamily: 'CourierPrime_400Regular',
              fontSize: 13,
              lineHeight: 19,
              color: c.foreground,
            }}
          >
            <Text style={{ color: c.mutedForeground }}>(you said:) </Text>
            {`“${query}”`}
          </Text>
        ) : null}
      </View>
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
 * Hunting: the script pages draw themselves in, stroke by stroke, while the line
 * below cycles through what we're asking. A hairline sweeps under it.
 *
 * No lamp here — the app is reading, not standing still. The list is shuffled
 * per mount so you don't see the same opening line every search; with a fast
 * backend most people only ever read the first one or two.
 */
function SearchingStage({ pal, screen }: { pal: MediumPalette; screen: boolean }) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
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
    if (reduce) return;
    sweep.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    // 700ms was faster than anyone can read a full line.
    const id = setInterval(() => setVi((n) => (n + 1) % lines.length), 1100);
    return () => clearInterval(id);
  }, [reduce, sweep, lines.length]);

  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -60 + sweep.value * 150 }] }));

  // Centring lives in `style`, not `className` — Uniwind drops layout
  // utilities (AGENTS.md), so items-center/justify-center silently did nothing
  // here and the sketch would sit in the top-left through every search.
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
      <Sketch name="scriptPages" size={112} stroke={c.yellow} accent={c.yellow} />
      {/* Two lines reserved: "turning the house lights down…" is 31 characters
          and will not hold one line of 16pt Courier on a narrow phone. */}
      <View style={{ height: 52, marginTop: 30, justifyContent: 'flex-start' }}>
        <StageDirection numberOfLines={2} style={{ fontSize: 16, lineHeight: 24, textAlign: 'center' }}>
          {`(${lines[vi]})`}
        </StageDirection>
      </View>
      {/* a 150pt hairline the light sweeps along */}
      <View
        style={{ marginTop: 10, width: 150, height: 1, backgroundColor: c.inactiveMeter, overflow: 'hidden' }}
      >
        <Animated.View style={[sweepStyle, { width: 60, height: 1, backgroundColor: pal.accentText }]} />
      </View>
    </View>
  );
}

/**
 * A search that found nothing isn't a dead end — it's a request. The actor can
 * ask us to add the piece they're after (spec §4, content-request).
 *
 * The stage door, ajar, with the light spilling through it: the one sketch in
 * the set that is an invitation rather than a report.
 */
function RequestStage({ query, pal }: { query: string; pal: MediumPalette }) {
  const { colors: c } = useTheme();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const ask = async () => {
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
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
      <Sketch name="stageDoor" size={104} stroke={c.mutedForeground} accent={c.yellow} />

      {sent ? (
        <>
          <Headline lines={['Sent to', 'the booth.']} em={1} tint={pal.accentText} />
          <StageDirection style={{ marginTop: 18, textAlign: 'center' }}>
            (we&apos;ll go looking.)
          </StageDirection>
        </>
      ) : (
        <>
          <Headline lines={['Not in the', 'library yet.']} em={1} tint={pal.accentText} />
          {/* Three lines: this echoes back whatever the actor typed, and a
              natural-language query ("a monologue about a woman who has just
              realised her husband is lying") runs well past two. Nothing is
              under it that a third line would push off the screen. */}
          <StageDirection numberOfLines={3} style={{ marginTop: 18, textAlign: 'center' }}>
            {query ? `(nothing for “${query}”.)` : '(nothing here yet.)'}
          </StageDirection>
          <Text
            style={{
              marginTop: 20,
              maxWidth: 280,
              textAlign: 'center',
              fontFamily: 'BricolageGrotesque_500Medium',
              fontSize: 14,
              lineHeight: 22,
              color: c.mutedForeground,
            }}
          >
            Ask for it and we go looking.{'\n'}Most requests are up inside a week.
          </Text>
          <PrimaryPill
            label="Request it"
            onPress={ask}
            disabled={sending}
            style={{ marginTop: 28, alignSelf: 'center' }}
          />
        </>
      )}
    </View>
  );
}

/**
 * The search broke — say so.
 *
 * This state did not exist before, which is exactly how the "I typed xxxx and
 * got Hamlet" bug survived: a failed request fell through to the fixture list,
 * so every failure looked like a successful search for something else. An
 * honest dead end the actor can retry beats a confident wrong answer.
 *
 * Footlights with the beams gone out, in grey rather than the house colour, and
 * the floor one step darker (handled by the caller). Nothing on this screen is
 * lit, because nothing is.
 */
function SearchFailedStage({ onRetry }: { onRetry: () => void }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
      <Sketch name="footlights" size={104} stroke={c.mutedForeground} />
      <Headline lines={['The house', 'went dark.']} em={1} tint={c.accentText} />
      <StageDirection style={{ marginTop: 18, textAlign: 'center' }}>
        (couldn&apos;t reach the library.)
      </StageDirection>
      <Text
        style={{
          marginTop: 20,
          maxWidth: 260,
          textAlign: 'center',
          fontFamily: 'BricolageGrotesque_500Medium',
          fontSize: 14,
          lineHeight: 22,
          color: c.mutedForeground,
        }}
      >
        Check your connection and try again.
      </Text>
      <PrimaryPill
        label="Try again"
        variant="outline"
        height={48}
        onPress={onRetry}
        haptic="selection"
        style={{ marginTop: 26, alignSelf: 'center' }}
      />
      <Text
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 56,
          textAlign: 'center',
          fontFamily: 'CourierPrime_400Regular_Italic',
          fontSize: 13,
          letterSpacing: 1.04,
          color: c.chevron,
        }}
      >
        (your saves are safe.)
      </Text>
    </View>
  );
}

/**
 * The two-line serif headline every dead-end state wears, with one line in
 * italic house colour. Shared so the three states cannot drift apart, and sized
 * off nothing — these strings are short enough to hold at 38 on any phone.
 */
function Headline({ lines, em, tint }: { lines: string[]; em: number; tint: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: 32 }}>
      {lines.map((l, i) => (
        <Text
          key={i}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{
            textAlign: 'center',
            fontFamily: i === em ? 'InstrumentSerif_400Regular_Italic' : 'InstrumentSerif_400Regular',
            fontSize: 38,
            lineHeight: 43,
            letterSpacing: -0.6,
            color: i === em ? tint : c.foreground,
          }}
        >
          {l}
        </Text>
      ))}
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
        style={{ marginTop: 20, paddingVertical: 10, paddingHorizontal: 24 }}
      >
        <Text
          style={{
            fontFamily: 'BricolageGrotesque_700Bold',
            fontSize: 14,
            letterSpacing: 0.4,
            color: pal.accentText,
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
  const { colors: c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingTop: 48 }}>
      <Sketch name="stageDoor" size={88} stroke={c.mutedForeground} accent={c.yellow} />
      <StageDirection style={{ marginTop: 20 }}>(nothing here yet.)</StageDirection>
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A result card under your thumb: it squares up out of its tilt and swells 3%,
 * 110ms in and 280ms out. The old version flashed an orange glow, which is the
 * one thing the v2 card has no vocabulary for — paper does not glow, it moves.
 * The card itself reads `pressed` (see PaperCard); this owns only the value.
 */
function CardButton({
  item,
  index,
  scrollY,
  viewportHeight,
  reduceMotion,
  blockColor,
  saved,
  onPress,
}: {
  item: Monologue;
  index: number;
  scrollY: SharedValue<number>;
  viewportHeight: number;
  reduceMotion: boolean;
  blockColor: string;
  saved: boolean;
  onPress: () => void;
}) {
  const pressed = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    marginBottom: CARD_GAP,
    transform: [{ scale: 1 + pressed.value * 0.03 }],
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
        blockColor={blockColor}
        saved={saved}
        pressed={pressed}
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
