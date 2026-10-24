import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryPill } from '../src/components/PrimaryPill';
import { CASTING_GROUPS, useCasting, type Casting } from '../src/lib/casting';
import { useTheme } from '../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SANS = 'BricolageGrotesque_500Medium';
const MONO_I = 'CourierPrime_400Regular_Italic';

/**
 * Who you play: a sheet of chips, one row per fact, the same chips the
 * filter sheet uses. One per row; tapping the one that is on turns it off.
 * Done keeps it and the search starts there from now on.
 */
export default function CastingSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const { casting, loaded, set } = useCasting();
  const [draft, setDraft] = useState<Casting>(casting);
  useEffect(() => { if (loaded) setDraft(casting); }, [loaded, casting]);

  const toggle = (key: keyof Casting, value: string) => {
    Haptics.selectionAsync().catch(() => {});
    setDraft(d => ({ ...d, [key]: d[key] === value ? undefined : value }) as Casting);
  };
  const done = async () => {
    await set(draft);
    router.back();
  };

  return (
    // One scrolling child and nothing beside it: the iOS form sheet lays out
    // a single scroll view, and a footer next to it left the sheet blank.
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
      <Text style={{ fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.8, color: c.accentText }}>(who you play.)</Text>
      <Text style={{ marginTop: 6, fontFamily: SERIF, fontSize: 32, lineHeight: 36, letterSpacing: -0.4, color: c.foreground }}>Search starts here.</Text>
      <Text style={{ marginTop: 8, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: c.mutedForeground }}>
        Every search opens with these on, until you change them. Leave a row empty to keep it open.
      </Text>
      {CASTING_GROUPS.map(g => (
        <View key={g.key} style={{ marginTop: 22 }}>
          <Text style={{ fontFamily: MONO_I, fontSize: 12.5, letterSpacing: 0.5, color: c.mutedForeground }}>{g.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {g.chips.map(ch => {
              const on = draft[g.key] === ch.value;
              return (
                <Pressable key={ch.value} onPress={() => toggle(g.key, ch.value)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: on ? c.ink : c.border, backgroundColor: on ? c.yellow : 'transparent' }}>
                  <Text style={{ fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.4, color: on ? c.ink : c.foreground }}>{ch.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <PrimaryPill label="Done" onPress={() => { void done(); }} height={54} block haptic="medium" style={{ marginTop: 30 }} />
    </ScrollView>
  );
}
