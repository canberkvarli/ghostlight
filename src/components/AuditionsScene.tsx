import { useEffect } from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeContext';

/**
 * How auditions work, in one looping picture. The phone cut of the website's
 * intro (actorrise components/auditions/intro): a casting email is pasted in,
 * read, and folds into a ticket on the rail; then the reminder lands the night
 * before with the piece in it.
 *
 * One clock drives everything. `t` runs 0 to LOOP ms on the UI thread and each
 * element reads its own moment off it, so there is no JavaScript per frame and
 * no timers to drift apart. With reduced motion the clock is parked on the
 * finished picture.
 */

const LOOP = 9000;
const H = 320;

const MAIL = [
  'Re: The Lighthouse, callback',
  'Thursday at 10:30am, Studio B',
  "I'd love to see you again for MARA.",
  'Sides attached, bring a headshot.',
];

function seg(v: number, a: number, b: number): number {
  'worklet';
  return interpolate(v, [a, b], [0, 1], Extrapolation.CLAMP);
}

export function AuditionsScene({ style }: { style?: ViewStyle }) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      t.value = 7000;
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(LOOP, { duration: LOOP, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [reduce, t]);

  // Everything but the frame fades together at the end of the loop.
  const all = useAnimatedStyle(() => ({ opacity: 1 - seg(t.value, 8300, 8900) }));

  const placeholder = useAnimatedStyle(() => ({ opacity: 1 - seg(t.value, 300, 700) }));
  const keycap = useAnimatedStyle(() => ({
    opacity: seg(t.value, 200, 500) * (1 - seg(t.value, 1400, 1800)),
    transform: [{ scale: 0.9 + 0.1 * seg(t.value, 200, 500) }],
  }));
  const mailBox = useAnimatedStyle(() => ({
    opacity: 1 - seg(t.value, 3700, 4100),
    transform: [{ scale: 1 - 0.03 * seg(t.value, 3700, 4100) }],
  }));
  const reading = useAnimatedStyle(() => ({
    opacity: seg(t.value, 2200, 2500) * (1 - seg(t.value, 3700, 4000)),
  }));
  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(seg(t.value, 2300, 3700), [0, 1], [-40, 220]) }],
  }));
  const newTicket = useAnimatedStyle(() => {
    const k = seg(t.value, 3900, 4600);
    return {
      opacity: k,
      transform: [{ translateY: (1 - k) * -90 }, { scale: 0.96 + 0.04 * k }],
    };
  });
  const shift = useAnimatedStyle(() => ({
    transform: [{ translateY: -46 + 46 * seg(t.value, 3900, 4600) }],
  }));
  const note = useAnimatedStyle(() => {
    const k = seg(t.value, 5600, 6100);
    return { opacity: k, transform: [{ translateY: (1 - k) * -30 }] };
  });

  const mono = { fontFamily: 'CourierPrime_400Regular', fontSize: 11.5, lineHeight: 16, color: c.foreground };

  return (
    <View
      accessible
      accessibilityLabel="A casting email is pasted in, read into a ticket on your week, and the reminder lands the night before with your piece."
      style={[
        {
          height: H,
          borderRadius: 18,
          backgroundColor: c.panel,
          borderWidth: 1,
          borderColor: c.border,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View style={[{ flex: 1 }, all]}>
        {/* The paste box. */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 14,
              left: 14,
              right: 14,
              height: 112,
              borderRadius: 10,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.cardBorder,
              padding: 12,
            },
            mailBox,
          ]}
        >
          <Animated.Text
            style={[
              { position: 'absolute', left: 12, top: 12, fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 11.5, lineHeight: 16, color: c.mutedForeground },
              placeholder,
            ]}
          >
            Paste it here. The whole email is fine.
          </Animated.Text>
          {MAIL.map((line, i) => (
            <MailLine key={line} t={t} at={400 + i * 380} style={mono}>
              {line}
            </MailLine>
          ))}
          <Animated.View
            style={[
              {
                position: 'absolute',
                right: 10,
                top: 10,
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.panel,
              },
              keycap,
            ]}
          >
            <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 9, letterSpacing: 1, color: c.mutedForeground }}>
              PASTE
            </Text>
          </Animated.View>
        </Animated.View>

        {/* Reading it. */}
        <Animated.View style={[{ position: 'absolute', top: 136, left: 14, right: 14 }, reading]}>
          <Text style={{ fontFamily: 'BricolageGrotesque_500Medium', fontSize: 11.5, color: c.mutedForeground }}>
            Reading it. Finding the date and the room.
          </Text>
          <View style={{ marginTop: 6, height: 3, borderRadius: 2, backgroundColor: c.border, overflow: 'hidden' }}>
            <Animated.View style={[{ width: 60, height: 3, borderRadius: 2, backgroundColor: c.primary }, sweep]} />
          </View>
        </Animated.View>

        {/* The rail. */}
        <Text
          style={{
            position: 'absolute',
            top: 168,
            left: 14,
            fontFamily: 'CourierPrime_400Regular_Italic',
            fontSize: 11,
            color: c.mutedForeground,
          }}
        >
          (coming up)
        </Text>
        <Animated.View style={[{ position: 'absolute', top: 188, left: 14, right: 14 }, newTicket]}>
          <Ticket n="4" title="The Lighthouse" meta="Mara · Thu 10:30 · Studio B" chip="callback" />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', top: 234, left: 14, right: 14 }, shift]}>
          <Ticket n="9" title="Twelfth Night" meta="Viola · audition" dim />
          <View style={{ height: 6 }} />
          <Ticket n="16" title="Proof" meta="Catherine · self-tape" dim />
        </Animated.View>

        {/* The night before. */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 14,
              left: 14,
              right: 14,
              borderRadius: 12,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.cardBorder,
              paddingHorizontal: 12,
              paddingVertical: 10,
            },
            note,
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.yellow }} />
              <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 9.5, letterSpacing: 1, color: c.mutedForeground }}>
                GHOST LIGHT
              </Text>
            </View>
            <Text style={{ fontFamily: 'BricolageGrotesque_500Medium', fontSize: 10, color: c.mutedForeground }}>8:00 PM</Text>
          </View>
          <Text style={{ marginTop: 5, fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 13, lineHeight: 17, color: c.foreground }}>
            Your audition for Mara is tomorrow at 10:30.
          </Text>
          <Text style={{ marginTop: 2, fontFamily: 'CourierPrime_400Regular', fontSize: 11.5, lineHeight: 16, color: c.mutedForeground }}>
            Helena is in your book. Tap to read it.
          </Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function MailLine({
  t,
  at,
  style,
  children,
}: {
  t: SharedValue<number>;
  at: number;
  style: object;
  children: string;
}) {
  const a = useAnimatedStyle(() => {
    const k = seg(t.value, at, at + 300);
    return { opacity: k, transform: [{ translateY: (1 - k) * 4 }] };
  });
  return <Animated.Text style={[style, a]}>{children}</Animated.Text>;
}

