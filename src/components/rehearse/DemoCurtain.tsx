import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { GuidedScene } from '../../api/rehearsal';
import { KEY_WORDS } from '../../lib/demo';
import { PaperCard } from '../PaperCard';
import { PrimaryPill } from '../PrimaryPill';
import { StageDirection } from '../StageDirection';
import { useTheme } from '../../theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const CAP = 'BricolageGrotesque_700Bold';
const MONO_I = 'CourierPrime_400Regular_Italic';

/**
 * The curtain call of a first scene. Lights down, the title, and then the
 * actor's own numbers: how many of their lines the partner heard, and how
 * long it ran. That is the proof no copy can give: it listened to them.
 *
 * After the first scene, the other keys are offered, "another, in a
 * different key?". After the second, the week: the offer's stage, with the
 * paywall itself unchanged behind it. "Not tonight" is always there and
 * says they will be back.
 */
export function DemoCurtain({ title, which, heard, of, seconds, others, termsLine, onAnother, onWeek, onNotTonight }: {
  title: string;
  /** Which first scene this was: the first or the second. */
  which: 1 | 2;
  heard: number;
  of: number;
  seconds: number;
  /** The keys not yet run, as cards. */
  others: GuidedScene[];
  /** The trial terms, from the offer, for the second curtain call. */
  termsLine: string | null;
  onAnother: (key: string) => void;
  onWeek: () => void;
  onNotTonight: () => void;
}) {
  const { colors: c } = useTheme();
  const all = of > 0 && heard >= of;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const ran = mins ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs} seconds`;
  return (
    <Animated.View entering={FadeIn.duration(420)} style={{ flex: 1, paddingHorizontal: 28, paddingTop: 36 }}>
      <StageDirection>(lights down.)</StageDirection>
      <Text style={{ marginTop: 12, fontFamily: SERIF, fontSize: 36, lineHeight: 40, letterSpacing: -0.5, color: c.foreground }}>{title}</Text>

      {/* Their numbers. */}
      <View style={{ marginTop: 26, flexDirection: 'row', gap: 18 }}>
        <Figure n={of ? `${heard}/${of}` : '–'} line={all ? 'lines heard. every one.' : 'of your lines heard.'} />
        <Figure n={ran} line="the scene ran." />
      </View>
      <Text style={{ marginTop: 18, fontFamily: SANS, fontSize: 14.5, lineHeight: 21, color: c.mutedForeground }}>
        {all
          ? 'It waited for you and came in on your last word, every time. That is what a partner does.'
          : 'It waited for you and came in on your last word. The lines it missed, say a little louder next time; it learns your room.'}
      </Text>

      {which === 1 && others.length ? (
        <View style={{ marginTop: 30 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 28, lineHeight: 32, letterSpacing: -0.3, color: c.foreground }}>
            Another, <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>in a different key?</Text>
          </Text>
          <View style={{ marginTop: 14, gap: 12 }}>
            {others.map((s, i) => {
              const words = KEY_WORDS[s.key] ?? { eyebrow: s.title.toUpperCase(), tone: s.hook ?? '' };
              return (
                <Pressable key={s.key} onPress={() => { Haptics.selectionAsync().catch(() => {}); onAnother(s.key); }} accessibilityRole="button" accessibilityLabel={s.title}>
                  <PaperCard rotate={i % 2 ? 0.4 : -0.4} shadow={6} style={{ padding: 16 }}>
                    <Text style={{ fontFamily: CAP, fontSize: 9.5, letterSpacing: 1.6, color: c.accentText }}>{words.eyebrow}</Text>
                    <Text style={{ marginTop: 6, fontFamily: SERIF, fontSize: 22, lineHeight: 26, color: c.paperInk }}>{s.hook ?? s.title}</Text>
                    <Text style={{ marginTop: 6, fontFamily: MONO_I, fontSize: 12.5, color: c.paperMuted }}>({s.characters.map(ch => ch.name.toLowerCase()).join(' and ')}.)</Text>
                  </PaperCard>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 30 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 28, lineHeight: 32, letterSpacing: -0.3, color: c.foreground }}>
            The whole <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>stage.</Text>
          </Text>
          <Text style={{ marginTop: 8, fontFamily: SANS, fontSize: 14.5, lineHeight: 21, color: c.mutedForeground }}>
            Every scene in the library, your own sides, and a partner for all of them. The three you just met are in your house for good.
          </Text>
          <PrimaryPill label="Start the free week" onPress={onWeek} height={54} block haptic="medium" style={{ marginTop: 18 }} />
          {termsLine ? <Text style={{ marginTop: 10, textAlign: 'center', fontFamily: SANS, fontSize: 11.5, lineHeight: 16, color: c.chevron }}>{termsLine}</Text> : null}
        </View>
      )}

      <Pressable onPress={onNotTonight} hitSlop={12} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: 26, paddingVertical: 8 }}>
        <Text style={{ fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.6, color: c.mutedForeground }}>(not tonight.)</Text>
      </Pressable>
    </Animated.View>
  );
}

function Figure({ n, line }: { n: string; line: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 44, letterSpacing: -0.6, color: c.accentText }}>{n}</Text>
      <Text style={{ marginTop: 2, fontFamily: MONO_I, fontSize: 12.5, letterSpacing: 0.4, color: c.mutedForeground }}>({line})</Text>
    </View>
  );
}
