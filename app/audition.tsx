import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { StageDirection } from '../src/components/StageDirection';
import { LabelledField } from '../src/components/LabelledField';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useFavorites } from '../src/hooks/useFavorites';
import {
  useAuditions,
  useCreateAudition,
  useDeleteAudition,
  useParseNotice,
  useUpdateAudition,
} from '../src/hooks/useAuditions';
import {
  KIND_LABEL,
  ParseQuotaError,
  attachedPiece,
  type AuditionDraft,
  type AuditionKind,
  type ParsedDraft,
} from '../src/api/auditions';
import { useSession } from '../src/lib/useSession';
import { useGoBack } from '../src/lib/nav';
import { dayLabel, defaultAuditionDate, localTimeZone, timeLabel } from '../src/lib/when';
import { useTheme } from '../src/theme/ThemeContext';

/**
 * One audition, new or being changed. A modal over the list.
 *
 * The fast way in is the website's: paste the casting email and let the reader
 * fill the form. The slow way is always there under it: when, which project,
 * which role, where (or the tape link), notes, and which piece from the book.
 * On a phone, between the bus and the room, the point is to get the date in so
 * the reminder exists.
 */

const KINDS: AuditionKind[] = ['in_person', 'self_tape', 'virtual'];

/** What the reading line says while the parse runs. Same beats as the website. */
const READING_BEATS = [
  'Reading it.',
  'Finding the date and the room.',
  'Looking for what they want you to bring.',
  'Nearly there.',
];
const BEAT_MS = 1600;

