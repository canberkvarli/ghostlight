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
import { answerKnock, onKnockAsk, type KnockReason } from '../lib/nudges';
import { WeekMarks } from './WeekMarks';
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
  const [open, setOpen] = useState<KnockReason | null>(null);

  useEffect(
    () =>
      onKnockAsk((reason) => {
        if (QUIET_ROUTES.has(pathRef.current)) return;
        suppressThisSession();
        setOpen(reason);
      }),
    [],
  );

  if (!open) return null;
  return <KnockNote reason={open} onDone={() => setOpen(null)} />;
}

/**
 * After the first finished run the note is the first night's ending: the week
 * with tonight stamped, then the same question. One run is the habit, and the
 * knock is what brings them back for the second.
 */
function KnockNote({ reason, onDone }: { reason: KnockReason; onDone: () => void }) {
  const first = reason === 'curtain';
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
          {first ? (
            <>
              <Text style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 34, lineHeight: 38, letterSpacing: -0.5, color: c.paperInk }}>
                First night,{' '}<Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}>done.</Text>
              </Text>
              <View style={{ marginTop: 16, marginBottom: 18 }}><WeekMarks week={[false, false, false, false, false, false, false]} stamp size={30} /></View>
              <StageDirection on="paper">(same time tomorrow?)</StageDirection>
            </>
          ) : (
            <StageDirection on="paper">(a knock in the evening?)</StageDirection>
          )}
          <Text
            style={{
              marginTop: 10,
              fontFamily: 'BricolageGrotesque_500Medium',
              fontSize: 15,
              lineHeight: 22,
              color: c.paperBody,
            }}
          >
            {first
              ? 'One line at seven: tonight\'s speech, or the piece you just ran. Never two. Quiet when you stop opening them.'
              : 'One line at seven: tonight\'s speech, or the piece you left, or the audition tomorrow. Never two. Quiet when you stop opening them.'}
          </Text>
          <PrimaryPill label={first ? 'Knock at seven' : 'Yes, one line'} height={46} block style={{ marginTop: 18 }} onPress={() => close(true)} />
          <Pressable
            onPress={() => close(false)}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            hitSlop={12}
            style={{ paddingVertical: 10, alignItems: 'center', marginTop: 4 }}
          >
            <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 14, letterSpacing: 0.6, color: c.paperMuted }}>
              {first ? 'no reminders' : 'not now'}
            </Text>
          </Pressable>
        </PaperCard>
      </Animated.View>
    </View>
  );
}
