import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import Animated, { Easing, FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { PrimaryPill } from './PrimaryPill';
import { WeekMarks } from './WeekMarks';
import { PRACTICE_LABEL, type PracticeEntry, type PracticeKind } from '../api/practice';
import { useCheckIn, useUncheck } from '../hooks/useNights';
import { clock, minutesLabel, secondsOf, tonightTimer, useElapsed, useTonightSession } from '../lib/tonightTimer';
import type { Streak } from '../rehearsal/streak';
import { useTheme } from '../theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const MONO_I = 'CourierPrime_400Regular_Italic';
const KINDS: PracticeKind[] = ['speech', 'scene', 'class', 'audition', 'rehearsal'];
const MARK = require('../../assets/ghostlight-lamp.png');

/** Today, as the server keys a check-in: the phone's own `YYYY-MM-DD`. */
function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** What a session is, said as you are in it: "a speech", "class". */
function working(kind: PracticeKind): string {
  const l = PRACTICE_LABEL[kind];
  return l.startsWith('A ') || l.startsWith('An ') ? l.charAt(0).toLowerCase() + l.slice(1) : l.toLowerCase();
}

function milestone(n: number): string | null {
  if (n === 7) return 'A whole week of nights.';
  if (n === 30) return 'Thirty nights. That is a habit now.';
  if (n === 100) return 'A hundred nights in the work.';
  return null;
}

type Step = 'choose' | 'away' | 'logged';

/**
 * Tonight, from the pill on Search. A timer first: choose what you are working
 * on, Start, and the clock runs while you work, kept on the phone so leaving
 * the app loses nothing. End is the finish: today's circle fills and the check
 * lands, the night is counted, tonight's minutes are said, and a line about it
 * if you want one. Work that cannot be timed (class, an audition) is logged
 * from "I did it away from the app" and finishes the same way.
 */
export function CheckInSheet({ open, streak, entries, onClose }: { open: boolean; streak: Streak; entries: PracticeEntry[]; onClose: () => void }) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const session = useTonightSession();
  const elapsed = useElapsed(session);
  const checkIn = useCheckIn();
  const uncheck = useUncheck();
  const [step, setStep] = useState<Step>('choose');
  const [kind, setKind] = useState<PracticeKind>('speech');
  const [note, setNote] = useState('');
  // The night as it stood before this check-in, so the finish says the right number.
  const [before, setBefore] = useState<Streak>(streak);

  const tonight = entries.filter((e) => e.day === todayKey());
  const running = session != null && session.endedAt == null;
  const ended = session != null && session.endedAt != null;
  const phase = running ? 'running' : ended ? 'finish' : step;

  useEffect(() => {
    if (!open) return;
    setStep('choose');
    setNote('');
    setBefore(streak);
    setKind(entries[0]?.kind ?? 'speech');
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
      dim.value = withTiming(0, { duration: 260 });
      y.value = withTiming(height, { duration: 280, easing: Easing.in(Easing.cubic) }, (done) => { if (done) runOnJS(setMounted)(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));

  const nightNumber = before.today ? before.days : before.days + 1;
  const minutesTonight = tonight.reduce((n, e) => n + (e.seconds ?? 0), 0) + (ended && session ? secondsOf(session) : 0);

  const start = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    tonightTimer.start(kind);
  };
  const end = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBefore(streak);
    tonightTimer.end();
  };
  // A timed session is saved as the finish is put away, by Done or by closing it: the night is never lost.
  const saveTimed = (then: () => void) => {
    if (!session || checkIn.isPending) return;
    checkIn.mutate(
      { kind: session.kind, note: note.trim() || null, seconds: secondsOf(session) },
      // The sheet goes down still showing the finish; the session is let go once it is out of sight.
      { onSuccess: () => { then(); setTimeout(() => tonightTimer.clear(), 320); } },
    );
  };
  const saveAway = () => {
    if (checkIn.isPending) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBefore(streak);
    checkIn.mutate({ kind, note: note.trim() || null }, { onSuccess: () => setStep('logged') });
  };
  const close = () => {
    if (phase === 'finish') { saveTimed(onClose); return; }
    onClose();
  };

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(12,7,4,0.66)' }, dimStyle]} />
          <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close" />
          <Animated.View style={[{ maxHeight: '90%', backgroundColor: c.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, borderColor: c.border, paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 6 }, sheetStyle]}>
            <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: c.divider, marginBottom: 14 }} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Animated.View key={phase} entering={FadeIn.duration(280)}>
                {phase === 'running' && session ? (
                  <Running kind={session.kind} seconds={elapsed} onEnd={end} onCancel={() => { Haptics.selectionAsync().catch(() => {}); tonightTimer.clear(); }} />
                ) : phase === 'finish' || phase === 'logged' ? (
                  <Finish
                    night={nightNumber}
                    week={before.week}
                    minutes={minutesTonight}
                    timed={phase === 'finish'}
                    note={note}
                    onNote={setNote}
                    busy={checkIn.isPending}
                    onDone={() => (phase === 'finish' ? saveTimed(onClose) : onClose())}
                    onResume={phase === 'finish' ? () => { Haptics.selectionAsync().catch(() => {}); tonightTimer.resume(); } : undefined}
                  />
                ) : (
                  <>
                    <Text style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 38, letterSpacing: -0.4, color: c.foreground }}>
                      Tonight<Text style={{ fontFamily: SERIF_I, color: c.accentText }}>.</Text>
                    </Text>
                    <Text style={{ marginTop: 4, fontFamily: SANS, fontSize: 14, lineHeight: 19, color: c.mutedForeground }}>
                      {streak.days === 0
                        ? 'Tonight starts it.'
                        : `${streak.days === 1 ? 'One night' : `${streak.days} nights`} running.${streak.today ? ' Tonight is in.' : ' Tonight keeps it going.'}`}
                    </Text>
                    <View style={{ marginTop: 16 }}><WeekMarks week={streak.week} /></View>

                    {tonight.length ? (
                      <View style={{ marginTop: 18 }}>
                        {tonight.map((e) => (
                          <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.divider }}>
                            <Ionicons name="checkmark-circle" size={18} color={c.accentText} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ fontFamily: SANS_B, fontSize: 14.5, color: c.foreground }}>
                                {PRACTICE_LABEL[e.kind]}{e.seconds ? <Text style={{ fontFamily: SANS, color: c.mutedForeground }}>{`  ${minutesLabel(e.seconds)}`}</Text> : null}
                              </Text>
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
                      {phase === 'away' ? 'What did you do?' : 'What are you working on?'}
                    </Text>
                    <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {KINDS.map((k) => {
                        const on = kind === k;
                        return (
                          <Pressable key={k} onPress={() => { Haptics.selectionAsync().catch(() => {}); setKind(k); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                            style={{ height: 42, paddingHorizontal: 16, borderRadius: 21, borderWidth: 1.5, borderColor: on ? c.foreground : c.border, backgroundColor: on ? c.foreground : 'transparent', justifyContent: 'center' }}>
                            <Text style={{ fontFamily: SANS_B, fontSize: 14.5, color: on ? c.background : c.foreground }}>{PRACTICE_LABEL[k]}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {phase === 'away' ? (
                      <>
                        <NoteField value={note} onChange={setNote} onSubmit={saveAway} />
                        {checkIn.isPending ? (
                          <ActivityIndicator color={c.accentText} style={{ height: 52, marginTop: 20 }} />
                        ) : (
                          <PrimaryPill label="Log it" onPress={saveAway} block height={52} style={{ marginTop: 20 }} />
                        )}
                        <Link label="Time it instead" onPress={() => setStep('choose')} />
                      </>
                    ) : (
                      <>
                        <PrimaryPill label="Start" onPress={start} block height={52} haptic="none" style={{ marginTop: 22 }} />
                        <Link label="I did it away from the app" onPress={() => setStep('away')} />
                      </>
                    )}
                  </>
                )}
                {checkIn.isError ? (
                  <Text style={{ marginTop: 10, textAlign: 'center', fontFamily: SANS, fontSize: 13, color: c.accentText }}>That did not save. Try again in a moment.</Text>
                ) : null}
              </Animated.View>
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** The session on the clock: the lamp breathing, the time, what it is, End. */
function Running({ kind, seconds, onEnd, onCancel }: { kind: PracticeKind; seconds: number; onEnd: () => void; onCancel: () => void }) {
  const { colors: c } = useTheme();
  const glow = useSharedValue(0.55);
  useEffect(() => {
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), withTiming(0.55, { duration: 1600, easing: Easing.inOut(Easing.sin) })), -1);
  }, [glow]);
  const lamp = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <View style={{ alignItems: 'center', paddingTop: 6 }}>
      <Animated.View style={[{ shadowColor: c.yellow, shadowOpacity: 0.8, shadowRadius: 22, shadowOffset: { width: 0, height: 0 } }, lamp]}>
        <Image source={MARK} style={{ width: 88, height: 88, marginVertical: -8 }} contentFit="contain" accessibilityIgnoresInvertColors />
      </Animated.View>
      <Text accessibilityRole="timer" accessibilityLabel={`${minutesLabel(seconds)} so far`}
        style={{ marginTop: 18, fontFamily: SERIF, fontSize: 76, lineHeight: 82, letterSpacing: -1, color: c.foreground, fontVariant: ['tabular-nums'] }}>
        {clock(seconds)}
      </Text>
      <Text style={{ marginTop: 2, fontFamily: MONO_I, fontSize: 14, color: c.mutedForeground }}>{`(working on ${working(kind)}.)`}</Text>
      <Text style={{ marginTop: 14, textAlign: 'center', fontFamily: SANS, fontSize: 13, lineHeight: 18, color: c.mutedForeground }}>
        The screen stays on. Leave the app if you need to; the clock keeps going.
      </Text>
      <View style={{ alignSelf: 'stretch' }}>
        <PrimaryPill label="End" onPress={onEnd} block height={52} haptic="none" style={{ marginTop: 22 }} />
      </View>
      <Link label="Cancel this session" onPress={onCancel} />
    </View>
  );
}

/** The finish: the night counted, the week with today's check landing, tonight's minutes, a line about it. */
function Finish({ night, week, minutes, timed, note, onNote, busy, onDone, onResume }: {
  night: number; week: boolean[]; minutes: number; timed: boolean; note: string; onNote: (s: string) => void; busy: boolean; onDone: () => void; onResume?: () => void;
}) {
  const { colors: c } = useTheme();
  const mark = milestone(night);
  return (
    <View>
      <Text style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 48, letterSpacing: -0.5, color: c.foreground }}>
        Night {night}<Text style={{ fontFamily: SERIF_I, color: c.accentText }}>.</Text>
      </Text>
      <Text style={{ marginTop: 4, fontFamily: SANS, fontSize: 15, lineHeight: 20, color: c.mutedForeground }}>
        {mark ?? (minutes > 0 ? `${minutesLabel(minutes).replace(/^./, (s) => s.toUpperCase())} tonight.` : 'Tonight is in.')}
      </Text>
      {mark && minutes > 0 ? <Text style={{ marginTop: 2, fontFamily: SANS, fontSize: 15, color: c.mutedForeground }}>{`${minutesLabel(minutes).replace(/^./, (s) => s.toUpperCase())} tonight.`}</Text> : null}
      <View style={{ marginTop: 20 }}><WeekMarks week={week} stamp size={34} /></View>
      {timed ? <NoteField value={note} onChange={onNote} onSubmit={onDone} /> : null}
      {busy ? (
        <ActivityIndicator color={c.accentText} style={{ height: 52, marginTop: 22 }} />
      ) : (
        <PrimaryPill label="Done" onPress={onDone} block height={52} style={{ marginTop: 22 }} />
      )}
      {onResume ? <Link label="Keep going" onPress={onResume} /> : null}
    </View>
  );
}

function NoteField({ value, onChange, onSubmit }: { value: string; onChange: (s: string) => void; onSubmit: () => void }) {
  const { colors: c } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="A line about it, if you like"
      placeholderTextColor={c.chevron}
      selectionColor={c.accentText}
      maxLength={280}
      returnKeyType="done"
      onSubmitEditing={onSubmit}
      accessibilityLabel="A note about tonight"
      style={{ marginTop: 18, paddingVertical: 10, fontFamily: SANS, fontSize: 16, color: c.foreground, borderBottomWidth: 1.5, borderBottomColor: c.border }}
    />
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} hitSlop={8} accessibilityRole="button"
      style={({ pressed }) => ({ alignSelf: 'center', marginTop: 16, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ fontFamily: SANS_B, fontSize: 14, color: c.accentText }}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={c.accentText} />
    </Pressable>
  );
}
