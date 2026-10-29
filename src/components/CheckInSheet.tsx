import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { PrimaryPill } from './PrimaryPill';
import { PRACTICE_LABEL, type PracticeEntry, type PracticeKind } from '../api/practice';
import { useCheckIn, useUncheck } from '../hooks/useNights';
import type { Streak } from '../rehearsal/streak';
import { useTheme } from '../theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const MONO_B = 'CourierPrime_700Bold';
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const KINDS: PracticeKind[] = ['speech', 'scene', 'class', 'audition', 'rehearsal'];

/** Today, as the server keys a check-in: the phone's own `YYYY-MM-DD`. */
function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Tonight, from the lamp on Search: the week as seven marks, the run of
 * nights, and "what did you work on?" with one tap for each kind of work,
 * the ones done away from the app as much as in it. A line of note if they
 * want one. What tonight already holds is listed, and a slip can be taken back.
 */
export function CheckInSheet({ open, streak, entries, onClose }: { open: boolean; streak: Streak; entries: PracticeEntry[]; onClose: () => void }) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const checkIn = useCheckIn();
  const uncheck = useUncheck();
  const [kind, setKind] = useState<PracticeKind | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setKind(null); setNote(''); } }, [open]);

  const tonight = entries.filter((e) => e.day === todayKey());
  const todayIndex = (new Date().getDay() + 6) % 7;
  const nights = streak.days;
  const line = nights === 0
    ? 'Tonight starts it.'
    : streak.today
      ? `${nights === 1 ? 'One night' : `${nights} nights`} running. Tonight is in.`
      : `${nights === 1 ? 'One night' : `${nights} nights`} running. Tonight keeps it going.`;

  const save = () => {
    if (!kind || checkIn.isPending) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    checkIn.mutate({ kind, note: note.trim() || null }, { onSuccess: () => { setKind(null); setNote(''); onClose(); } });
  };

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,7,4,0.66)' }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
          <View style={{ maxHeight: '88%', backgroundColor: c.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: c.border, paddingHorizontal: 24, paddingTop: 22, paddingBottom: Math.max(insets.bottom, 16) + 6 }}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 38, letterSpacing: -0.4, color: c.foreground }}>
                Tonight<Text style={{ fontFamily: SERIF_I, color: c.accentText }}>.</Text>
              </Text>
              <Text style={{ marginTop: 4, fontFamily: SANS, fontSize: 14, lineHeight: 19, color: c.mutedForeground }}>{line}</Text>

              {/* The week, Monday first: a lit mark for a night in the work. */}
              <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
                {WEEK.map((d, i) => {
                  const on = streak.week[i];
                  const now = i === todayIndex;
                  return (
                    <View key={i} style={{ alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: on ? c.accentText : now ? c.foreground : c.border, backgroundColor: on ? c.yellow : 'transparent' }} />
                      <Text style={{ fontFamily: MONO_B, fontSize: 10.5, letterSpacing: 1, color: now ? c.foreground : c.mutedForeground }}>{d}</Text>
                    </View>
                  );
                })}
              </View>

              {tonight.length ? (
                <View style={{ marginTop: 18 }}>
                  {tonight.map((e) => (
                    <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.divider }}>
                      <Ionicons name="checkmark-circle" size={18} color={c.accentText} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontFamily: SANS_B, fontSize: 14.5, color: c.foreground }}>{PRACTICE_LABEL[e.kind]}</Text>
                        {e.note ? <Text numberOfLines={2} style={{ marginTop: 1, fontFamily: SANS, fontSize: 13, color: c.mutedForeground }}>{e.note}</Text> : null}
                      </View>
                      <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); uncheck.mutate(e.id); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Take back ${PRACTICE_LABEL[e.kind]}`}>
                        <Ionicons name="close" size={18} color={c.mutedForeground} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              <Text style={{ marginTop: 22, fontFamily: SANS_B, fontSize: 17, color: c.foreground }}>
                {tonight.length ? 'Anything else tonight?' : 'What did you work on?'}
              </Text>
              <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {KINDS.map((k) => {
                  const on = kind === k;
                  return (
                    <Pressable key={k} onPress={() => { Haptics.selectionAsync().catch(() => {}); setKind(on ? null : k); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={{ height: 42, paddingHorizontal: 16, borderRadius: 21, borderWidth: 1.5, borderColor: on ? c.foreground : c.border, backgroundColor: on ? c.foreground : 'transparent', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: SANS_B, fontSize: 14.5, color: on ? c.background : c.foreground }}>{PRACTICE_LABEL[k]}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {kind ? (
                <Animated.View entering={FadeIn.duration(200)}>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="A line about it, if you like"
                    placeholderTextColor={c.chevron}
                    selectionColor={c.accentText}
                    maxLength={280}
                    returnKeyType="done"
                    onSubmitEditing={save}
                    accessibilityLabel="A note about tonight"
                    style={{ marginTop: 16, paddingVertical: 10, fontFamily: SANS, fontSize: 16, color: c.foreground, borderBottomWidth: 1.5, borderBottomColor: c.border }}
                  />
                </Animated.View>
              ) : null}

              {checkIn.isPending ? (
                <ActivityIndicator color={c.accentText} style={{ height: 52, marginTop: 20 }} />
              ) : (
                <PrimaryPill label="Done" onPress={save} block height={52} style={{ marginTop: 20, opacity: kind ? 1 : 0.45 }} />
              )}
              {checkIn.isError ? (
                <Text style={{ marginTop: 10, textAlign: 'center', fontFamily: SANS, fontSize: 13, color: c.accentText }}>That did not save. Try again in a moment.</Text>
              ) : null}
            </ScrollView>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
