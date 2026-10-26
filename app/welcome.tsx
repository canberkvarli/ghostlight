import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { GhostLight } from '../src/components/GhostLight';
import { StageDirection } from '../src/components/StageDirection';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { markDemoSeen } from '../src/lib/demo';
import { track } from '../src/lib/analytics';
import { useTheme } from '../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';

export const WORKING_ON_KEY = 'ghostlight:working-on.v1';

const CHOICES: { key: string; label: string; line: string }[] = [
  { key: 'audition', label: 'An audition', line: 'sides to learn, a date on the board.' },
  { key: 'role', label: 'A role', line: 'a part already cast, lines to get down.' },
  { key: 'class', label: 'A class', line: 'scene study, a partner who is never late.' },
  { key: 'practice', label: 'Keeping sharp', line: 'nothing booked. the work between jobs.' },
];

/**
 * The one question after the account is made: what are you working on. One
 * tap. It is kept on the phone for the home to lead with, and then the week
 * is offered and the app opens on the Scene room, where they began.
 */
export default function Welcome() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const [picked, setPicked] = useState<string | null>(null);

  const pick = (key: string) => {
    if (picked) return;
    Haptics.selectionAsync().catch(() => {});
    setPicked(key);
    track('onboarding_working_on', { on: key });
    void AsyncStorage.setItem(WORKING_ON_KEY, key).catch(() => {});
    void markDemoSeen();
    setTimeout(() => {
      router.replace('/rehearse');
      router.push('/paywall');
    }, 420);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <GhostLight size={18} />
        </View>
        <Animated.View entering={FadeIn.duration(420)} style={{ flex: 1, paddingHorizontal: 24, paddingTop: 10 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 42, lineHeight: 48, letterSpacing: -0.8, color: c.foreground }}>
            What are you{'\n'}<Text style={{ fontFamily: SERIF_I, color: c.accentText }}>working on?</Text>
          </Text>
          <StageDirection style={{ marginTop: 10 }}>(one tap. it decides what we put first.)</StageDirection>
          <View style={{ marginTop: 26, gap: 10 }}>
            {CHOICES.map((o) => {
              const on = picked === o.key;
              return (
                <Pressable key={o.key} onPress={() => pick(o.key)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={({ pressed }) => ({ paddingVertical: 16, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1.5, borderColor: on ? c.accentText : c.border, backgroundColor: on ? c.panel : 'transparent', opacity: pressed ? 0.75 : 1 })}>
                  <Text style={{ fontFamily: SANS_B, fontSize: 18, color: c.foreground }}>{o.label}</Text>
                  <Text style={{ marginTop: 3, fontFamily: SANS, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground }}>{o.line}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}
