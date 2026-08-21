import { useCallback } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useSharedValue } from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { MonologueCard } from '../src/components/MonologueCard';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useFavorites } from '../src/hooks/useFavorites';
import { useSession } from '../src/lib/useSession';
import { CARD_GAP } from '../src/theme/layout';
import type { Monologue } from '../src/data/monologues';

/**
 * Step 6 — the saved list. Every card sits lit (there is no spotlight to chase
 * here, the same way reduced-motion lights the whole stage). Anonymous users
 * see the door to sign in; the saves themselves are server-backed because they
 * are a paid feature and must be real.
 */
export default function Saves() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { tiltX, tiltY } = useStageMotion();
  const { isAuthenticated } = useSession();
  const { data, isLoading } = useFavorites(isAuthenticated);

  // The card wants a scroll offset; here nothing chases the light, so it is a
  // frozen zero and every card is lit via reduceMotion.
  const frozenScroll = useSharedValue(0);

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
          scrollY={frozenScroll}
          viewportHeight={width}
          reduceMotion
        />
      </Pressable>
    ),
    [router, frozenScroll, width],
  );

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text className="text-[26px] leading-[26px]" style={{ color: '#a59d95' }}>
              ‹
            </Text>
          </Pressable>
          <Text
            className="ml-3 text-[20px] text-foreground"
            style={{ fontFamily: 'PlayfairDisplay_600SemiBold' }}
          >
            Saved
          </Text>
        </View>

        {!isAuthenticated ? (
          <Center>
            <GhostLight size={18} stem />
            <StageDirection className="mt-6">(sign in to keep monologues.)</StageDirection>
          </Center>
        ) : isLoading ? (
          <Center>
            <GhostLight size={16} />
            <StageDirection className="mt-6">(gathering your saves…)</StageDirection>
          </Center>
        ) : (
          <View style={{ flex: 1 }}>
            <FlashList
              data={data ?? []}
              renderItem={renderItem}
              keyExtractor={(m) => m.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 96 }}
              ListEmptyComponent={
                <Center>
                  <GhostLight size={18} stem />
                  <StageDirection className="mt-6">(nothing saved yet.)</StageDirection>
                </Center>
              }
            />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1 }} className="items-center justify-center pb-24">{children}</View>;
}
