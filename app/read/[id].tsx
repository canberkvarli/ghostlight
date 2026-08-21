import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { GhostLight } from '../../src/components/GhostLight';
import { StageDirection } from '../../src/components/StageDirection';
import { getMonologueById, formatDuration, type Monologue } from '../../src/data/monologues';
import { getMonologue } from '../../src/api/client';
import { apiToMonologue } from '../../src/data/adapt';
import { recordRead } from '../../src/lib/reads';
import { colors } from '../../src/theme/tokens';

/**
 * Step 4 — Read.
 *
 * Lights up. The card rises, the background settles to full stage dark, the
 * words fade in. The reading canvas is light — warm paper against the dark
 * shell — which inverts the app's brightness on purpose: long text reads worse
 * on pure dark, and the web app already made this call.
 *
 * This screen is where a read is spent. The counter is server-side (spec §4);
 * see src/lib/reads.ts for why it is not faked device-local.
 */
export default function Read() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Fixtures first (offline, instant); fall to the live fetch for real search
  // results whose id the device has never seen.
  const fixture = id ? getMonologueById(id) : undefined;
  const { data: fetched, isLoading, isError } = useQuery<Monologue>({
    queryKey: ['monologue', id],
    enabled: Boolean(id) && !fixture,
    retry: false,
    queryFn: async ({ signal }) => apiToMonologue(await getMonologue(id!, signal)),
  });
  const monologue = fixture ?? fetched;

  useEffect(() => {
    if (monologue) void recordRead(monologue.id);
  }, [monologue]);

  if (isLoading && !monologue) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.dark.background }}>
        <GhostLight size={16} />
        <StageDirection className="mt-6">(finding the page…)</StageDirection>
      </View>
    );
  }

  if (!monologue) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.dark.background }}>
        <StageDirection>{isError ? '(sign in to read this one.)' : '(that page is dark.)'}</StageDirection>
      </View>
    );
  }

  const body = monologue.fullText ?? monologue.excerpt;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.dark.background }}>
      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        {/* On the dark shell: the eyebrow and the way back. */}
        <View className="h-12 flex-row items-center justify-between px-5">
          <Pressable onPress={() => router.back()} hitSlop={14} accessibilityRole="button" accessibilityLabel="Back to results">
            <Text className="text-[26px] leading-[26px]" style={{ color: colors.dark.mutedForeground }}>
              ‹
            </Text>
          </Pressable>
          <StageDirection>(lights up.)</StageDirection>
          <View style={{ width: 26 }} />
        </View>

        {/* The paper rises into the light. */}
        <Animated.View
          entering={FadeInDown.duration(520).springify().damping(18)}
          className="mx-4 mb-4 flex-1 overflow-hidden"
          style={{ backgroundColor: colors.light.background, borderRadius: 20 }}
        >
          <ScrollView
            contentContainerStyle={{ padding: 28, paddingBottom: 56 }}
            showsVerticalScrollIndicator={false}
          >
            <Text
              className="text-[13px] uppercase tracking-[1.6px]"
              style={{ fontFamily: 'Montserrat_600SemiBold', color: colors.primary }}
            >
              {monologue.character}
            </Text>
            <Text
              className="mt-2 text-[30px] leading-[36px]"
              style={{ fontFamily: 'PlayfairDisplay_600SemiBold', color: colors.light.foreground }}
            >
              {monologue.title}
            </Text>
            <Text
              className="mt-2 text-[13px]"
              style={{ fontFamily: 'Montserrat_400Regular', color: colors.light.mutedForeground }}
            >
              {monologue.source} · {monologue.author} · {formatDuration(monologue.duration)}
            </Text>

            <View
              className="my-6 h-px w-full"
              style={{ backgroundColor: colors.light.border }}
            />

            {/* The words of the play, in the typewriter, dark ink on warm paper. */}
            <Animated.Text
              entering={FadeIn.delay(220).duration(600)}
              className="text-[16px]"
              style={{
                fontFamily: 'CourierPrime_400Regular',
                color: colors.light.foreground,
                lineHeight: 27,
              }}
            >
              {body}
            </Animated.Text>

            {!monologue.fullText ? (
              <Text
                className="mt-8 text-[13px] italic"
                style={{ fontFamily: 'CourierPrime_400Regular_Italic', color: colors.light.mutedForeground }}
              >
                (the rest arrives with the live text.)
              </Text>
            ) : null}
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}
