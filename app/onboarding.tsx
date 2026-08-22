import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { GhostLight } from '../src/components/GhostLight';
import { CountUp } from '../src/components/CountUp';
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { StageButton } from '../src/components/StageButton';
import { markOnboardingComplete } from '../src/lib/onboarding';
import { colors } from '../src/theme/tokens';

/**
 * Step 1 — onboarding.
 *
 * Three screens, swipeable, skippable. It sells the promise — every monologue,
 * filtered by who you actually are — and does not explain the interface. Kept
 * ruthlessly short on purpose: every onboarding screen costs installs.
 *
 * Layout note: structure is explicit React Native style, not Tailwind classes.
 * Uniwind's `className` reliably carries colour and type here but not flex/size
 * on wrapped components (SafeAreaView, Animated.ScrollView), so anything that
 * decides height or position is a real style. The pager pages are full-screen;
 * the skip link and the footer float over them so nothing fights the scroll.
 */

interface Panel {
  eyebrow: string;
  headline: string;
  line: string;
  chips?: string[];
  /** When set, the headline's first line is this number, counting up. */
  count?: number;
}

const PANELS: Panel[] = [
  {
    eyebrow: '(lights up.)',
    headline: 'monologues.',
    count: 10863,
    line: 'Every speech worth knowing, on one stage.',
  },
  {
    eyebrow: '(enter, filtered.)',
    headline: 'Filtered by who\nyou actually are.',
    line: 'Age, gender, tone, length — narrowed to parts you can walk in and book.',
    chips: ['(female.)', '(20s.)', '(comedic.)', '(under 2 min.)'],
  },
  {
    eyebrow: '(the ghost light waits.)',
    headline: 'Find your\nnext one.',
    line: 'Search is free, forever. Start reading now.',
  },
];

export default function Onboarding() {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { tiltX, tiltY } = useStageMotion();
  const scrollRef = useRef<Animated.ScrollView>(null);

  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const finish = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
    await markOnboardingComplete();
    router.replace('/search');
  }, [router]);

  const advance = useCallback(
    (current: number) => {
      Haptics.selectionAsync().catch(() => {});
      if (current >= PANELS.length - 1) {
        void finish();
        return;
      }
      scrollRef.current?.scrollTo({ x: (current + 1) * width, animated: true });
    },
    [finish, width],
  );

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={StyleSheet.absoluteFill}
      >
        {PANELS.map((panel, i) => (
          <PanelView key={i} panel={panel} index={i} width={width} height={height} scrollX={scrollX} />
        ))}
      </Animated.ScrollView>

      {/* Floating chrome: skip up top, dots + button at the foot. box-none lets
          swipes fall through to the pager while taps still land on the controls. */}
      <SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 20 }}>
          <Pressable onPress={finish} hitSlop={12} accessibilityRole="button">
            <Text
              className="text-[13px] uppercase tracking-[1.5px] text-muted-foreground"
              style={{ fontFamily: 'Montserrat_500Medium' }}
            >
              Skip
            </Text>
          </Pressable>
        </View>

        <View style={{ flex: 1 }} pointerEvents="box-none" />

        <Footer count={PANELS.length} width={width} scrollX={scrollX} onAdvance={advance} />
      </SafeAreaView>
    </View>
  );
}