/** A ticket on the rail: the countdown in the stub, the show and the part. */
function Ticket({ n, title, meta, chip, dim }: { n: string; title: string; meta: string; chip?: string; dim?: boolean }) {
  const { colors: c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 40,
        borderRadius: 6,
        backgroundColor: c.paper,
        opacity: dim ? 0.62 : 1,
        paddingHorizontal: 10,
        gap: 10,
      }}
    >
      <View style={{ width: 34, alignItems: 'center' }}>
        <Text style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 19, lineHeight: 21, color: c.paperInk }}>{n}</Text>
        <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 7.5, letterSpacing: 0.8, color: c.paperMuted }}>DAYS</Text>
      </View>
      <View style={{ width: 1, height: 24, backgroundColor: c.paperRule }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 14.5, lineHeight: 17, color: c.paperInk }}>
          {title}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: 'CourierPrime_400Regular', fontSize: 10, lineHeight: 13, color: c.paperMuted }}>
          {meta}
        </Text>
      </View>
      {chip ? (
        <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: c.primary }}>
          <Text style={{ fontFamily: 'BricolageGrotesque_700Bold', fontSize: 8.5, letterSpacing: 0.6, color: '#fff' }}>{chip.toUpperCase()}</Text>
        </View>
      ) : null}
    </View>
  );
}
