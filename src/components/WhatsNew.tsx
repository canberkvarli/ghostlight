import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
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
import { hasRated, markRated, suppressThisSession } from '../lib/reviewMoments';
import { markWhatsNewSeen, shouldShowWhatsNew, WHATS_NEW_VERSION } from '../lib/whatsNew';
import { rateGhostLight } from '../lib/maker';
import { track } from '../lib/analytics';
import { useTheme } from '../theme/ThemeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * What's new, for someone who updated: a small lit page once per release,
 * after the launch sequence, never over the reader, a run or the paywall.
 * The scene is the filled button, because a rating means more after a run;
 * the store's write-review page is the quiet one beside not now, and it is
 * left out for anyone who has rated already. A session that shows it keeps
 * the rating note away, so two pages never land on top of each other.
 */

const QUIET_ROUTES = new Set(['/', '/curtain', '/paywall', '/auth', '/note']);
const BUSY_PREFIXES = ['/read', '/rehearse/', '/prep'];

/** Decided before the rating note's own launch nudge could queue. */
const CHECK_AFTER_MS = 3000;
/** And shown once the launch sequence is long gone. */
const SHOW_AFTER_MS = 6000;

function quiet(path: string) {
  return QUIET_ROUTES.has(path) || BUSY_PREFIXES.some((p) => path.startsWith(p));
}

export function WhatsNewHost() {
  const pathname = usePathname();
  const [wanted, setWanted] = useState(false);
  const [open, setOpen] = useState(false);
  const [rated, setRated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let show: ReturnType<typeof setTimeout> | null = null;
    const check = setTimeout(async () => {
      if (!(await shouldShowWhatsNew()) || cancelled) return;
      suppressThisSession();
      setRated(await hasRated());
      show = setTimeout(() => !cancelled && setWanted(true), SHOW_AFTER_MS - CHECK_AFTER_MS);
    }, CHECK_AFTER_MS);
    return () => {
      cancelled = true;
      clearTimeout(check);
      if (show) clearTimeout(show);
    };
  }, []);

  // Waits for a calm room: the curtain or a run in progress keeps it for later
  // in the session, and a session that never finds one tries again next launch.
  useEffect(() => {
    if (!wanted || open || quiet(pathname)) return;
    setWanted(false);
    markWhatsNewSeen();
    track('app_whats_new', { version: WHATS_NEW_VERSION, action: 'shown' });
    setOpen(true);
  }, [wanted, open, pathname]);

  if (!open) return null;
  return <WhatsNew rated={rated} onDone={() => setOpen(false)} />;
}

function WhatsNew({ rated, onDone }: { rated: boolean; onDone: () => void }) {
  const { colors: c } = useTheme();
  const router = useRouter();
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
  const close = (action: 'scene' | 'review' | 'later', after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    track('app_whats_new', { version: WHATS_NEW_VERSION, action });
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
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center' }}>
      <AnimatedPressable
        onPress={() => close('later')}
        accessibilityRole="button"
        accessibilityLabel="Not now"
        style={[scrimStyle, { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#130b08' }]}
      />
      <Animated.View pointerEvents="box-none" style={[style, { paddingHorizontal: 24 }]}>
        <PaperCard shadow={6} rotate={-0.4} style={{ padding: 20 }}>
          <StageDirection on="paper">(new in the house.)</StageDirection>
          <Text
            style={{
              marginTop: 10,
              fontFamily: 'BricolageGrotesque_500Medium',
              fontSize: 15,
              lineHeight: 22,
              color: c.paperBody,
            }}
          >
            A scene partner. Bring your sides from Mail or paste them in, pick your part, and
            Ghost Light reads everyone else and waits for your line.
          </Text>
          <PrimaryPill
            label="Try a scene"
            height={46}
            block
            style={{ marginTop: 18 }}
            onPress={() =>
              close('scene', () =>
                router.push({ pathname: '/rehearse/[id]', params: { id: 'guided', from: 'guided' } }),
              )
            }
          />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: rated ? 'center' : 'space-between',
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
            {rated ? null : (
              <Pressable
                onPress={() =>
                  close('review', () => {
                    track('app_review_prompted', { from: 'whats_new' });
                    void markRated();
                    void rateGhostLight({ inApp: false });
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="Write a review on the App Store"
                hitSlop={12}
                style={{ paddingVertical: 6 }}
              >
                <Text style={[linkText, { color: c.paperInk }]}>write a review</Text>
              </Pressable>
            )}
          </View>
        </PaperCard>
      </Animated.View>
    </View>
  );
}