export default function AuditionForm() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const goBack = useGoBack('/auditions');
  const { tiltX, tiltY } = useStageMotion();
  const { id, paste } = useLocalSearchParams<{ id?: string; paste?: string }>();
  const { isAuthenticated } = useSession();

  const { data: auditions } = useAuditions(isAuthenticated);
  const existing = useMemo(
    () => (id ? auditions?.find((a) => String(a.id) === id) ?? null : null),
    [auditions, id],
  );
  const { data: book } = useFavorites(isAuthenticated);

  const create = useCreateAudition();
  const update = useUpdateAudition();
  const remove = useDeleteAudition();
  const busy = create.isPending || update.isPending || remove.isPending;

  const [project, setProject] = useState('');
  const [role, setRole] = useState('');
  const [kind, setKind] = useState<AuditionKind>('in_person');
  const [when, setWhen] = useState<Date>(defaultAuditionDate());
  const [place, setPlace] = useState('');
  const [notes, setNotes] = useState('');
  const [pieceId, setPieceId] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);

  // The paste box: open on a new audition until a read fills the form.
  const [pasteOpen, setPasteOpen] = useState(!id);
  const [pasteText, setPasteText] = useState('');
  const [readLine, setReadLine] = useState<string | null>(null);
  const [beat, setBeat] = useState(0);
  const parse = useParseNotice();

  useEffect(() => {
    if (!parse.isPending) {
      setBeat(0);
      return;
    }
    const t = setInterval(() => setBeat((b) => Math.min(b + 1, READING_BEATS.length - 1)), BEAT_MS);
    return () => clearInterval(t);
  }, [parse.isPending]);

  // Fill from the server row once it arrives; never overwrite what someone has
  // already started typing.
  useEffect(() => {
    if (!existing || touched) return;
    setProject(existing.project);
    setRole(existing.role ?? '');
    setKind(existing.kind);
    if (existing.when) setWhen(new Date(existing.when));
    setPlace((existing.kind === 'self_tape' ? existing.tape_link : existing.location) ?? '');
    setNotes(existing.notes ?? '');
    setPieceId(attachedPiece(existing)?.monologue_id ?? null);
  }, [existing, touched]);

  const pasteFromClipboard = async () => {
    Haptics.selectionAsync().catch(() => {});
    const s = (await Clipboard.getStringAsync().catch(() => '')).trim();
    if (s) setPasteText(s);
    else setReadLine('(nothing on the clipboard yet. copy the email first.)');
  };

  /** The reader's draft, into the form. Low confidence is said, not hidden. */
  const applyDraft = (d: ParsedDraft) => {
    setTouched(true);
    if (d.project.value) setProject(d.project.value);
    if (d.role.value) setRole(d.role.value);
    const k = d.kind.value ?? 'in_person';
    setKind(k);
    const isTape = k === 'self_tape';
    const iso = isTape ? d.due_at.value : d.starts_at.value ?? d.due_at.value;
    const date = iso ? new Date(iso) : null;
    const dateOk = !!date && !Number.isNaN(date.getTime()) && date.getTime() > Date.now() - 60_000;
    if (dateOk) setWhen(date);
    if (!isTape && d.location.value) setPlace(d.location.value);
    const extra = [
      d.notes.value,
      d.casting.value ? `Casting: ${d.casting.value}` : null,
      d.bring.value ? `Bring: ${d.bring.value}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    if (extra) setNotes(extra);
    const conf = isTape ? d.due_at.confidence : d.starts_at.confidence;
    setReadLine(
      !dateOk
        ? "(read it, but couldn't find the date. pick one below.)"
        : conf === 'low'
          ? '(read it. not sure about the date, so check it.)'
          : '(read it. look it over and put it on the board.)',
    );
    setPasteOpen(false);
  };

  const readIt = () => {
    const text = pasteText.trim();
    if (!text || parse.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setReadLine(null);
    parse.mutate(
      { text, tz: localTimeZone() },
      {
        onSuccess: (r) => {
          if (r.ok) applyDraft(r.draft);
          else setReadLine("(couldn't read that one. fill it in below.)");
        },
        onError: (e) => {
          if (e instanceof ParseQuotaError) {
            const n = e.quota?.limit;
            setReadLine(
              n
                ? `(that was your ${n} free reads this month. fill it in below, that's always free.)`
                : "(no reads left this month. fill it in below, that's always free.)",
            );
          } else {
            setReadLine("(couldn't reach the reader. fill it in below.)");
          }
        },
      },
    );
  };

  const tape = kind === 'self_tape';
  const placeLabel = tape ? 'Where to send the tape (optional)' : kind === 'virtual' ? 'Meeting link (optional)' : 'Where (optional)';
  const canSave = project.trim().length > 0 && !busy;

  const onSave = () => {
    if (!canSave) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const iso = when.toISOString();
    const draft: AuditionDraft = {
      project: project.trim(),
      role: role.trim() || null,
      kind,
      tz: localTimeZone(),
      starts_at: tape ? null : iso,
      due_at: tape ? iso : null,
      location: tape ? null : place.trim() || null,
      tape_link: tape ? place.trim() || null : null,
      notes: notes.trim() || null,
    };
    const done = () => goBack();
    const fail = () => Alert.alert("Couldn't save", 'Check your connection and try again.');
    if (existing) {
      update.mutate({ id: existing.id, draft, monologueId: pieceId, current: existing }, { onSuccess: done, onError: fail });
    } else {
      create.mutate({ draft, monologueId: pieceId }, { onSuccess: done, onError: fail });
    }
  };

  const onDelete = () => {
    if (!existing) return;
    Alert.alert('Remove this audition?', 'Its reminders go with it. You can bring it back on the website for 30 days.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          remove.mutate(existing.id, { onSuccess: () => goBack() });
        },
      },
    ]);
  };

  const pickDate = (mode: 'date' | 'time') => {
    if (Platform.OS !== 'android') return;
    DateTimePickerAndroid.open({
      value: when,
      mode,
      onChange: (_e, d) => {
        if (d) {
          setTouched(true);
          setWhen(d);
        }
      },
    });
  };

  const label = {
    fontFamily: 'BricolageGrotesque_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: c.mutedForeground,
  };

  return (
    <View style={{ flex: 1 }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* A modal's own header: close on the left, the act on the right. */}
          <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
            <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={c.mutedForeground} />
            </Pressable>
            {existing ? (
              <Pressable onPress={onDelete} hitSlop={12} accessibilityRole="button" accessibilityLabel="Remove audition" disabled={busy}>
                <Ionicons name="trash-outline" size={20} color={c.mutedForeground} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
          >
            <Text style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 40, lineHeight: 46, letterSpacing: -0.6, color: c.foreground }}>
              {existing ? 'Change ' : 'Next '}
              <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}>
                {existing ? 'it.' : 'up.'}
              </Text>
            </Text>
            <StageDirection style={{ marginTop: 6 }}>
              {existing ? '(the reminders move with it.)' : "(we'll remind you the night before.)"}
            </StageDirection>

            {/* The fast way in: the casting email, read into the form. */}
            {!existing && pasteOpen ? (
              <View
                style={{
                  marginTop: 24,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.card,
                  padding: 14,
                }}
              >
                <Text style={label}>Paste the casting email</Text>
                <TextInput
                  multiline
                  value={pasteText}
                  onChangeText={setPasteText}
                  editable={!parse.isPending}
                  autoFocus={paste === '1'}
                  placeholder="Paste it here. The whole email is fine, signature and all."
                  placeholderTextColor={c.mutedForeground}
                  scrollEnabled
                  style={{
                    marginTop: 8,
                    minHeight: 96,
                    maxHeight: 180,
                    fontFamily: 'CourierPrime_400Regular',
                    fontSize: 13,
                    lineHeight: 19,
                    color: c.foreground,
                    textAlignVertical: 'top',
                  }}
                />
                {parse.isPending ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ fontFamily: 'BricolageGrotesque_500Medium', fontSize: 12.5, color: c.mutedForeground }}>
                      {READING_BEATS[beat]}
                    </Text>
                    <Sweep />
                  </View>
                ) : (
                  <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Pressable
                      onPress={pasteFromClipboard}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Paste from the clipboard"
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}
                    >
                      <Ionicons name="clipboard-outline" size={15} color={c.accentText} />
                      <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 13, color: c.accentText }}>Paste</Text>
                    </Pressable>
                    <PrimaryPill label="Read it" onPress={readIt} height={44} disabled={!pasteText.trim()} />
                  </View>
                )}
                {readLine && !parse.isPending ? (
                  <StageDirection numberOfLines={3} style={{ marginTop: 10 }}>{readLine}</StageDirection>
                ) : (
                  <StageDirection numberOfLines={1} style={{ marginTop: 10 }}>(or fill it in below. that's always free.)</StageDirection>
                )}
              </View>
            ) : !existing ? (
              <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <StageDirection numberOfLines={2} style={{ flex: 1 }}>{readLine ?? '(filled in by hand.)'}</StageDirection>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setPasteOpen(true);
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                >
                  <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 12, color: c.accentText }}>Paste another</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Kind: three words in a row, the chosen one in ink. */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
              {KINDS.map((k) => {
                const on = k === kind;
                return (
                  <Pressable
                    key={k}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setTouched(true);
                      setKind(k);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={{
                      paddingHorizontal: 14,
                      height: 36,
                      borderRadius: 999,
                      borderWidth: 1.5,
                      borderColor: on ? c.foreground : c.border,
                      backgroundColor: on ? c.foreground : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 13, color: on ? c.background : c.foreground }}>
                      {KIND_LABEL[k]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <LabelledField
              label="Project"
              value={project}
              onChangeText={(t) => {
                setTouched(true);
                setProject(t);
              }}
              autoCapitalize="words"
              returnKeyType="next"
              style={{ marginTop: 22 }}
            />
            <LabelledField
              label="Role (optional)"
              value={role}
              onChangeText={(t) => {
                setTouched(true);
                setRole(t);
              }}
              autoCapitalize="words"
              returnKeyType="next"
              style={{ marginTop: 10 }}
            />

            {/* When. iOS draws its compact pickers inline; Android opens a dialog. */}
            <Text style={[label, { marginTop: 26 }]}>{tape ? 'Tape due' : 'When'}</Text>
            {Platform.OS === 'ios' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginLeft: -8 }}>
                <DateTimePicker
                  value={when}
                  mode="date"
                  display="compact"
                  minimumDate={new Date()}
                  themeVariant={c.isLight ? 'light' : 'dark'}
                  accentColor={c.accentText}
                  onChange={(_e, d) => {
                    if (d) {
                      setTouched(true);
                      setWhen(d);
                    }
                  }}
                />
                <DateTimePicker
                  value={when}
                  mode="time"
                  display="compact"
                  themeVariant={c.isLight ? 'light' : 'dark'}
                  accentColor={c.accentText}
                  onChange={(_e, d) => {
                    if (d) {
                      setTouched(true);
                      setWhen(d);
                    }
                  }}
                />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <WhenChip label={dayLabel(when.toISOString())} onPress={() => pickDate('date')} />
                <WhenChip label={timeLabel(when.toISOString())} onPress={() => pickDate('time')} />
              </View>
            )}

            <LabelledField
              label={placeLabel}
              value={place}
              onChangeText={(t) => {
                setTouched(true);
                setPlace(t);
              }}
              autoCapitalize={tape || kind === 'virtual' ? 'none' : 'words'}
              keyboardType={tape || kind === 'virtual' ? 'url' : 'default'}
              autoCorrect={!(tape || kind === 'virtual')}
              style={{ marginTop: 16 }}
            />

            {/* The piece. Chips from the book; one at a time. */}
            <Text style={[label, { marginTop: 26 }]}>From your book</Text>
            {book && book.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 8, paddingVertical: 10, paddingRight: 24 }}
                style={{ marginHorizontal: -24, paddingHorizontal: 24 }}
              >
                {book.map((m) => {
                  const mid = Number(m.id);
                  const on = pieceId === mid;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setTouched(true);
                        setPieceId(on ? null : mid);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${m.title}, ${m.character}`}
                      style={{
                        maxWidth: 220,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 6,
                        borderWidth: 1.5,
                        borderColor: on ? c.ink : c.paperRule,
                        backgroundColor: c.paper,
                        // The chosen page sits square; the rest lean, like the shelf.
                        transform: [{ rotate: on ? '0deg' : '-0.6deg' }],
                      }}
                    >
                      <Text numberOfLines={1} style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 16, color: c.paperInk }}>
                        {m.title}
                      </Text>
                      <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: 'CourierPrime_400Regular', fontSize: 11, color: c.paperMuted }}>
                        {m.character}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <StageDirection style={{ marginTop: 10 }}>(save a piece and it can come with you.)</StageDirection>
            )}

            {/* Notes: what they want you to bring, who is in the room, anything.
                Its own block rather than a LabelledField: that one is a single
                34pt line with a label that floats over it. */}
            <Text style={[label, { marginTop: 26 }]}>Notes (optional)</Text>
            <TextInput
              multiline
              scrollEnabled={false}
              value={notes}
              onChangeText={(t) => {
                setTouched(true);
                setNotes(t);
              }}
              autoCapitalize="sentences"
              placeholder="Who's in the room, what to bring, anything."
              placeholderTextColor={c.mutedForeground}
              selectionColor={c.accentText}
              style={{
                marginTop: 4,
                minHeight: 44,
                paddingHorizontal: 2,
                paddingVertical: 8,
                fontFamily: 'BricolageGrotesque_500Medium',
                fontSize: 16,
                lineHeight: 22,
                color: c.foreground,
                textAlignVertical: 'top',
                borderBottomWidth: 1,
                borderBottomColor: c.border,
              }}
            />

            <PrimaryPill
              label={existing ? 'Save changes' : 'Put it on the board'}
              onPress={onSave}
              disabled={!canSave}
              block
              style={{ marginTop: 32 }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** The reading bar: a short light sweeping a track while the reader works. */
function Sweep() {
  const { colors: c } = useTheme();
  const x = useSharedValue(-60);
  useEffect(() => {
    x.value = -60;
    x.value = withRepeat(withTiming(360, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(x);
  }, [x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View style={{ marginTop: 8, height: 3, borderRadius: 2, backgroundColor: c.border, overflow: 'hidden' }}>
      <Animated.View style={[{ width: 60, height: 3, borderRadius: 2, backgroundColor: c.primary }, style]} />
    </View>
  );
}

function WhenChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ paddingHorizontal: 14, height: 40, borderRadius: 999, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 14, color: c.foreground }}>{label}</Text>
    </Pressable>
  );
}
