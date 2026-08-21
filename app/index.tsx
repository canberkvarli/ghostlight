import { useCallback, useMemo } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import {
  CARD_GAP,
  CARD_HEIGHT,
  FOCUS_POINT,
  HEADER_HEIGHT,
  LIST_PADDING_TOP,
  ROW_HEIGHT,
} from '../src/theme/layout';

/**
 * Step 0 — the spike.
 *
 * Twenty hardcoded monologues on a dark stage. No search, no auth, no
 * navigation, no payments. The one question it exists to answer is whether
 * Ghost Light feels right in the hand: does the tilt read as a stage light or
 * as a gimmick, and does the lit centre card make scrolling feel like looking
 * rather than scanning.
 */

// Reanimated's own animated wrapper, not FlashList's exported `AnimatedFlashList`
// — that one wraps React Native's Animated, whose scroll handler runs on the JS
// thread. The whole point here is that it does not.
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as React.ComponentType<FlashListProps<Monologue>>,
);

export default function ResultsSpike() {
  const { height } = useWindowDimensions();
  const { tiltX, tiltY, reduceMotion } = useStageMotion();

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
      return Math.min(MONOLOGUES.length - 1, Math.max(0, index));
    },
    (current, previous) => {
      if (previous !== null && current !== previous && !reduceMotion) {
        runOnJS(tick)();
      }
    },
    [height, reduceMotion],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Monologue; index: number }) => (
      <View style={{ marginBottom: CARD_GAP }}>
        <MonologueCard
          item={item}
          index={index}
          scrollY={scrollY}
          viewportHeight={height}
          reduceMotion={reduceMotion}
        />
      </View>
    ),
    [scrollY, height, reduceMotion],
  );

  const header = useMemo(() => <StageHeader count={MONOLOGUES.length} />, []);

  return (
    <View className="flex-1">
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <SafeAreaView className="flex-1" edges={['top']}>
        <AnimatedFlashList
          data={MONOLOGUES}
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
      </SafeAreaView>
    </View>
  );
}

function StageHeader({ count }: { count: number }) {
  return (
    <View style={{ height: HEADER_HEIGHT }} className="items-center justify-end pb-7">
      <GhostLight size={16} />
      <Text
        className="mt-3 text-[34px] leading-[40px] text-foreground"
        style={{ fontFamily: 'PlayfairDisplay_600SemiBold' }}
      >
        Ghost Light
      </Text>
      <StageDirection className="mt-2">({count} monologues. lights up.)</StageDirection>
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
