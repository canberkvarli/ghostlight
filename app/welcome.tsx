import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { GhostLight } from '../src/components/GhostLight';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { markDemoSeen, markWelcomed } from '../src/lib/demo';
import { roomFor } from './first-night';
import { track } from '../src/lib/analytics';
import { PLAYS_KEY, type Plays } from '../src/lib/plays';
import { supabase } from '../src/lib/supabase';
import { useTheme } from '../src/theme/ThemeContext';
import { monologueRoomsShown, pick, useL, useLocale } from '../src/i18n';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';

export const WORKING_ON_KEY = 'ghostlight:working-on.v1';

// Functions, not constants, so the words follow the language. The keys, ages
// and sources saved and tracked stay in English whatever the screen shows.
const WORKING_ON = (): { key: string; label: string; line: string }[] => [
  { key: 'audition', label: pick('An audition', 'Bir seçme'), line: pick('sides to learn, a date on the board.', 'öğrenilecek bir metin, takvimde bir tarih.') },
  { key: 'role', label: pick('A role', 'Bir rol'), line: pick('a part already cast, lines to get down.', 'kesinleşmiş bir rol, ezberlenecek replikler.') },
  { key: 'class', label: pick('A class', 'Bir ders'), line: pick('scene study, a partner who is never late.', 'sahne çalışması, hiç geç kalmayan bir partner.') },
  { key: 'practice', label: pick('Keeping sharp', 'Formda kalmak'), line: pick('nothing booked. the work between jobs.', 'elde iş yok. iki iş arası çalışma.') },
];
const HOUSES = (): { key: 'stage' | 'screen' | 'both'; label: string }[] => [
  { key: 'stage', label: pick('Stage', 'Sahne') },
  { key: 'screen', label: pick('Screen', 'Ekran') },
  { key: 'both', label: pick('Both', 'İkisi de') },
];
const AGES = ['Teens', '20s', '30s', '40s+'];
const ageLabel = (a: string): string => {
  switch (a) {
    case 'Teens': return pick('Teens', 'Genç');
    case '20s': return pick('20s', "20'ler");
    case '30s': return pick('30s', "30'lar");
    case '40s+': return pick('40s+', '40+');
    default: return a;
  }
};
const SOURCES = (): { value: string; label: string }[] => [
  { value: 'The App Store', label: pick('The App Store', 'App Store') },
  { value: 'A friend', label: pick('A friend', 'Bir arkadaş') },
  { value: 'A teacher', label: pick('A teacher', 'Bir hoca') },
  { value: 'TikTok', label: 'TikTok' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'ChatGPT or another AI', label: pick('ChatGPT or another AI', 'ChatGPT ya da başka bir yapay zekâ') },
  { value: 'Somewhere else', label: pick('Somewhere else', 'Başka bir yer') },
];

/**
 * Three quick questions after the account is made, one screen each, every one
 * skippable: what you are working on, what you play, how you heard of us. The
 * first two shape the app from the first night (Search opens on your house);
 * the third is ours. Nothing is sold here: the first answer opens its own room
 * (app/first-night.tsx), and the paywall waits for a moment they earn.
 */
