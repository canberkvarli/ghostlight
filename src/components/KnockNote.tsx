import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PaperCard } from './PaperCard';
import { PrimaryPill } from './PrimaryPill';
import { StageDirection } from './StageDirection';
import { answerKnock, onKnockAsk } from '../lib/nudges';
import { suppressThisSession } from '../lib/reviewMoments';
import { useTheme } from '../theme/ThemeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The one question about knocking: a small lit page in the middle of the
 * stage, straight after the first save or the first curtain. Yes puts the
 * iOS question; not now is the answer for good. Never shown at launch, never
 * shown twice. While it is up the rating note stays away for the session, so
 * two pages never land on top of each other.
 */

const QUIET_ROUTES = new Set(['/', '/curtain', '/paywall', '/auth', '/note']);

export function KnockNoteHost() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      onKnockAsk(() => {
        if (QUIET_ROUTES.has(pathRef.current)) return;
        suppressThisSession();
        setOpen(true);
      }),
    [],
  );

  if (!open) return null;
  return <KnockNote onDone={() => setOpen(false)} />;
}

function KnockNote({ onDone }: { onDone: () => void }) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const shown = useSharedValue(0);

  useEffect(() => {
    shown.value = withTiming(1, { duration: reduce ? 160 : 380 });
  }, [reduce, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { translateY: reduce ? 0 : (1 - shown.value) * 16 },
      { scale: reduce ? 1 : 0.96 + 0.04 * shown.value },
    ],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: shown.value * 0.42 }));

  const closing = useRef(false);
  const close = (yes: boolean) => {
    if (closing.current) return;
    closing.current = true;
    void answerKnock(yes);
    shown.value = withTiming(0, { duration: reduce ? 120 : 240 }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
  };

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center' }}>
      <AnimatedPressable
        onPress={() => close(false)}
        accessibilityRole="button"
        accessibilityLabel="Not now"
        style={[scrimStyle, { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#130b08' }]}
      />
      <Animated.View pointerEvents="box-none" style={[style, { paddingHorizontal: 24 }]}>
        <PaperCard shadow={6} rotate={0.4} style={{ padding: 20 }}>
          <StageDirection on="paper">(a knock in the evening?)</StageDirection>
          <Text
            style={{
              marginTop: 10,
              fontFamily: 'BricolageGrotesque_500Medium',
              fontSize: 15,
              lineHeight: 22,
              color: c.paperBody,
            }}
          >
            One line at seven: tonight&apos;s speech, or the piece you left, or the audition tomorrow.
            Never two. Quiet when you stop opening them.
          </Text>
          <PrimaryPill label="Yes, one line" height={46} block style={{ marginTop: 18 }} onPress={() => close(true)} />
          <Pressable
            onPress={() => close(false)}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            hitSlop={12}
            style={{ paddingVertical: 10, alignItems: 'center', marginTop: 4 }}
          >
            <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 14, letterSpacing: 0.6, color: c.paperMuted }}>
              not now
            </Text>
          </Pressable>
        </PaperCard>
      </Animated.View>
    </View>
  );
}
