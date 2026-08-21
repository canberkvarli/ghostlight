import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  FadeIn,
  useReducedMotion,
  withSpring,
  withTiming,
  type EntryAnimationsValues,
} from 'react-native-reanimated';

import { GhostLight } from '../../src/components/GhostLight';
import { StageDirection } from '../../src/components/StageDirection';
import { PaywallShroud } from '../../src/components/PaywallShroud';
import { getMonologueById, formatDuration, type Monologue } from '../../src/data/monologues';
import { getMonologue, getReadState } from '../../src/api/client';
import { apiToMonologue } from '../../src/data/adapt';
import { recordRead } from '../../src/lib/reads';
import { useSession } from '../../src/lib/useSession';
import { useGoBack } from '../../src/lib/nav';
import { useIsFavorited, useToggleFavorite } from '../../src/hooks/useFavorites';
import * as Haptics from 'expo-haptics';
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
/**
 * The curtain rises: the paper is below the stage, dim and a touch small, then
 * springs up into the light as the words fade in behind it. A real theatre cue,
 * not a slide.
 */
function curtainRise(_values: EntryAnimationsValues) {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 64 }, { scale: 0.96 }] },
    animations: {
      opacity: withTiming(1, { duration: 420 }),
      transform: [
        { translateY: withSpring(0, { damping: 17, stiffness: 90 }) },
        { scale: withSpring(1, { damping: 17, stiffness: 90 }) },
      ],
    },
  };
}

export default function Read() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack('/search');
  const reduceMotion = useReducedMotion();
  const { height, width } = useWindowDimensions();

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

  const { isAuthenticated } = useSession();
  const favorited = useIsFavorited(id ?? '', isAuthenticated);
  const toggleFavorite = useToggleFavorite();

  // The wall (spec §5, Step 7). Free users get three reads, lifetime; the server
  // owns the count (src/lib/reads.ts). If we can't reach it — no session yet,
  // anon sign-ins still off — we don't gate: reading never breaks on a missing
  // counter, the wall just doesn't fire until the backend is live.
  const { data: wall } = useQuery({
    queryKey: ['read-wall'],
    queryFn: ({ signal }) => getReadState(signal),
    retry: false,
    staleTime: 15_000,
  });
  // Server-authoritative first: if the API withheld the text (paywalled), we're
  // walled no matter what the client thinks. Fall back to the usage counter for
  // fixtures and offline, which carry no server flag.
  const gated = monologue?.paywalled === true || wall?.atWall === true;

  const onSave = () => {
    if (!monologue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // The first save is what asks for an account — never launch (spec §5).
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }
    toggleFavorite.mutate({ id: monologue.id, on: !favorited });
  };

  useEffect(() => {
    // Spend a read only when one is actually being read — never behind the wall.
    if (monologue && !gated) void recordRead(monologue.id);
  }, [monologue, gated]);

  if (isLoading && !monologue) {
    return (
      <View className="items-center justify-center" style={{ flex: 1, backgroundColor: colors.dark.background }}>
        <GhostLight size={16} />
        <StageDirection className="mt-6">(finding the page…)</StageDirection>
      </View>
    );
  }

  if (!monologue) {
    return (
      <View className="items-center justify-center" style={{ flex: 1, backgroundColor: colors.dark.background }}>
        <StageDirection>{isError ? '(sign in to read this one.)' : '(that page is dark.)'}</StageDirection>
      </View>
    );
  }

  const body = monologue.fullText ?? monologue.excerpt;

  return (
    <View style={{ flex: 1, backgroundColor: colors.dark.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* On the dark shell: the eyebrow and the way back. */}
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
          <Pressable onPress={goBack} hitSlop={14} accessibilityRole="button" accessibilityLabel="Back to results">
            <Text className="text-[26px] leading-[26px]" style={{ color: colors.dark.mutedForeground }}>
              ‹
            </Text>
          </Pressable>
          <StageDirection>(lights up.)</StageDirection>
          <Pressable onPress={onSave} hitSlop={14} accessibilityRole="button" accessibilityLabel={favorited ? 'Unsave' : 'Save'}>
            <Text
              className="text-[22px] leading-[26px]"
              style={{ color: favorited ? colors.stageGlow : colors.dark.mutedForeground }}
            >
              {favorited ? '★' : '☆'}
            </Text>
          </Pressable>
        </View>

        {/* The paper rises into the light. */}
        <Animated.View
          entering={reduceMotion ? undefined : curtainRise}
          style={{
            flex: 1,
            marginHorizontal: 16,
            marginBottom: 16,
            overflow: 'hidden',
            backgroundColor: colors.light.background,
            borderRadius: 20,
          }}
        >
          <ScrollView
            contentContainerStyle={{ padding: 28, paddingBottom: gated ? 220 : 56 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!gated}
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
              style={{ marginVertical: 24, height: 1, width: '100%', backgroundColor: colors.light.border }}
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
              {gated ? monologue.excerpt : body}
            </Animated.Text>

            {gated ? null : !monologue.fullText ? (
              <Text
                className="mt-8 text-[13px] italic"
                style={{ fontFamily: 'CourierPrime_400Regular_Italic', color: colors.light.mutedForeground }}
              >
                (the rest arrives with the live text.)
              </Text>
            ) : null}
          </ScrollView>

          {/* The wall: they've seen it is genuinely their part; now the light
              dims on the rest and the bulb comes back carrying the offer. */}
          {gated ? (
            <Animated.View
              entering={FadeIn.delay(400).duration(700)}
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.52 }}
              pointerEvents="box-none"
            >
              <PaywallShroud width={width - 32} height={height * 0.52} />
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  alignItems: 'center',
                  paddingHorizontal: 28,
                  paddingBottom: 28,
                }}
              >
                <GhostLight size={16} />
                <StageDirection className="mt-4">(three reads were the trial.)</StageDirection>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    router.push('/paywall');
                  }}
                  accessibilityRole="button"
                  style={{
                    marginTop: 16,
                    alignSelf: 'stretch',
                    height: 52,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 16,
                    backgroundColor: colors.primary,
                  }}
                >
                  <Text
                    className="text-[15px] uppercase tracking-[2px] text-white"
                    style={{ fontFamily: 'Montserrat_600SemiBold' }}
                  >
                    Unlock every monologue
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}
