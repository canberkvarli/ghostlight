import { useCallback, useMemo } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { MonologueCard } from '../src/components/MonologueCard';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { MONOLOGUES, type Monologue } from '../src/data/monologues';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useMonologueSearch } from '../src/hooks/useMonologueSearch';
import type { SearchParams } from '../src/api/client';
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
  const { data: live, isLoading, isError } = useMonologueSearch(params, hasIntent);

  // Live results when the search returned them; fixtures for the discover case
  // and as the fallback when a search cannot run yet.
  const data = hasIntent && live ? live.monologues : MONOLOGUES;
  const count = data.length;
  const searching = hasIntent && isLoading;

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
      <Pressable
        style={{ marginBottom: CARD_GAP }}
        onPress={() => router.push(`/read/${item.id}`)}
        accessibilityRole="button"
      >
        <MonologueCard
          item={item}
          index={index}
          scrollY={scrollY}
          viewportHeight={height}
          reduceMotion={reduceMotion}
        />
      </Pressable>
    ),
    [scrollY, height, reduceMotion, router],
  );

  const header = useMemo(
    () => <StageHeader count={count} query={params.q ?? null} fellBack={hasIntent && isError} />,
    [count, params.q, hasIntent, isError],
  );

  return (
    <View className="flex-1">
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flex: 1 }}>
        {searching ? (
          <SearchingStage />
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
    <View className="flex-1 items-center justify-center">
      <GhostLight size={18} />
      <StageDirection className="mt-6">(searching the wings…)</StageDirection>
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

function keyExtractor(item: Monologue) {
  return item.id;
}

function tick() {
  Haptics.selectionAsync().catch(() => {});
}
