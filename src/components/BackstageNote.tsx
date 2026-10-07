import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useTheme } from '../theme/ThemeContext';
import {
  markNoteShown,
  onNoteRequested,
  suppressThisSession,
  type NoteOutcome,
} from '../lib/reviewMoments';
import { openInstagram, rateGhostLight } from '../lib/maker';

/**
 * A note from backstage: the one place the app asks for a rating.
 *
 * It is a small lit page that rises from the bottom straight after something
 * went right (see src/lib/reviewMoments.ts for exactly when). It is not a
 * modal: the stage stays live behind it, and nothing is dimmed, because a
 * request for a favour should never feel like a wall.
 *
 * Mounted once in app/_layout.tsx. Screens never render it; they only record
 * moments, and the store decides.
 */

/** Routes where a note would interrupt something that matters more. */
const QUIET_ROUTES = new Set(['/', '/onboarding', '/paywall', '/auth', '/note']);

export function BackstageNoteHost() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [open, setOpen] = useState(false);

  // Seeing the paywall takes the rest of the session out of the running. Done
  // here off the route rather than inside the paywall screen, so every way of
  // reaching it counts and that screen stays untouched.
  useEffect(() => {
    if (pathname === '/paywall') suppressThisSession();
  }, [pathname]);

  useEffect(
    () =>
      onNoteRequested(() => {
        if (QUIET_ROUTES.has(pathRef.current)) return;
        // Counted the moment it appears, so a killed app still respects the
        // cooldown. The answer, if one comes, refines it.
        void markNoteShown('later');
        setOpen(true);
      }),
    [],
  );

  if (!open) return null;
  return <BackstageNote onDone={() => setOpen(false)} />;
}

export function BackstageNote({ onDone }: { onDone: () => void }) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const shown = useSharedValue(0);

  useEffect(() => {
    shown.value = withTiming(1, { duration: reduce ? 160 : 380 });
  }, [reduce, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    // Reduced motion: it fades in where it lands, no travel.
    transform: [{ translateY: reduce ? 0 : (1 - shown.value) * 48 }],
  }));

  const closing = useRef(false);
  const close = (outcome: NoteOutcome, after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    void markNoteShown(outcome);
    shown.value = withTiming(0, { duration: reduce ? 120 : 240 }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
    after?.();
  };

  const linkText = {
    fontFamily: 'CourierPrime_400Regular_Italic',
    fontSize: 14,
    letterSpacing: 0.6,
    color: c.paperMuted,
  } as const;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}
    >
      <Animated.View
        style={[style, { paddingHorizontal: 16, paddingBottom: insets.bottom + 12 }]}
      >
        <PaperCard shadow={6} rotate={-0.4} style={{ padding: 20 }}>
          <StageDirection on="paper">(a note from backstage.)</StageDirection>
          <Text
            style={{
              marginTop: 10,
              fontFamily: 'BricolageGrotesque_500Medium',
              fontSize: 15,
              lineHeight: 22,
              color: c.paperBody,
            }}
          >
            Hi, I&apos;m Canberk. I&apos;m an actor, and I build Ghost Light on my own. If it
            found you a speech, a rating helps more than you&apos;d think.
          </Text>

          <PrimaryPill
            label="Leave a rating"
            height={46}
            block
            style={{ marginTop: 18 }}
            onPress={() => close('rated', () => void rateGhostLight({ inApp: true }))}
          />

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 12,
              paddingHorizontal: 6,
            }}
          >
            <Pressable
              onPress={() => close('later')}
              accessibilityRole="button"
              accessibilityLabel="Not now"
              hitSlop={12}
              style={{ paddingVertical: 6 }}
            >
              <Text style={linkText}>not now</Text>
            </Pressable>
            <Pressable
              onPress={() => close('hi', openInstagram)}
              accessibilityRole="button"
              accessibilityLabel="Say hi on Instagram"
              hitSlop={12}
              style={{ paddingVertical: 6 }}
            >
              <Text style={[linkText, { color: c.paperInk }]}>say hi</Text>
            </Pressable>
          </View>
        </PaperCard>
      </Animated.View>
    </View>
  );
}
