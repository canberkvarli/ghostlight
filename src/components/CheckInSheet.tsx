import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { PrimaryPill } from './PrimaryPill';
import { WeekMarks } from './WeekMarks';
import { PRACTICE_LABEL, type PracticeEntry, type PracticeKind } from '../api/practice';
import { useCheckIn, useUncheck } from '../hooks/useNights';
import type { Streak } from '../rehearsal/streak';
import { useTheme } from '../theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const KINDS: PracticeKind[] = ['speech', 'scene', 'class', 'audition', 'rehearsal'];

/** Today, as the server keys a check-in: the phone's own `YYYY-MM-DD`. */
function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Check in tonight, from the profile: what you worked on, a line if you like,
 * Done. Today's circle takes its check in front of you and the sheet goes
 * down. Mostly for the work done away from the app (class, an audition, a
 * rehearsal for a show); a scene run or a speech opened counts by itself.
 */
export function CheckInSheet({ open, streak, entries, onClose }: { open: boolean; streak: Streak; entries: PracticeEntry[]; onClose: () => void }) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const checkIn = useCheckIn();
  const uncheck = useUncheck();
  const [kind, setKind] = useState<PracticeKind | null>(null);
  const [note, setNote] = useState('');
  const [stamped, setStamped] = useState(false);
  // The week as it stood when the sheet opened, so the check lands on it rather than appearing with the refetch.
  const [week, setWeek] = useState(streak.week);

  useEffect(() => {
    if (!open) return;
    setKind(null);
    setNote('');
    setStamped(false);
    setWeek(streak.week);
    // Only as it opens: the streak moves under it once the check-in lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The sheet rises and settles, and goes back down before it is gone.
  const [mounted, setMounted] = useState(open);
  const y = useSharedValue(height);
  const dim = useSharedValue(0);
  useEffect(() => {
    if (open) {
      setMounted(true);
      y.value = height;
      y.value = withTiming(0, { duration: 340, easing: Easing.out(Easing.cubic) });
      dim.value = withTiming(1, { duration: 280 });
    } else if (mounted) {
      dim.value = withTiming(0, { duration: 280 });
      y.value = withTiming(height, { duration: 300, easing: Easing.in(Easing.cubic) }, (done) => { if (done) runOnJS(setMounted)(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));

  const tonight = entries.filter((e) => e.day === todayKey());
  const night = streak.today ? streak.days : streak.days + 1;

  const save = () => {
    if (!kind || checkIn.isPending || stamped) return;
    checkIn.mutate({ kind, note: note.trim() || null }, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        // The check lands, is seen, and then the sheet goes.
        setStamped(true);
        setTimeout(onClose, 1100);
      },
    });
  };

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(12,7,4,0.66)' }, dimStyle]} />
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
          <Animated.View style={[{ maxHeight: '88%', backgroundColor: c.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, borderColor: c.border, paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 6 }, sheetStyle]}>
            <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: c.divider, marginBottom: 14 }} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 38, letterSpacing: -0.4, color: c.foreground }}>
                {stamped ? `Night ${night}` : 'Tonight'}<Text style={{ fontFamily: SERIF_I, color: c.accentText }}>.</Text>
              </Text>
              <Text style={{ marginTop: 4, fontFamily: SANS, fontSize: 14, lineHeight: 19, color: c.mutedForeground }}>
                {stamped
                  ? 'Tonight is in.'
                  : streak.days === 0
                    ? 'Tonight starts it.'
                    : `${streak.days === 1 ? 'One night' : `${streak.days} nights`} running.${streak.today ? ' Tonight is in.' : ''}`}
              </Text>
              <View style={{ marginTop: 16 }}><WeekMarks week={week} stamp={stamped} size={32} /></View>

              {tonight.length && !stamped ? (
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

              <View style={{ opacity: stamped ? 0.35 : 1 }} pointerEvents={stamped ? 'none' : 'auto'}>
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
              </View>

              {checkIn.isPending ? (
                <ActivityIndicator color={c.accentText} style={{ height: 52, marginTop: 20 }} />
              ) : (
                <PrimaryPill label={stamped ? 'Checked in' : 'Done'} onPress={save} block height={52} style={{ marginTop: 20, opacity: kind && !stamped ? 1 : 0.45 }} />
              )}
              {checkIn.isError ? (
                <Text style={{ marginTop: 10, textAlign: 'center', fontFamily: SANS, fontSize: 13, color: c.accentText }}>That did not save. Try again in a moment.</Text>
              ) : null}
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