function PanelView({
  panel,
  index,
  width,
  height,
  scrollX,
}: {
  panel: Panel;
  index: number;
  width: number;
  height: number;
  scrollX: SharedValue<number>;
}) {
  // A gentle fade/rise as each panel reaches centre — the words arrive, they
  // don't just slide by.
  const contentStyle = useAnimatedStyle(() => {
    const d = scrollX.value - index * width;
    return {
      opacity: interpolate(d, [-width, 0, width], [0, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(d, [-width, 0, width], [16, 0, 16], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <View
      style={{
        width,
        height,
        alignItems: 'center',
        justifyContent: 'center',
        // Clear the floating skip link and footer.
        paddingTop: 96,
        paddingBottom: 168,
        paddingHorizontal: 36,
      }}
    >
      <Animated.View style={[contentStyle, { alignItems: 'center' }]}>
        {index === 0 ? <GhostLight size={20} /> : <GhostLight size={14} stem stemHeight={54} />}

        <StageDirection className="mt-8">{panel.eyebrow}</StageDirection>

        {panel.count != null ? (
          <CountUp
            to={panel.count}
            style={{
              marginTop: 12,
              fontFamily: 'PlayfairDisplay_600SemiBold',
              fontSize: 44,
              lineHeight: 50,
              color: colors.stageGlow,
              textAlign: 'center',
              padding: 0,
            }}
          />
        ) : null}

        <Text
          className={`${panel.count != null ? 'mt-1' : 'mt-3'} text-center text-[40px] leading-[46px] text-foreground`}
          style={{ fontFamily: 'PlayfairDisplay_600SemiBold' }}
        >
          {panel.headline}
        </Text>

        <Text
          className="mt-5 text-center text-[15px] leading-[23px] text-muted-foreground"
          style={{ fontFamily: 'Montserrat_400Regular' }}
        >
          {panel.line}
        </Text>

        {panel.chips ? (
          <View style={{ marginTop: 28, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
            {panel.chips.map((chip) => (
              <View
                key={chip}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(243, 130, 29, 0.35)',
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                }}
              >
                <Text
                  className="text-[13px] lowercase"
                  style={{ fontFamily: 'CourierPrime_400Regular_Italic', color: colors.stageGlow }}
                >
                  {chip}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

function Footer({
  count,
  width,
  scrollX,
  onAdvance,
}: {
  count: number;
  width: number;
  scrollX: SharedValue<number>;
  onAdvance: (current: number) => void;
}) {
  const press = () => {
    const current = Math.round(scrollX.value / width);
    onAdvance(current);
  };

  return (
    <View style={{ paddingHorizontal: 36, paddingBottom: 24, paddingTop: 8 }}>
      <View style={{ marginBottom: 28, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        {Array.from({ length: count }).map((_, i) => (
          <Dot key={i} index={i} width={width} scrollX={scrollX} />
        ))}
      </View>

      <StageButton onPress={press}>
        <ButtonLabel count={count} width={width} scrollX={scrollX} />
      </StageButton>
    </View>
  );
}

function ButtonLabel({
  count,
  width,
  scrollX,
}: {
  count: number;
  width: number;
  scrollX: SharedValue<number>;
}) {
  // "Next" for every panel but the last, which reads "Begin". Cross-fade the two
  // so the button never pops.
  const nextStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [(count - 2) * width, (count - 1) * width],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));
  const beginStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [(count - 2) * width, (count - 1) * width],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View>
      <Animated.Text style={[nextStyle, LABEL_STYLE]}>Next</Animated.Text>
      <Animated.Text style={[beginStyle, LABEL_STYLE, { position: 'absolute', left: 0, right: 0 }]}>
        Begin
      </Animated.Text>
    </View>
  );
}

const LABEL_STYLE = {
  fontFamily: 'Montserrat_600SemiBold',
  fontSize: 14,
  letterSpacing: 2.5,
  color: colors.stageGlow,
  textAlign: 'center' as const,
  textTransform: 'uppercase' as const,
};

function Dot({
  index,
  width,
  scrollX,
}: {
  index: number;
  width: number;
  scrollX: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const d = scrollX.value - index * width;
    const active = interpolate(d, [-width, 0, width], [0, 1, 0], Extrapolation.CLAMP);
    return {
      width: 6 + active * 16,
      opacity: 0.3 + active * 0.7,
      backgroundColor: colors.stageGlow,
    };
  });
  return <Animated.View style={[{ height: 6, borderRadius: 3 }, style]} />;
}