export default function Welcome() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [house, setHouse] = useState<Plays['house']>(null);
  const [age, setAge] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const L = useL();

  // The first answer picks the first night. Turkish has no monologue rooms: the
  // scene partner is home there, as before.
  const [workingOn, setWorkingOn] = useState<string | null>(null);
  const locale = useLocale();
  useEffect(() => { void markWelcomed(); }, []);
  const finish = () => {
    void markDemoSeen();
    void supabase.auth.updateUser({ data: { welcomed: '1' } }).catch(() => {});
    if (!monologueRoomsShown(locale)) { router.replace('/rehearse'); return; }
    router.replace({ pathname: '/first-night', params: { room: roomFor(workingOn) } });
  };
  const skip = () => {
    Haptics.selectionAsync().catch(() => {});
    track('onboarding_question_skipped', { step });
    if (step === 3) finish();
    else setStep((s) => (s + 1) as 2 | 3);
  };
  // Kept on the phone for the app to use, and on the account so a new phone knows too.
  const remember = (data: Record<string, string | null>) => {
    void supabase.auth.updateUser({ data }).catch(() => {});
  };

  const pickWorkingOn = (key: string) => {
    if (busy) return;
    setBusy(true);
    Haptics.selectionAsync().catch(() => {});
    track('onboarding_working_on', { on: key });
    setWorkingOn(key);
    void AsyncStorage.setItem(WORKING_ON_KEY, key).catch(() => {});
    remember({ working_on: key });
    setTimeout(() => { setBusy(false); setStep(2); }, 320);
  };
  const savePlays = () => {
    Haptics.selectionAsync().catch(() => {});
    track('onboarding_plays', { house: house ?? 'none', age: age ?? 'none' });
    void AsyncStorage.setItem(PLAYS_KEY, JSON.stringify({ house, age } satisfies Plays)).catch(() => {});
    remember({ plays_house: house, plays_age: age });
    setStep(3);
  };
  const pickSource = (from: string) => {
    if (busy) return;
    setBusy(true);
    Haptics.selectionAsync().catch(() => {});
    track('onboarding_source', { from });
    remember({ heard_from: from });
    setTimeout(finish, 320);
  };

  const chip = (label: string, on: boolean, press: () => void) => (
    <Pressable key={label} onPress={press} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ height: 44, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1.5, borderColor: on ? c.accentText : c.border, backgroundColor: on ? c.panel : 'transparent', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
      <Text style={{ fontFamily: SANS_B, fontSize: 15, color: c.foreground }}>{label}</Text>
    </Pressable>
  );
  const head = (big: string, lit: string) => (
    <Text style={{ fontFamily: SERIF, fontSize: 42, lineHeight: 48, letterSpacing: -0.8, color: c.foreground }}>
      {big}{'\n'}<Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{lit}</Text>
    </Text>
  );
  const label = (text: string) => (
    <Text style={{ marginTop: 22, marginBottom: 10, fontFamily: 'CourierPrime_700Bold', fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: c.mutedForeground }}>{text}</Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 }}>
          <Text style={{ width: 60, fontFamily: SANS_B, fontSize: 13, color: c.mutedForeground }}>{L(`${step} of 3`, `${step} / 3`)}</Text>
          <GhostLight size={18} />
          <Pressable onPress={skip} hitSlop={12} accessibilityRole="button" accessibilityLabel={L('Skip this question', 'Bu soruyu geç')} style={{ width: 60, alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: SANS_B, fontSize: 14, color: c.foreground }}>{L('Skip', 'Geç')}</Text>
          </Pressable>
        </View>

        {step === 1 ? (
          <Animated.View key="1" entering={FadeIn.duration(360)} exiting={FadeOut.duration(160)} style={{ flex: 1, paddingHorizontal: 24, paddingTop: 10 }}>
            {head(L('What are you', 'Ne üzerinde'), L('working on?', 'çalışıyorsun?'))}
            <Text style={{ marginTop: 10, fontFamily: SANS, fontSize: 14.5, lineHeight: 20, color: c.mutedForeground }}>{L('One tap. It decides what we put first.', 'Tek dokunuş. Neyi önce göstereceğimi o belirler.')}</Text>
            <View style={{ marginTop: 24, gap: 10 }}>
              {WORKING_ON().map((o) => (
                <Pressable key={o.key} onPress={() => pickWorkingOn(o.key)} accessibilityRole="button"
                  style={({ pressed }) => ({ paddingVertical: 16, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1.5, borderColor: c.border, opacity: pressed ? 0.75 : 1 })}>
                  <Text style={{ fontFamily: SANS_B, fontSize: 18, color: c.foreground }}>{o.label}</Text>
                  <Text style={{ marginTop: 3, fontFamily: SANS, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground }}>{o.line}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        ) : step === 2 ? (
          <Animated.View key="2" entering={FadeIn.duration(360)} exiting={FadeOut.duration(160)} style={{ flex: 1, paddingHorizontal: 24, paddingTop: 10 }}>
            {head(L('What do', 'Ne tür roller'), L('you play?', 'oynarsın?'))}
            <Text style={{ marginTop: 10, fontFamily: SANS, fontSize: 14.5, lineHeight: 20, color: c.mutedForeground }}>{L('So the first speeches you see are ones you could be cast in.', 'Seni biraz tanımak için.')}</Text>
            {label(L('Mostly', 'ÇOĞUNLUKLA'))}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {HOUSES().map((h) => chip(h.label, house === h.key, () => { Haptics.selectionAsync().catch(() => {}); setHouse(house === h.key ? null : h.key); }))}
            </View>
            {label(L('Seen for', 'OYNADIĞIN YAŞ'))}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {AGES.map((a) => chip(ageLabel(a), age === a, () => { Haptics.selectionAsync().catch(() => {}); setAge(age === a ? null : a); }))}
            </View>
            <View style={{ flex: 1 }} />
            <PrimaryPill label={L('Continue', 'Devam')} onPress={savePlays} block height={54} style={{ marginBottom: 8, opacity: house || age ? 1 : 0.5 }} />
          </Animated.View>
        ) : (
          <Animated.View key="3" entering={FadeIn.duration(360)} exiting={FadeOut.duration(160)} style={{ flex: 1, paddingHorizontal: 24, paddingTop: 10 }}>
            {head(L('How did you', "Ghost Light'ı"), L('hear of us?', 'nereden duydun?'))}
            <Text style={{ marginTop: 10, fontFamily: SANS, fontSize: 14.5, lineHeight: 20, color: c.mutedForeground }}>{L('Just for us. It tells us where actors are finding Ghost Light.', "Sadece benim için. Oyuncuların Ghost Light'ı nerede bulduğunu bana söyler.")}</Text>
            <View style={{ marginTop: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SOURCES().map((s) => chip(s.label, false, () => pickSource(s.value)))}
            </View>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}
