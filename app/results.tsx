import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { MonologueCard } from '../src/components/MonologueCard';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { MONOLOGUES, type Monologue } from '../src/data/monologues';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useMonologueSearch } from '../src/hooks/useMonologueSearch';
import { useQuery } from '@tanstack/react-query';
import { getDiscover, requestContent, type SearchParams } from '../src/api/client';
import { apiToMonologue } from '../src/data/adapt';
import { colors } from '../src/theme/tokens';
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
  const { tiltX, tiltY, reduceMotion } = useStageMotion();

  const raw = useLocalSearchParams<{
    q?: string;
    gender?: string;
    age_range?: string;
    tone?: string;
    max_duration?: string;
  }>();

  const params: SearchParams = useMemo(() => {
    const p: SearchParams = {};
    if (raw.q?.trim()) p.q = raw.q.trim();
    if (raw.gender) p.gender = raw.gender;
    if (raw.age_range) p.age_range = raw.age_range;
    if (raw.tone) p.tone = raw.tone;
    if (raw.max_duration) p.max_duration = Number(raw.max_duration);
    return p;
  }, [raw.q, raw.gender, raw.age_range, raw.tone, raw.max_duration]);

  const hasIntent = Object.keys(params).length > 0;
  const { data: live, isLoading, isError, refetch } = useMonologueSearch(params, hasIntent);

  // Cold start (no query) pulls a live discover lineup; fixtures stand in until
  // there's a session, and as the offline fallback.
  const { data: discoverLive, refetch: refetchDiscover } = useQuery({
    queryKey: ['discover'],
    enabled: !hasIntent,
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => (await getDiscover(30, signal)).map(apiToMonologue),
  });

  // Pull-to-refresh recasts the stage: a live search refetches, discover pulls a
  // fresh lineup (and reshuffles the fixtures behind it).
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const discover = useMemo(
    () => (shuffleSeed === 0 ? MONOLOGUES : seededShuffle(MONOLOGUES, shuffleSeed)),
    [shuffleSeed],
  );

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
    setRefreshing(true);
    try {
      if (hasIntent) await refetch();
      else {
        setShuffleSeed((s) => s + 1);
        await refetchDiscover();
      }
    } finally {
      setRefreshing(false);
    }
  }, [hasIntent, refetch, refetchDiscover]);

  // Live search results when present; live discover on cold start; the
  // (reshuffleable) fixtures as the standing fallback for both.
  const data = hasIntent
    ? (live?.monologues ?? discover)
    : (discoverLive && discoverLive.length ? discoverLive : discover);
  const count = data.length;
  const searching = hasIntent && isLoading;
  // A live search that genuinely found nothing — offer to request it.
  const noResults = hasIntent && !isLoading && !isError && live?.monologues.length === 0;

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
        onPress={() => router.push(`/read/${item.id}`)}
      />
    ),
    [scrollY, height, reduceMotion, router],
  );

  const header = useMemo(
    () => <StageHeader count={count} query={params.q ?? null} fellBack={hasIntent && isError} />,
    [count, params.q, hasIntent, isError],
  );

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flex: 1 }}>
        {searching ? (
          <SearchingStage />
        ) : noResults ? (
          <RequestStage query={params.q ?? ''} />
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
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.stageGlow}
                colors={[colors.primary]}
                progressBackgroundColor={colors.dark.card}
              />
            }
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
}: {
  count: number;
  query: string | null;
  fellBack: boolean;
}) {
  return (
    <View style={{ height: HEADER_HEIGHT }} className="items-center justify-end pb-7">
      <GhostLight size={16} />
      <Text
        className="mt-3 text-[34px] leading-[40px] text-foreground"
        style={{ fontFamily: 'PlayfairDisplay_600SemiBold' }}
      >
        {query ? 'Results' : 'Ghost Light'}
      </Text>
      <StageDirection className="mt-2">
        {fellBack
          ? '(sign in to search. the stage stands.)'
          : query
            ? `(${count} for “${query}”.)`
            : `(${count} monologues. lights up.)`}
      </StageDirection>
    </View>
  );
}

function SearchingStage() {
  return (
    <View style={{ flex: 1 }} className="items-center justify-center">
      <GhostLight size={18} />
      <StageDirection className="mt-6">(searching the wings…)</StageDirection>
    </View>
  );
}

/**
 * A search that found nothing isn't a dead end — it's a request. The actor can
 * ask us to add the piece they're after (spec §4, content-request).
 */
function RequestStage({ query }: { query: string }) {
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
      <GhostLight size={18} stem />
      <StageDirection className="mt-6">(nothing here yet.)</StageDirection>
      {sent ? (
        <StageDirection className="mt-3">(noted. we’ll go looking.)</StageDirection>
      ) : (
        <Pressable
          onPress={ask}
          disabled={sending}
          accessibilityRole="button"
          style={{
            marginTop: 22,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.stageGlow,
            paddingHorizontal: 20,
            paddingVertical: 12,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 14, color: colors.stageGlow }}
          >
            {query ? `(request “${query}”.)` : '(request a piece.)'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function EmptyStage() {
  return (
    <View className="items-center pt-24">
      <GhostLight size={18} stem />
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
  onPress,
}: {
  item: Monologue;
  index: number;
  scrollY: SharedValue<number>;
  viewportHeight: number;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const pressed = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    marginBottom: CARD_GAP,
    transform: [{ scale: 1 + pressed.value * 0.03 }],
    shadowColor: colors.stageGlow,
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
      />
    </AnimatedPressable>
  );
}

function keyExtractor(item: Monologue) {
  return item.id;
}

/** Deterministic shuffle (mulberry32 + Fisher–Yates) so a given pull is stable. */
function seededShuffle(items: Monologue[], seed: number): Monologue[] {
  const out = items.slice();
  let s = seed >>> 0;
  const rand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function tick() {
  Haptics.selectionAsync().catch(() => {});
}
