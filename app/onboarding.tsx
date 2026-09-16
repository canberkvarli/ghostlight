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
import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { Ionicons } from '@expo/vector-icons';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { markOnboardingComplete } from '../src/lib/onboarding';
import { colors } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeContext';

/**
 * Onboarding (handoff §6). One lamp, three scenes: the lamp is pinned at 27% and
 * never moves — the copy track slides beneath it, so it reads as one continuous
 * room rather than three screens. Copy starts at a fixed 45%, never vertically
 * centred, or the amount of copy would move the bulb.
 *
 * Sells the promise, doesn't explain the interface. Ruthlessly short — every
 * onboarding screen costs installs. Copy is exact; do not rewrite it.
 */

interface Panel {
  eyebrow: string;
  headline: string;
  line: string;
  chips?: string[];
}

const PANELS: Panel[] = [
  {
    eyebrow: '(lights up.)',
    headline: 'Every speech\nworth knowing.',
    line: 'Shakespeare to last season’s premieres, gathered on one stage.',
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

const GLASS_W = 85;
// The glass centre sits 1.34×W below the Canvas top (halo padding); offset the
// container so the glass — not the assembly — lands on the 27% line.
const GLASS_OFFSET = 1.34 * GLASS_W;

export default function Onboarding() {
  const { colors: c } = useTheme();
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

      {/* The one lamp, pinned at 27% and never moving. Over the pager, taps pass through. */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: height * 0.27 - GLASS_OFFSET, alignItems: 'center' }}
      >
        <GhostLight size={GLASS_W} />
      </View>

      {/* Floating chrome: skip up top, dots + button at the foot. */}
      <SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 24 }}>
          <Pressable onPress={finish} hitSlop={12} accessibilityRole="button">
            <Text
              style={{ fontFamily: 'BricolageGrotesque_500Medium', fontSize: 13, letterSpacing: 4.5, textTransform: 'uppercase', color: c.mutedForeground }}
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
  // A gentle fade as each panel reaches centre — the words arrive, they don't
  // just slide by. The lamp above stays lit and still.
  const contentStyle = useAnimatedStyle(() => {
    const d = scrollX.value - index * width;
    return {
      opacity: interpolate(d, [-width, 0, width], [0, 1, 0], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(d, [-width, 0, width], [16, 0, 16], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={{ width, height, paddingTop: height * 0.45, paddingBottom: 160, paddingHorizontal: 36, alignItems: 'center' }}>
      <Animated.View style={[contentStyle, { alignItems: 'center' }]}>
        <StageDirection>{panel.eyebrow}</StageDirection>

        <Text
          className="text-center text-foreground"
          style={{ fontFamily: 'InstrumentSerif_400Regular', marginTop: 16, fontSize: 44, lineHeight: 52 }}
        >
          {panel.headline}
        </Text>

        <Text
          className="text-center text-[15px] leading-[23px] text-muted-foreground"
          style={{ fontFamily: 'BricolageGrotesque_500Medium', marginTop: 28 }}
        >
          {panel.line}
        </Text>

        {panel.chips ? (
          <View style={{ marginTop: 26, maxWidth: 300, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
            {panel.chips.map((chip) => (
              <View
                key={chip}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(243, 130, 29, 0.35)',
                  backgroundColor: 'rgba(243, 130, 29, 0.05)',
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                }}
              >
                <Text className="text-[13px] lowercase" style={{ fontFamily: 'CourierPrime_400Regular_Italic', color: colors.stageGlow }}>
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
  const press = () => onAdvance(Math.round(scrollX.value / width));

  return (
    <View
      style={{
        paddingHorizontal: 32,
        paddingBottom: 44,
        paddingTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {Array.from({ length: count }).map((_, i) => (
          <Dot key={i} index={i} width={width} scrollX={scrollX} />
        ))}
      </View>

      <Pressable
        onPress={press}
        accessibilityRole="button"
        hitSlop={16}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}
      >
        <ButtonLabel count={count} width={width} scrollX={scrollX} />
        <Ionicons name="arrow-forward" size={20} color={colors.stageGlow} />
      </Pressable>
    </View>
  );
}

function ButtonLabel({ count, width, scrollX }: { count: number; width: number; scrollX: SharedValue<number> }) {
  const nextStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [(count - 2) * width, (count - 1) * width], [1, 0], Extrapolation.CLAMP),
  }));
  const beginStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [(count - 2) * width, (count - 1) * width], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <View>
      <Animated.Text numberOfLines={1} style={[beginStyle, LABEL_STYLE]}>
        Begin
      </Animated.Text>
      <Animated.Text numberOfLines={1} style={[nextStyle, LABEL_STYLE, { position: 'absolute', left: 0, right: 0 }]}>
        Next
      </Animated.Text>
    </View>
  );
}

const LABEL_STYLE = {
  fontFamily: 'BricolageGrotesque_600SemiBold',
  fontSize: 14,
  letterSpacing: 2.5,
  color: colors.stageGlow,
  textAlign: 'center' as const,
  textTransform: 'uppercase' as const,
};

function Dot({ index, width, scrollX }: { index: number; width: number; scrollX: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const d = scrollX.value - index * width;
    const active = interpolate(d, [-width, 0, width], [0, 1, 0], Extrapolation.CLAMP);
    return {
      width: 6 + active * 20,
      opacity: 0.28 + active * 0.72,
      backgroundColor: colors.stageGlow,
    };
  });
  return <Animated.View style={[{ height: 6, borderRadius: 3 }, style]} />;
}
