import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { PrimaryPill } from '../src/components/PrimaryPill';
import { StageDirection } from '../src/components/StageDirection';
import { useAddCallback, useAudition, useLogOutcome, usePatchAudition } from '../src/hooks/useAuditions';
import { track } from '../src/lib/analytics';
import { useGoBack } from '../src/lib/nav';
import { useSession } from '../src/lib/useSession';
import { useTheme } from '../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const MONO_I = 'CourierPrime_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';

type Word = 'callback' | 'booked' | 'waiting' | 'passed';
const WORDS: { key: Word; label: string; line: string }[] = [
  { key: 'callback', label: 'Callback', line: '(they want more.)' },
  { key: 'booked', label: 'Booked', line: '(you got it.)' },
  { key: 'waiting', label: 'Waiting', line: '(no word yet.)' },
  { key: 'passed', label: 'Passed', line: '(next one.)' },
];

/**
 * The evening after: how did it go, in a word and then in your own. Comes up
 * from the reminder, or from the file. One tap logs the word; Callback turns
 * the button into "Set the callback", which opens the form with the same
 * project and part. The note is yours to keep, on the audition.
 */
export default function OutcomeSheet() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const goBack = useGoBack('/auditions');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useSession();
  const a = useAudition(id ? Number(id) : null, isAuthenticated && Boolean(id));
  const outcome = useLogOutcome();
  const patch = usePatchAudition();
  const callback = useAddCallback();
  const [word, setWord] = useState<Word | null>(null);
  const [note, setNote] = useState('');
  const busy = outcome.isPending || patch.isPending || callback.isPending;
  const when = useMemo(() => {
    if (!a?.when) return null;
    const d = new Date(a.when);
    return `${d.toLocaleDateString(undefined, { weekday: 'long' })} · ${a.kind === 'self_tape' ? 'Self-tape' : a.kind === 'virtual' ? 'Virtual' : 'In the room'}`;
  }, [a]);

  const saveNote = () => {
    const text = note.trim();
    if (!a || !text) return;
    patch.mutate({ id: a.id, patch: { after_notes: { ...(a.after_notes ?? {}), how: text } } });
  };
  const log = (w: Word) => {
    if (!a) return;
    if (w === 'callback') outcome.mutate({ id: a.id, outcome: 'callback' });
    else if (w === 'passed') outcome.mutate({ id: a.id, outcome: 'no' });
    else if (w === 'booked') patch.mutate({ id: a.id, patch: { status: 'booked' } });
    else outcome.mutate({ id: a.id, outcome: 'good' });
    track('app_audition_outcome', { outcome: w === 'callback' ? 'callback' : w === 'passed' ? 'no' : 'good' });
  };
  const done = () => {
    if (!a || !word) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    log(word);
    saveNote();
    if (word === 'callback') {
      // The callback has no date yet, so it opens on the form to get one, with the project and the part already in.
      callback.mutate(a.id, { onSuccess: (cb) => router.replace({ pathname: '/audition', params: { id: String(cb.id) } }), onError: goBack });
      return;
    }
    goBack();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 32 }}>
        <Text style={{ fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.8, color: c.accentText }}>(how did it go?)</Text>
        <Text style={{ marginTop: 8, fontFamily: SERIF, fontSize: 34, lineHeight: 38, letterSpacing: -0.5, color: c.foreground }}>
          {a ? a.project : '…'}{a?.role ? <Text style={{ fontFamily: SERIF_I }}>{`, ${a.role}.`}</Text> : a ? '.' : ''}
        </Text>
        {when ? <Text style={{ marginTop: 4, fontFamily: SANS, fontSize: 15, color: c.mutedForeground }}>{when}</Text> : null}

        <View style={{ marginTop: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {WORDS.map((w) => {
            const on = word === w.key;
            return (
              <Pressable key={w.key} onPress={() => { Haptics.selectionAsync().catch(() => {}); setWord(w.key); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ width: '47%', flexGrow: 1, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 14, borderWidth: 1.5, borderColor: on ? c.ink : c.border, backgroundColor: on ? c.ink : c.card }}>
                <Text style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 30, color: on ? c.card : c.foreground }}>{w.label}</Text>
                <Text style={{ marginTop: 2, fontFamily: MONO_I, fontSize: 12, color: on ? c.yellow : c.mutedForeground }}>{w.line}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ marginTop: 26, fontFamily: SANS_B, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: c.mutedForeground }}>A note for next time</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="What they asked for. What landed."
          placeholderTextColor={c.mutedForeground}
          selectionColor={c.accentText}
          style={{ marginTop: 8, minHeight: 64, fontFamily: SANS, fontSize: 16, lineHeight: 23, color: c.foreground, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.divider }}
        />

        <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={goBack} hitSlop={10} accessibilityRole="button">
            <Text style={{ fontFamily: SANS_B, fontSize: 15, color: c.mutedForeground }}>Later</Text>
          </Pressable>
          <PrimaryPill label={word === 'callback' ? 'Set the callback' : 'Done'} onPress={done} disabled={!a || !word || busy} height={52} haptic="medium" />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
