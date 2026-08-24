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
import { useQuery } from '@tanstack/react-query';
import { getDiscover, requestContent, type SearchParams } from '../src/api/client';
import { apiToMonologue } from '../src/data/adapt';
import { searchScreen } from '../src/lib/screen';
import { useGoBack } from '../src/lib/nav';
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

export default function Results() {
  const { height } = useWindowDimensions();
  const router = useRouter();
  const goBack = useGoBack('/search');
  const insets = useSafeAreaInsets();
  const { tiltX, tiltY, reduceMotion } = useStageMotion();
  const { colors: c } = useTheme();

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
  const pal = mediumPalette(medium);
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
  const { data: live, isLoading, isError } = useMonologueSearch(params, hasIntent && !screenMode);

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
  } = useQuery({
    queryKey: ['screen', params],
    enabled: screenMode,
    retry: false,
    staleTime: 60_000,
    queryFn: () => searchScreen(params, 60),
  });

  // Live search results when present; live discover on cold start; the fixtures
  // as the standing fallback for both. Screen has its own Supabase source.
  const data = screenMode
    ? (screenData ?? [])
    : hasIntent
      ? (live?.monologues ?? MONOLOGUES)
      : (discoverLive && discoverLive.length ? discoverLive : MONOLOGUES);
  const count = data.length;
  const searching = screenMode ? screenLoading : hasIntent && isLoading;
  // A search that genuinely found nothing — offer to request it.
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
      return Math.min(count - 1, Math.max(0, index));
    },
    (current, previous) => {
      if (previous !== null && current !== previous && !reduceMotion) {
        runOnJS(tick)();
      }
    },
    [height, reduceMotion, count],
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
        onPress={() => router.push(`/read/${item.id}`)}
      />
    ),
    [scrollY, height, reduceMotion, router, pal.glow, pal.litBorder],
  );

  const header = useMemo(
    () => (
      <StageHeader
        count={count}
        query={params.q ?? null}
        fellBack={hasIntent && isError && !screenMode}
        medium={medium}
      />
    ),
    [count, params.q, hasIntent, isError, screenMode, medium],
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
        <Ionicons name="chevron-back" size={22} color={colors.dark.chevron} />
        <Text style={{ fontFamily: 'Montserrat_500Medium', fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.dark.chevron }}>
          Search
        </Text>
      </Pressable>

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flex: 1 }}>
        {searching ? (
          <SearchingStage pal={pal} />
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
  fellBack,
  medium,
}: {
  count: number;
  query: string | null;
  fellBack: boolean;
  medium: Medium;
}) {
  const pal = mediumPalette(medium);
  const screen = medium === 'screen';
  const noun = screen ? 'on screen' : 'monologues';
  return (
    <View style={{ height: HEADER_HEIGHT }} className="items-center justify-end pb-7">
      <GhostLight size={28} glow={pal.glow} glassStops={pal.glassStops} neck={pal.neck} />
      <Text
        className="mt-3 text-foreground"
        style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 30, lineHeight: 36 }}
      >
        {count} {count === 1 ? 'speech' : 'speeches'}
      </Text>
      <StageDirection className="mt-2">
        {fellBack
          ? '(sign in to search. the stage stands.)'
          : query
            ? `(for “${query}”.)`
            : `(${count} ${noun}. lights up.)`}
      </StageDirection>
    </View>
  );
}

/**
 * Hunting (handoff §5): the bulb and halo pulse .25 → 1 → .3 → .9 on a 1.1s loop,
 * "(looking.)" below, and an amber gradient sweeps a hairline. The full screen dip
 * choreography happens during the Search → Results cross-fade; this is the state
 * the actor lands on.
 */
function SearchingStage({ pal }: { pal: MediumPalette }) {
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0.6);
  const sweep = useSharedValue(0);
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
  }, [reduce, pulse, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -60 + sweep.value * 150 }] }));

  return (
    <View style={{ flex: 1 }} className="items-center justify-center">
      <GhostLight size={44} boost={pulse} glow={pal.glow} glassStops={pal.glassStops} neck={pal.neck} />
      <StageDirection className="mt-6">(looking.)</StageDirection>
      {/* a 150pt hairline the light sweeps along */}
      <View style={{ marginTop: 22, width: 150, height: 1, backgroundColor: colors.dark.inactiveMeter, overflow: 'hidden' }}>
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
            className="mt-6 text-center text-foreground"
            style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 30, lineHeight: 36 }}
          >
            Sent to{'\n'}the booth.
          </Text>
          <StageDirection className="mt-3">(we'll go looking.)</StageDirection>
        </>
      ) : (
        <>
          <Text
            className="mt-6 text-center text-foreground"
            style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 30, lineHeight: 36 }}
          >
            Not in the{'\n'}library yet.
          </Text>
          <StageDirection className="mt-3">{query ? `(nothing for “${query}”.)` : '(nothing here yet.)'}</StageDirection>
          <Text
            className="mt-6 text-center"
            style={{ fontFamily: 'Montserrat_400Regular', fontSize: 14, lineHeight: 21, color: colors.dark.mutedForeground }}
          >
            Ask for it and we go looking.{'\n'}Most requests are up inside a week.
          </Text>
          <View style={{ marginTop: 22 }}>
            <WordArrow label="Request it" onPress={ask} disabled={sending} tint={pal.glow} haptic="none" />
          </View>
        </>
      )}
    </View>
  );
}

function EmptyStage() {
  return (
    <View className="items-center pt-24">
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
  onPress,
}: {
  item: Monologue;
  index: number;
  scrollY: SharedValue<number>;
  viewportHeight: number;
  reduceMotion: boolean;
  accent: string;
  litBorder: string;
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
